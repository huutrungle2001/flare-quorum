import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeDeployData,
  getAddress,
  http,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  evaluateFoundationRegistration,
  evmKeyType,
  foundationSenderReadAbi,
  teeManagerRegistrationAbi,
} from "../flare/fcc-foundation-registration.mjs";
import { setLocalEnvironmentValues } from "../flare/local-fcc-secrets.mjs";
import { compareMarketRuntime } from "../flare/market-runtime-verifier.mjs";

const root = resolve(import.meta.dirname, "../..");
const execute = process.argv.includes("--execute");
const statePath = resolve(root, ".local/fcc/foundation-registration.state.json");
const evidencePath = resolve(root, "evidence/coston2/fcc-extension-registration.json");
const foundations = JSON.parse(readFileSync(resolve(root, "tooling/flare/coston2-foundations.json"), "utf8"));
const artifact = JSON.parse(readFileSync(
  resolve(root, "packages/flare-contracts/out/VeilBidFoundationSenderV2.sol/VeilBidFoundationSenderV2.json"),
  "utf8",
));
const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
const rawKey = process.env.FLARE_DEPLOYMENT_PRIVATE_KEY?.trim();
if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
if (!rawKey) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_MISSING");
const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_INVALID");
}
const bytecode = artifact.bytecode?.object;
if (typeof bytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(bytecode)) {
  throw new Error("FOUNDATION_V2_BYTECODE_MISSING");
}

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const manager = getAddress(foundations.contracts.flareTeeManager);
const declaredDeployer = getAddress(foundations.network.declaredDeployer);
const account = privateKeyToAccount(privateKey);
if (account.address !== declaredDeployer) throw new Error("DECLARED_DEPLOYER_MISMATCH");

const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const transport = http(rpcUrl, { timeout: 15_000, retryCount: 2 });
const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({ account, chain, transport });

function writeJsonAtomic(path, value, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  chmodSync(temporary, mode);
  renameSync(temporary, path);
  chmodSync(path, mode);
}

function readState() {
  if (!existsSync(statePath)) return { schemaVersion: 1, sourceCommit, manager, deployer: account.address };
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (
    state.schemaVersion !== 1 || state.sourceCommit !== sourceCommit ||
    getAddress(state.manager) !== manager || getAddress(state.deployer) !== account.address
  ) throw new Error("FCC_REGISTRATION_STATE_MISMATCH");
  return state;
}

async function wait(hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  if (receipt.status !== "success") throw new Error("FCC_REGISTRATION_TRANSACTION_FAILED");
  return receipt;
}

async function writeManager(functionName, args) {
  const simulation = await publicClient.simulateContract({
    account,
    address: manager,
    abi: teeManagerRegistrationAbi,
    functionName,
    args,
  });
  const hash = await walletClient.writeContract(simulation.request);
  return { hash, receipt: await wait(hash) };
}

async function writeSender(sender, functionName, args) {
  const simulation = await publicClient.simulateContract({
    account,
    address: sender,
    abi: foundationSenderReadAbi,
    functionName,
    args,
  });
  const hash = await walletClient.writeContract(simulation.request);
  return { hash, receipt: await wait(hash) };
}

const [chainId, balance, managerCode, nextPublicExtensionId, allOwnersAllowed, ownerExplicitlyAllowed] =
  await Promise.all([
    publicClient.getChainId(),
    publicClient.getBalance({ address: account.address }),
    publicClient.getCode({ address: manager }),
    publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "nextPublicExtensionId" }),
    publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "allExtensionOwnersAllowed" }),
    publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedExtensionOwner", args: [account.address] }),
  ]);
