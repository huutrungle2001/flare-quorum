import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, getAddress, http, parseEventLogs, stringToHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { setLocalEnvironmentValues } from "../flare/local-fcc-secrets.mjs";
import { evmKeyType, teeManagerRegistrationAbi } from "../flare/fcc-foundation-registration.mjs";
import { readV2ReleasePlan } from "../flare/v2-release.mjs";

const root = resolve(import.meta.dirname, "../..");
const execute = process.argv.includes("--execute");
const v2 = process.env.FCC_RELEASE_PROFILE?.trim().toLowerCase() === "v2";
const v2Plan = v2 ? readV2ReleasePlan(root) : undefined;
const profile = v2 ? {
  label: "V2",
  contractName: "FlareQuorumMarketV2",
  state: ".local/fcc/market-v2-extension-registration.state.json",
  evidence: v2Plan.artifacts.extensionRegistrationEvidence,
  candidate: v2Plan.artifacts.candidateManifest,
  extensionEnvironmentName: v2Plan.runtimeEnvironment.extensionId,
} : {
  label: "V1",
  contractName: "VeilBidFlareMarket",
  state: ".local/fcc/market-extension-registration.state.json",
  evidence: "evidence/coston2/fcc-market-extension-registration.json",
  candidate: "packages/flare-contracts/deployments/coston2.market-candidate.json",
  extensionEnvironmentName: "FCC_MARKET_EXTENSION_ID",
};
const statePath = resolve(root, profile.state);
const evidencePath = resolve(root, profile.evidence);
const candidate = JSON.parse(readFileSync(resolve(root, profile.candidate), "utf8"));
const codeVersion = JSON.parse(readFileSync(resolve(root, "evidence/coston2/fcc-code-version.json"), "utf8"));
const foundations = JSON.parse(readFileSync(resolve(root, "tooling/flare/coston2-foundations.json"), "utf8"));
const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
const rawKey = process.env.FLARE_DEPLOYMENT_PRIVATE_KEY?.trim();
if (!rpcUrl || !rawKey) throw new Error("FCC_MARKET_EXTENSION_CONFIGURATION_MISSING");
const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_INVALID");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const manager = getAddress(foundations.contracts.flareTeeManager);
const sender = getAddress(candidate.contracts[profile.contractName].address);
const account = privateKeyToAccount(privateKey);
if (account.address !== getAddress(foundations.network.declaredDeployer)) throw new Error("DECLARED_DEPLOYER_MISMATCH");
try {
  execFileSync("git", ["merge-base", "--is-ancestor", candidate.sourceCommit, sourceCommit], { cwd: root, stdio: "ignore" });
} catch {
  throw new Error(`${profile.label}_MARKET_CANDIDATE_SOURCE_NOT_ANCESTOR`);
}
if (existsSync(evidencePath)) throw new Error(`FCC_MARKET_${profile.label}_EXTENSION_EVIDENCE_ALREADY_EXISTS`);

