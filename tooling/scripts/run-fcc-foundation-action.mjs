import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  foundationBindingHash,
  veilBidFoundationOpType,
  veilBidFoundationPingV1OpCommand,
  verifyFoundationActionResponse,
} from "../../packages/flare-bindings/dist/fcc-result.js";
import { normalizePrivateKey } from "../flare/foundations.mjs";

const root = resolve(import.meta.dirname, "../..");
const evidencePath = resolve(root, "evidence/coston2/gate-a-fcc-result.json");
const registrationPath = resolve(root, "evidence/coston2/fcc-extension-registration.json");
const codeVersionPath = resolve(root, "evidence/coston2/fcc-code-version.json");
const machinesPath = resolve(root, "evidence/coston2/fcc-machines.json");

const managerAbi = parseAbi([
  "event TeeInstructionsSent(uint256 indexed extensionId, bytes32 indexed instructionId, uint32 indexed rewardEpochId, (address teeId,address teeProxyId,string url)[] teeMachines, bytes32 opType, bytes32 opCommand, bytes message, address[] cosigners, uint64 cosignersThreshold, address claimBackAddress, uint256 fee)",
  "function getRandomTeeIds(uint256 extensionId, uint256 count) view returns (address[] ids)",
  "function getTeeMachineStatus(address teeId) view returns (uint8)",
  "function getExtensionId(address teeId) view returns (uint256)",
  "function getTeeMachineWithAttestationData(address teeId) view returns ((address teeId,address initialTeeId,string url,bytes32 codeHash,bytes32 platform))",
]);
const senderAbi = parseAbi([
  "function getExtensionId() view returns (uint256)",
  "function sendFoundationPing((uint16 schemaVersion,uint256 chainId,address market,bytes32 requestNonce,bytes32 payloadHash) request) payable returns (bytes32)",
]);

const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [process.env.COSTON2_RPC_URL ?? ""] } },
};
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

function sameHex(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function actionResultUrl(base, actionId) {
  return `${String(base).replace(/\/+$/, "")}/action/result/${actionId}`;
}

async function fetchResult(url, request, allowedTeeIds, expectedVersion, attempts = 24) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    lastStatus = response.status;
    if (response.ok) {
      const value = await response.json();
      const verified = await verifyFoundationActionResponse(value, {
        actionId: request.actionId,
        chainId: 114n,
        allowedTeeIds,
        expectedVersion,
        expectedRequest: request.fields,
      });
      return { value, verified, attempts: attempt + 1 };
    }
    if (response.status !== 404 && response.status !== 202) {
      throw new Error(`FCC_FOUNDATION_RESULT_HTTP_${response.status}`);
    }
    await sleep(5_000);
  }
  throw new Error(`FCC_FOUNDATION_RESULT_UNAVAILABLE_${lastStatus}`);
}

function verifyInFreshProcess(url, request, allowedTeeIds, expectedVersion) {
  const child = [
    "const input = JSON.parse(process.argv[1]);",
    "const { verifyFoundationActionResponse } = await import(input.bindingsPath);",
    "const response = await fetch(input.url, { headers: { accept: 'application/json' }, redirect: 'error' });",
    "if (!response.ok) throw new Error(`HTTP_${response.status}`);",
    "const value = await response.json();",
    "await verifyFoundationActionResponse(value, { actionId: input.actionId, chainId: 114n, allowedTeeIds: input.allowedTeeIds, expectedVersion: input.expectedVersion, expectedRequest: { ...input.fields, chainId: BigInt(input.fields.chainId) } });",
    "process.stdout.write('verified');",
  ].join("\n");
  const input = JSON.stringify({
    url,
    actionId: request.actionId,
    fields: { ...request.fields, chainId: request.fields.chainId.toString() },
    allowedTeeIds,
    expectedVersion,
    bindingsPath: new URL("../../packages/flare-bindings/dist/fcc-result.js", import.meta.url).href,
  });
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", child, input], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 || result.stdout !== "verified") {
    throw new Error("FCC_FOUNDATION_FRESH_PROCESS_RECOVERY_FAILED");
  }
}