const preflight = {
  chainIdMatches: chainId === 114,
  managerCodePresent: managerCode !== undefined && managerCode !== "0x",
  deployerMatchesDeclaredWallet: account.address === declaredDeployer,
  deployerHasGas: balance >= BigInt(foundations.network.minimumGasBalanceWei),
  publicExtensionRangeActive: nextPublicExtensionId >= 0x10000n,
  deployerMayRegisterExtension: allOwnersAllowed || ownerExplicitlyAllowed,
  artifactIsV2: artifact.abi.some((item) =>
    item.type === "function" && item.name === "FOUNDATION_SENDER_VERSION" &&
    item.outputs?.length === 1 && item.outputs[0].type === "uint16"
  ),
};
if (!Object.values(preflight).every(Boolean)) throw new Error("FCC_REGISTRATION_PREFLIGHT_FAILED");
if (!execute) {
  console.log(JSON.stringify({
    status: "READY",
    scope: "preflight only; no transaction sent",
    chainId,
    deployer: account.address,
    manager,
    nextPublicExtensionId: nextPublicExtensionId.toString(),
    balanceWei: balance.toString(),
    preflight,
  }, null, 2));
  process.exit(0);
}
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "") {
  throw new Error("FCC_REGISTRATION_REQUIRES_CLEAN_WORKTREE");
}
if (existsSync(evidencePath)) throw new Error("FCC_REGISTRATION_EVIDENCE_ALREADY_EXISTS");

const state = readState();
let deploymentReceipt;
if (!state.deploymentTransaction) {
  state.deploymentTransaction = await walletClient.deployContract({
    account,
    abi: artifact.abi,
    bytecode,
    args: [manager, manager],
  });
  writeJsonAtomic(statePath, state);
}
deploymentReceipt = await wait(state.deploymentTransaction);
if (!deploymentReceipt.contractAddress) throw new Error("FOUNDATION_V2_DEPLOYMENT_ADDRESS_MISSING");
const sender = getAddress(deploymentReceipt.contractAddress);
state.sender = sender;
writeJsonAtomic(statePath, state);

let extensionId = state.extensionId ? BigInt(state.extensionId) : undefined;
let registrationReceipt;
if (state.registrationTransaction) {
  registrationReceipt = await wait(state.registrationTransaction);
  if (!extensionId) {
    const events = parseEventLogs({
      abi: teeManagerRegistrationAbi,
      logs: registrationReceipt.logs,
      eventName: "TeeExtensionRegistered",
      strict: true,
    });
    if (events.length !== 1) throw new Error("FCC_EXTENSION_REGISTRATION_EVENT_INVALID");
    extensionId = events[0].args.extensionId;
  }
}
if (!extensionId) {
  const expectedExtensionId = BigInt(state.expectedExtensionId ?? nextPublicExtensionId);
  const senderAtExpected = await publicClient.readContract({
    address: manager,
    abi: teeManagerRegistrationAbi,
    functionName: "getTeeExtensionInstructionsSender",
    args: [expectedExtensionId],
  });
  if (getAddress(senderAtExpected) === sender) {
    const recoveredEvents = await publicClient.getContractEvents({
      address: manager,
      abi: teeManagerRegistrationAbi,
      eventName: "TeeExtensionContractsSet",
      args: { teeExtensionInstructionsSender: sender },
      fromBlock: deploymentReceipt.blockNumber,
      toBlock: "latest",
      strict: true,
    });
    const recovered = recoveredEvents.find((event) => event.args.extensionId === expectedExtensionId);
    if (!recovered?.transactionHash) throw new Error("FCC_REGISTRATION_TRANSACTION_RECOVERY_FAILED");
    state.registrationTransaction = recovered.transactionHash;
    registrationReceipt = await wait(state.registrationTransaction);
    extensionId = expectedExtensionId;
  } else {
    state.expectedExtensionId = nextPublicExtensionId.toString();
    writeJsonAtomic(statePath, state);
    const registration = await writeManager("register", [zeroAddress, sender]);
    state.registrationTransaction = registration.hash;
    registrationReceipt = registration.receipt;
    const events = parseEventLogs({
      abi: teeManagerRegistrationAbi,
      logs: registrationReceipt.logs,
      eventName: "TeeExtensionRegistered",
      strict: true,
    });
    if (events.length !== 1) throw new Error("FCC_EXTENSION_REGISTRATION_EVENT_INVALID");
    extensionId = events[0].args.extensionId;
  }
  state.extensionId = extensionId.toString();
  writeJsonAtomic(statePath, state);
}
if (!registrationReceipt || !state.registrationTransaction) {
  throw new Error("FCC_REGISTRATION_RECEIPT_MISSING");
}