const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const transport = http(rpcUrl, { timeout: 15_000, retryCount: 2 });
const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({ account, chain, transport });
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { schemaVersion: 1, sourceCommit, manager, sender };
if (state.schemaVersion !== 1 || state.sourceCommit !== sourceCommit || getAddress(state.manager) !== manager || getAddress(state.sender) !== sender) {
  throw new Error(`FCC_MARKET_${profile.label}_EXTENSION_STATE_MISMATCH`);
}
const writeState = () => {
  mkdirSync(resolve(root, ".local/fcc"), { recursive: true, mode: 0o700 });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
};
const wait = async (hash) => {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  if (receipt.status !== "success") throw new Error(`FCC_MARKET_${profile.label}_EXTENSION_TRANSACTION_FAILED`);
  return receipt;
};
const send = async (functionName, args) => {
  const simulation = await publicClient.simulateContract({ account, address: manager, abi: teeManagerRegistrationAbi, functionName, args });
  const hash = await walletClient.writeContract(simulation.request);
  return { hash, receipt: await wait(hash) };
};
const [chainId, balance, nextPublicExtensionId, ownerAllowed, allOwnersAllowed] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getBalance({ address: account.address }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "nextPublicExtensionId" }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedExtensionOwner", args: [account.address] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "allExtensionOwnersAllowed" }),
]);
const preflight = {
  chainIdMatches: chainId === 114,
  managerCodePresent: (await publicClient.getCode({ address: manager })) !== "0x",
  marketCodePresent: (await publicClient.getCode({ address: sender })) !== "0x",
  deployerMayRegister: ownerAllowed || allOwnersAllowed,
  publicExtensionRangeActive: nextPublicExtensionId >= 0x10000n,
  codeHashPresent: /^0x[0-9a-f]{64}$/i.test(codeVersion.publicIdentifiers.codeHash ?? ""),
  platformIsSimulated: codeVersion.publicIdentifiers.platform.toLowerCase() === stringToHex("TEST_PLATFORM", { size: 32 }).toLowerCase(),
};
if (!Object.values(preflight).every(Boolean)) throw new Error(`FCC_MARKET_${profile.label}_EXTENSION_PREFLIGHT_FAILED`);
if (!execute) {
  console.log(JSON.stringify({ status: "READY", profile: profile.label, scope: "preflight only; no transaction sent", manager, sender, nextPublicExtensionId: nextPublicExtensionId.toString(), balanceWei: balance.toString(), preflight }, null, 2));
  process.exit(0);
}
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "") throw new Error("FCC_MARKET_EXTENSION_REQUIRES_CLEAN_WORKTREE");

let extensionId = state.extensionId ? BigInt(state.extensionId) : undefined;
let registrationReceipt;
if (state.registrationTransaction) {
  registrationReceipt = await wait(state.registrationTransaction);
  if (!extensionId) {
    const events = parseEventLogs({ abi: teeManagerRegistrationAbi, logs: registrationReceipt.logs, eventName: "TeeExtensionRegistered", strict: true });
    if (events.length !== 1) throw new Error("FCC_MARKET_EXTENSION_EVENT_INVALID");
    extensionId = events[0].args.extensionId;
  }
} else {
  const registration = await send("register", [zeroAddress, sender]);
  state.registrationTransaction = registration.hash;
  registrationReceipt = registration.receipt;
  const events = parseEventLogs({ abi: teeManagerRegistrationAbi, logs: registrationReceipt.logs, eventName: "TeeExtensionRegistered", strict: true });
  if (events.length !== 1) throw new Error("FCC_MARKET_EXTENSION_EVENT_INVALID");
  extensionId = events[0].args.extensionId;
  state.extensionId = extensionId.toString();
  writeState();
}
if (!extensionId || extensionId < 0x10000n) throw new Error(`FCC_MARKET_${profile.label}_EXTENSION_ID_INVALID`);