async function main() {
  const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
  const privateKey = normalizePrivateKey(process.env.FLARE_DEPLOYMENT_PRIVATE_KEY);
  if (!rpcUrl || !/^https:\/\//.test(rpcUrl)) throw new Error("FCC_GATE_A_RPC_INVALID");
  if (!/^0x[0-9a-f]{64}$/i.test(privateKey ?? "")) throw new Error("FCC_GATE_A_KEY_INVALID");

  const registration = JSON.parse(readFileSync(registrationPath, "utf8"));
  const codeVersion = JSON.parse(readFileSync(codeVersionPath, "utf8"));
  const machinesEvidence = JSON.parse(readFileSync(machinesPath, "utf8"));
  const manager = getAddress(registration.publicIdentifiers.manager);
  const sender = getAddress(registration.publicIdentifiers.foundationSender);
  const extensionId = BigInt(registration.publicIdentifiers.extensionId);
  // The release manifest uses the display form `v0.2.2`, while tee-node's
  // ActionResponse carries the wire form `0.2.2`.
  const expectedVersion = String(codeVersion.publicIdentifiers.version).replace(/^v/, "");
  const machineByTeeId = new Map(
    machinesEvidence.publicIdentifiers.machines.map((machine) => [machine.teeId.toLowerCase(), machine]),
  );
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl, { timeout: 20_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  const [chainId, configuredExtensionId, selectedTeeIds] = await Promise.all([
    publicClient.getChainId(),
    publicClient.readContract({ address: sender, abi: senderAbi, functionName: "getExtensionId" }),
    publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getRandomTeeIds", args: [extensionId, 1n] }),
  ]);
  if (chainId !== 114 || configuredExtensionId !== extensionId) throw new Error("FCC_GATE_A_SENDER_BINDING_INVALID");
  if (!Array.isArray(selectedTeeIds) || selectedTeeIds.length !== 1) throw new Error("FCC_GATE_A_TEE_SELECTION_INVALID");
  const selectedTeeId = getAddress(selectedTeeIds[0]);
  const selectedMachine = machineByTeeId.get(selectedTeeId.toLowerCase());
  if (!selectedMachine) throw new Error("FCC_GATE_A_SELECTED_TEE_NOT_IN_EVIDENCE");

  const fields = {
    schemaVersion: 1,
    chainId: 114n,
    market: sender,
    requestNonce: keccak256(stringToHex(`VEILBID_GATE_A_NONCE_${Date.now()}_${Math.random()}`)),
    payloadHash: keccak256(stringToHex("VEILBID_GATE_A_PUBLIC_SAFE_PING_V1")),
  };
  const expectedBindingHash = foundationBindingHash(fields);
  const transactionHash = await walletClient.writeContract({
    account,
    address: sender,
    abi: senderAbi,
    functionName: "sendFoundationPing",
    args: [fields],
    value: 1_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") throw new Error("FCC_GATE_A_DISPATCH_REVERTED");
  const instructionEvents = parseEventLogs({
    abi: managerAbi,
    logs: receipt.logs,
    eventName: "TeeInstructionsSent",
    strict: false,
  }).filter((event) => event.args.extensionId === extensionId);
  if (instructionEvents.length !== 1) throw new Error("FCC_GATE_A_INSTRUCTION_EVENT_INVALID");
  const instruction = instructionEvents[0].args;
  const actionId = instruction.instructionId;
  const eventMachine = instruction.teeMachines?.[0];
  if (!eventMachine || getAddress(eventMachine.teeId) !== selectedTeeId) throw new Error("FCC_GATE_A_MACHINE_EVENT_MISMATCH");
  if (eventMachine.url !== selectedMachine.url) throw new Error("FCC_GATE_A_URL_EVENT_MISMATCH");
  const resultUrl = actionResultUrl(selectedMachine.url, actionId);
  const fetched = await fetchResult(resultUrl, { actionId, fields }, [selectedTeeId], expectedVersion);
  const registeredAtBlock = receipt.blockNumber;
  const [status, registeredExtensionId, machineRecord] = await Promise.all([
    publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [selectedTeeId], blockNumber: registeredAtBlock }),
    publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getExtensionId", args: [selectedTeeId], blockNumber: registeredAtBlock }),
    publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineWithAttestationData", args: [selectedTeeId], blockNumber: registeredAtBlock }),
  ]);
  const registeredTeeSigner = getAddress(fetched.verified.teeId);
  const assertions = {
    dispatchTransactionSucceeded: receipt.status === "success",
    instructionBoundToExtension: instruction.extensionId === extensionId,
    instructionOperationMatches: sameHex(instruction.opCommand, veilBidFoundationPingV1OpCommand) && sameHex(instruction.opType, veilBidFoundationOpType),
    resultRetrieved: fetched.verified.response.result.id.toLowerCase() === actionId.toLowerCase(),
    resultStatusSuccess: fetched.verified.response.result.status === 1,
    resultBindingMatches: fetched.verified.result.bindingHash === expectedBindingHash,
    signingDomainVerified: fetched.verified.signingDigest.startsWith("0x") && fetched.verified.actionResultHash.startsWith("0x"),
    signerRegisteredProduction: registeredTeeSigner === selectedTeeId && Number(status) === 2,
    signerExtensionMatches: registeredExtensionId === extensionId,
    signerUrlMatches: machineRecord.url === selectedMachine.url,
    signerCodeHashMatches: sameHex(machineRecord.codeHash, codeVersion.publicIdentifiers.codeHash),
    signerPlatformMatches: sameHex(machineRecord.platform, codeVersion.publicIdentifiers.platform),
    wrongBindingRejected: false,
    freshProcessRecoveryVerified: false,
  };
  try {
    await verifyFoundationActionResponse(fetched.value, {
      actionId,
      chainId: 114n,
      allowedTeeIds: [selectedTeeId],
      expectedVersion,
      expectedRequest: { ...fields, payloadHash: keccak256(stringToHex("VEILBID_GATE_A_WRONG_PAYLOAD")) },
    });
  } catch (error) {
    assertions.wrongBindingRejected = error instanceof Error && error.message === "FCC_FOUNDATION_REQUEST_MISMATCH";
  }
  verifyInFreshProcess(resultUrl, { actionId, fields }, [selectedTeeId], expectedVersion);
  assertions.freshProcessRecoveryVerified = true;
  const block = await publicClient.getBlock({ blockNumber: registeredAtBlock });
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const evidence = {
    schemaVersion: 1,
    gate: "A",
    status: Object.values(assertions).every(Boolean) ? "PASSED" : "FAILED",
    recordedAt: new Date().toISOString(),
    sourceCommit,
    network: { name: "flare-coston2", chainId: 114, blockNumber: registeredAtBlock.toString(), blockTimestamp: Number(block.timestamp) },
    publicIdentifiers: {
      manager,
      foundationSender: sender,
      extensionId: extensionId.toString(),
      teeId: selectedTeeId,
      proxyUrl: selectedMachine.url,
      requestTransaction: transactionHash,
      requestBlock: registeredAtBlock.toString(),
      instructionId: actionId,
      actionResultHash: fetched.verified.actionResultHash,
      signingDigest: fetched.verified.signingDigest,
      bindingHash: fetched.verified.result.bindingHash,
      expectedBindingHash,
      submissionTag: fetched.verified.response.result.submissionTag,
      status: fetched.verified.response.result.status,
      extensionVersion: expectedVersion,
      codeHash: codeVersion.publicIdentifiers.codeHash,
      platform: codeVersion.publicIdentifiers.platform,
      feeWei: "1000000",
    },
    assertions,
    notes: [
      "This evidence records a public-safe PING_V1 FCC result and its TEE signer mapping on Coston2.",
      "The extension runs in SIMULATED_TEE mode; this does not claim hardware-backed attestation.",
      "No raw ActionResponse, signature, private key, credential, bid payload, or proxy/indexer secret is recorded.",
    ],
  };
  if (evidence.status !== "PASSED") throw new Error("FCC_GATE_A_ASSERTIONS_FAILED");
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ gate: evidence.gate, status: evidence.status, blockNumber: evidence.network.blockNumber, teeId: selectedTeeId, instructionId: actionId, evidence: "evidence/coston2/gate-a-fcc-result.json" }, null, 2));
}

await main();