const currentBinding = await publicClient.readContract({
  address: sender,
  abi: foundationSenderReadAbi,
  functionName: "getExtensionId",
});
let bindingReceipt;
if (currentBinding === 0n) {
  const binding = await writeSender(sender, "setExtensionIdExplicit", [extensionId]);
  state.bindingTransaction = binding.hash;
  bindingReceipt = binding.receipt;
  writeJsonAtomic(statePath, state);
} else if (currentBinding !== extensionId) {
  throw new Error("FOUNDATION_V2_EXTENSION_BINDING_CONFLICT");
} else if (state.bindingTransaction) {
  bindingReceipt = await wait(state.bindingTransaction);
}

let machineOwnerAllowed = await publicClient.readContract({
  address: manager, abi: teeManagerRegistrationAbi,
  functionName: "isAllowedTeeMachineOwner", args: [extensionId, account.address],
});
if (!machineOwnerAllowed) {
  const transaction = await writeManager("addAllowedTeeMachineOwners", [extensionId, [account.address]]);
  state.machineOwnerTransaction = transaction.hash;
  writeJsonAtomic(statePath, state);
}
let walletProjectOwnerAllowed = await publicClient.readContract({
  address: manager, abi: teeManagerRegistrationAbi,
  functionName: "isAllowedTeeWalletProjectOwner", args: [extensionId, account.address],
});
if (!walletProjectOwnerAllowed) {
  const transaction = await writeManager("addAllowedTeeWalletProjectOwners", [extensionId, [account.address]]);
  state.walletProjectOwnerTransaction = transaction.hash;
  writeJsonAtomic(statePath, state);
}
let evmSupported = await publicClient.readContract({
  address: manager, abi: teeManagerRegistrationAbi,
  functionName: "isKeyTypeSupported", args: [extensionId, evmKeyType],
});
if (!evmSupported) {
  const transaction = await writeManager("addSupportedKeyTypes", [extensionId, [evmKeyType]]);
  state.keyTypeTransaction = transaction.hash;
  writeJsonAtomic(statePath, state);
}

const [
  runtime,
  deploymentTransaction,
  finalNextPublicExtensionId,
  registeredSender,
  registeredStateVerifier,
  senderChainId,
  senderVersion,
  senderOwner,
  senderRegistry,
  senderMachineRegistry,
  senderExtensionId,
  finalMachineOwnerAllowed,
  finalWalletProjectOwnerAllowed,
  finalEvmSupported,
] = await Promise.all([
  publicClient.getCode({ address: sender }),
  publicClient.getTransaction({ hash: state.deploymentTransaction }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "nextPublicExtensionId" }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionInstructionsSender", args: [extensionId] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionStateVerifier", args: [extensionId] }),
  publicClient.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "COSTON2_CHAIN_ID" }),
  publicClient.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "FOUNDATION_SENDER_VERSION" }),
  publicClient.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "owner" }),
  publicClient.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "teeExtensionRegistry" }),
  publicClient.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "teeMachineRegistry" }),
  publicClient.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "getExtensionId" }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeMachineOwner", args: [extensionId, account.address] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeWalletProjectOwner", args: [extensionId, account.address] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isKeyTypeSupported", args: [extensionId, evmKeyType] }),
]);
if (!runtime || runtime === "0x") throw new Error("FOUNDATION_V2_RUNTIME_MISSING");
const decoded = decodeDeployData({ abi: artifact.abi, bytecode, data: deploymentTransaction.input });
if (
  decoded.args?.length !== 2 ||
  decoded.args.some((value) => getAddress(value) !== manager)
) throw new Error("FOUNDATION_V2_CONSTRUCTOR_MISMATCH");
const registeredEvents = parseEventLogs({
  abi: teeManagerRegistrationAbi,
  logs: registrationReceipt.logs,
  eventName: "TeeExtensionRegistered",
  strict: true,
});
const registeredOwner = registeredEvents.find((event) => event.args.extensionId === extensionId)?.args.owner;
const runtimeComparison = compareMarketRuntime(artifact, runtime);
const verification = evaluateFoundationRegistration({
  chainId,
  declaredDeployer,
  deployer: account.address,
  manager,
  sender,
  runtimeComparison,
  deploymentReceipt,
  registrationReceipt,
  extensionId,
  nextPublicExtensionId: finalNextPublicExtensionId,
  registeredOwner,
  registeredSender,
  registeredStateVerifier,
  senderChainId,
  senderVersion,
  senderOwner,
  senderRegistry,
  senderMachineRegistry,
  senderExtensionId,
  machineOwnerAllowed: finalMachineOwnerAllowed,
  walletProjectOwnerAllowed: finalWalletProjectOwnerAllowed,
  evmKeyTypeSupported: finalEvmSupported,
});
if (verification.status !== "PASSED") throw new Error("FCC_FOUNDATION_REGISTRATION_VERIFICATION_FAILED");