const addIfMissing = async (readFunctionName, readArgs, writeFunctionName, writeArgs) => {
  const already = await publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: readFunctionName, args: readArgs });
  if (already) return null;
  const transaction = await send(writeFunctionName, writeArgs);
  state[`${writeFunctionName}Transaction`] = transaction.hash;
  writeState();
  return transaction;
};
await addIfMissing("isAllowedTeeMachineOwner", [extensionId, account.address], "addAllowedTeeMachineOwners", [extensionId, [account.address]]);
await addIfMissing("isAllowedTeeWalletProjectOwner", [extensionId, account.address], "addAllowedTeeWalletProjectOwners", [extensionId, [account.address]]);
const keySupported = await publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isKeyTypeSupported", args: [extensionId, evmKeyType] });
if (!keySupported) {
  const transaction = await send("addSupportedKeyTypes", [extensionId, [evmKeyType]]);
  state.keyTypeTransaction = transaction.hash;
  writeState();
}
const version = stringToHex(codeVersion.publicIdentifiers.version, { size: 32 });
const codeHash = codeVersion.publicIdentifiers.codeHash;
const platform = codeVersion.publicIdentifiers.platform;
const supportedVersion = await publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isCodeHashPlatformSupported", args: [extensionId, codeHash, platform] });
if (!supportedVersion) {
  const transaction = await send("addTeeVersion", [extensionId, version, codeHash, [platform]]);
  state.codeVersionTransaction = transaction.hash;
  writeState();
}
const [registeredSender, registeredOwner, machineOwnerAllowed, walletOwnerAllowed, keyTypeSupported, codeHashPlatformSupported, codeHashInfo] = await Promise.all([
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionInstructionsSender", args: [extensionId] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionStateVerifier", args: [extensionId] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeMachineOwner", args: [extensionId, account.address] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeWalletProjectOwner", args: [extensionId, account.address] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isKeyTypeSupported", args: [extensionId, evmKeyType] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isCodeHashPlatformSupported", args: [extensionId, codeHash, platform] }),
  publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "getCodeHashInfo", args: [extensionId, codeHash] }),
]);
const assertions = {
  ...preflight,
  registrationSucceeded: registrationReceipt.status === "success",
  extensionIdPublic: extensionId < await publicClient.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "nextPublicExtensionId" }),
  senderMatchesMarket: getAddress(registeredSender) === sender,
  stateVerifierIsZero: getAddress(registeredOwner) === zeroAddress,
  machineOwnerAllowed: machineOwnerAllowed === true,
  walletProjectOwnerAllowed: walletOwnerAllowed === true,
  keyTypeSupported: keyTypeSupported === true,
  codeHashPlatformSupported: codeHashPlatformSupported === true,
  versionMatches: codeHashInfo[0].toLowerCase() === version.toLowerCase(),
  platformMatches: codeHashInfo[1].length === 1 && codeHashInfo[1][0].toLowerCase() === platform.toLowerCase(),
};
if (!Object.values(assertions).every(Boolean)) throw new Error(`FCC_MARKET_${profile.label}_EXTENSION_VERIFICATION_FAILED`);
const evidence = {
  schemaVersion: 1,
  gate: v2 ? "FCC_MARKET_V2_EXTENSION_REGISTRATION" : "FCC_MARKET_EXTENSION_REGISTRATION",
  status: "REGISTERED_BOUND_CONFIGURATION_READY",
  recordedAt: new Date().toISOString(),
  sourceCommit,
  network: { name: "flare-coston2", chainId: 114, blockNumber: registrationReceipt.blockNumber.toString() },
  publicIdentifiers: { manager, sender, extensionId: extensionId.toString(), extensionIdHex: `0x${extensionId.toString(16).padStart(64, "0")}`, codeHash, platform, version: codeVersion.publicIdentifiers.version, registrationTransaction: state.registrationTransaction },
  assertions,
  blockers: ["PRODUCT_TEE_MACHINES_NOT_REGISTERED", "GATES_C_E_NOT_PASSED"],
  notes: [
    `The immutable ${profile.contractName} is the registered instructions sender for this product extension.`,
    v2
      ? "V2 requires three fresh TEE machine identities; no V1 machine may be reused or retired by this flow."
      : "The three foundation machines remain separate; product machines are registered independently before tender creation.",
    "No deployment key, proxy credential, attestation body, raw signature, or bid data is recorded.",
  ],
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
setLocalEnvironmentValues(resolve(root, ".env.local"), {
  [profile.extensionEnvironmentName]: `0x${extensionId.toString(16).padStart(64, "0")}`,
});
console.log(JSON.stringify({ gate: evidence.gate, status: evidence.status, profile: profile.label, extensionId: extensionId.toString(), sender, registrationTransaction: state.registrationTransaction, assertions, evidence: profile.evidence }, null, 2));