const evidence = {
  schemaVersion: 1,
  gate: "FCC_EXTENSION_REGISTRATION",
  status: "REGISTERED_BOUND_CONFIGURATION_READY",
  recordedAt: new Date().toISOString(),
  sourceCommit,
  network: { name: "flare-coston2", chainId: 114 },
  publicIdentifiers: {
    manager,
    foundationSender: sender,
    extensionId: extensionId.toString(),
    extensionIdHex: `0x${extensionId.toString(16).padStart(64, "0")}`,
    deployer: account.address,
    deploymentTransaction: state.deploymentTransaction,
    deploymentBlock: deploymentReceipt.blockNumber.toString(),
    registrationTransaction: state.registrationTransaction,
    registrationBlock: registrationReceipt.blockNumber.toString(),
    bindingTransaction: state.bindingTransaction ?? null,
    runtimeHash: runtimeComparison.runtimeHash,
    maskedRuntimeHash: runtimeComparison.maskedRuntimeHash,
    artifactMaskedRuntimeHash: runtimeComparison.artifactMaskedRuntimeHash,
    machineOwnerTransaction: state.machineOwnerTransaction ?? null,
    walletProjectOwnerTransaction: state.walletProjectOwnerTransaction ?? null,
    keyTypeTransaction: state.keyTypeTransaction ?? null,
  },
  assertions: verification.assertions,
  blockers: [
    "CODE_VERSION_NOT_ALLOWED",
    "THREE_PRODUCTION_MACHINES_NOT_REGISTERED",
    "LIVE_FCC_FOUNDATION_ACTION_NOT_VERIFIED",
  ],
  notes: [
    "This evidence proves only deployment, extension registration, explicit ID binding, owner allowlists, and EVM key-type configuration.",
    "It does not claim a production TEE, FCC action result, Gate A pass, or bounty completion.",
    "No RPC URL, private key, wallet signature, proxy credential, attestation body, or bid data is recorded.",
  ],
};
writeJsonAtomic(evidencePath, evidence, 0o644);
setLocalEnvironmentValues(resolve(root, ".env.local"), {
  FCC_EXTENSION_ID: evidence.publicIdentifiers.extensionIdHex,
  FCC_FOUNDATION_SENDER: sender,
});
console.log(JSON.stringify({
  status: evidence.status,
  foundationSender: sender,
  extensionId: extensionId.toString(),
  deploymentTransaction: state.deploymentTransaction,
  registrationTransaction: state.registrationTransaction,
  assertions: verification.assertions,
  evidence: "evidence/coston2/fcc-extension-registration.json",
}, null, 2));
