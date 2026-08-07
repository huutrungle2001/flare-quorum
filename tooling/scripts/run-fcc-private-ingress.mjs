import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  stringToHex,
} from "viem";
import {
  decodeBidReceipt,
  directBidInstruction,
  encodePrivateBidSubmission,
  encryptPrivateBidForTee,
  parseFccActionResponse,
  privateBidCommitment,
  recoverBidReceiptSigner,
  teeIdentityFromPublicKey,
  veilBidDirectOpType,
  veilBidDirectSubmitCommand,
} from "../../packages/flare-bindings/dist/index.js";
import { calculateFlareRulesHash } from "../../packages/flare-bindings/dist/smart-account.js";

const root = resolve(import.meta.dirname, "../..");
const evidencePath = resolve(root, "evidence/coston2/gate-b-fcc-ingress.json");
const registrationPath = resolve(root, "evidence/coston2/fcc-extension-registration.json");
const codeVersionPath = resolve(root, "evidence/coston2/fcc-code-version.json");
const machinesPath = resolve(root, "evidence/coston2/fcc-machines.json");

const managerAbi = [{
  type: "function",
  name: "getTeeMachineStatus",
  stateMutability: "view",
  inputs: [{ name: "teeId", type: "address" }],
  outputs: [{ name: "", type: "uint8" }],
}, {
  type: "function",
  name: "getExtensionId",
  stateMutability: "view",
  inputs: [{ name: "teeId", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}, {
  type: "function",
  name: "getTeeMachineWithAttestationData",
  stateMutability: "view",
  inputs: [{ name: "teeId", type: "address" }],
  outputs: [{
    name: "",
    type: "tuple",
    components: [
      { name: "teeId", type: "address" },
      { name: "initialTeeId", type: "address" },
      { name: "url", type: "string" },
      { name: "codeHash", type: "bytes32" },
      { name: "platform", type: "bytes32" },
    ],
  }],
}];

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

function requiredApiKeys() {
  return [1, 2, 3].map((index) => {
    const value = process.env[`FCC_DIRECT_API_KEY_${index}`];
    if (typeof value !== "string" || value.length < 32) throw new Error("FCC_GATE_B_API_KEY_MISSING");
    return value;
  });
}

async function readMachineInfo(url) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/info`, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`FCC_GATE_B_INFO_HTTP_${response.status}`);
  const body = await response.json();
  const machineData = body?.machineData;
  const publicKey = machineData?.publicKey;
  if (!publicKey || typeof publicKey.x !== "string" || typeof publicKey.y !== "string") {
    throw new Error("FCC_GATE_B_INFO_KEY_INVALID");
  }
  const teeId = teeIdentityFromPublicKey({ x: publicKey.x, y: publicKey.y });
  return { teeId, publicKey: { x: publicKey.x, y: publicKey.y }, machineData };
}

async function sendDirect(url, apiKey, ciphertext) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/direct`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, accept: "application/json" },
    body: JSON.stringify(directBidInstruction(ciphertext)),
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`FCC_GATE_B_DIRECT_HTTP_${response.status}`);
  const action = await response.json();
  if (
    action?.data?.type !== "direct" || action?.data?.submissionTag !== "submit" ||
    typeof action?.data?.id !== "string" || !/^0x[0-9a-f]{64}$/i.test(action.data.id)
  ) throw new Error("FCC_GATE_B_DIRECT_ACTION_INVALID");
  return action.data.id.toLowerCase();
}

async function readResult(url, actionId, attempts = 36) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`${url.replace(/\/+$/, "")}/action/result/${actionId}`, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    lastStatus = response.status;
    if (response.ok) return response.json();
    if (response.status !== 404 && response.status !== 202) {
      throw new Error(`FCC_GATE_B_RESULT_HTTP_${response.status}`);
    }
    await sleep(5_000);
  }
  throw new Error(`FCC_GATE_B_RESULT_TIMEOUT_${lastStatus}`);
}

async function verifyReceipt(value, context, teeId) {
  const response = parseFccActionResponse(value);
  if (
    response.result.id.toLowerCase() !== context.actionId.toLowerCase() ||
    response.result.submissionTag !== "submit" ||
    response.result.opType !== veilBidDirectOpType ||
    response.result.opCommand !== veilBidDirectSubmitCommand
  ) throw new Error("FCC_GATE_B_RESULT_BINDING_INVALID");
  const receipt = decodeBidReceipt(response.result.data);
  const signer = await recoverBidReceiptSigner(receipt);
  const assertions = {
    actionIdMatches: response.result.id.toLowerCase() === context.actionId.toLowerCase(),
    resultStatusSuccess: response.result.status === 1,
    operationMatches: response.result.opType === veilBidDirectOpType && response.result.opCommand === veilBidDirectSubmitCommand,
    receiptSchemaMatches: receipt.schemaVersion === 1,
    receiptNetworkMatches: receipt.chainId === 114n,
    receiptMarketMatches: sameHex(receipt.market, context.submission.market),
    receiptExtensionMatches: receipt.extensionId === context.submission.extensionId,
    receiptCodeVersionMatches: sameHex(receipt.codeVersion, context.submission.codeVersion),
    receiptTenderMatches: receipt.tenderId === context.submission.tenderId,
    receiptVendorMatches: sameHex(receipt.vendor, context.submission.vendor),
    receiptNonceMatches: receipt.submissionNonce === context.submission.submissionNonce,
    receiptRulesHashMatches: sameHex(receipt.rulesHash, context.rulesHash),
    receiptCommitmentMatches: sameHex(receipt.plaintextCommitment, context.commitment),
    receiptTeeIdMatches: sameHex(receipt.teeId, teeId),
    receiptSignerMatches: sameHex(signer, teeId),
    noPlaintextResult: response.result.data.length < 10_000,
  };
  if (!Object.values(assertions).every(Boolean)) throw new Error("FCC_GATE_B_RECEIPT_ASSERTIONS_FAILED");
  return { response, receipt, assertions };
}

async function main() {
  const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
  if (!rpcUrl || !/^https:\/\//.test(rpcUrl)) throw new Error("FCC_GATE_B_RPC_INVALID");
  const proxyUrls = String(process.env.FLARE_FCC_PROXY_URLS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (proxyUrls.length !== 3 || new Set(proxyUrls).size !== 3) throw new Error("FCC_GATE_B_PROXY_SET_INVALID");
  const apiKeys = requiredApiKeys();
  const registration = JSON.parse(readFileSync(registrationPath, "utf8"));
  const codeVersion = JSON.parse(readFileSync(codeVersionPath, "utf8"));
  const machinesEvidence = JSON.parse(readFileSync(machinesPath, "utf8"));
  const manager = getAddress(registration.publicIdentifiers.manager);
  const market = getAddress(registration.publicIdentifiers.foundationSender);
  const extensionId = BigInt(registration.publicIdentifiers.extensionId);
  const codeHash = codeVersion.publicIdentifiers.codeHash;
  const teeMachines = await Promise.all(proxyUrls.map(readMachineInfo));
  if (new Set(teeMachines.map(({ teeId }) => teeId.toLowerCase())).size !== 3) throw new Error("FCC_GATE_B_TEE_IDENTITIES_NOT_DISTINCT");

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
  const blockNumber = await publicClient.getBlockNumber();
  const chainMachines = await Promise.all(teeMachines.map(async ({ teeId }, index) => {
    const [status, registeredExtensionId, record] = await Promise.all([
      publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [teeId], blockNumber }),
      publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getExtensionId", args: [teeId], blockNumber }),
      publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineWithAttestationData", args: [teeId], blockNumber }),
    ]);
    return { index, teeId, status: Number(status), registeredExtensionId, record };
  }));
  if (chainMachines.some((machine) => machine.status !== 2 || machine.registeredExtensionId !== extensionId)) {
    throw new Error("FCC_GATE_B_MACHINE_BINDING_INVALID");
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const bidDeadline = now + 3_600n;
  const submission = {
    schemaVersion: 1,
    chainId: 114n,
    market,
    extensionId,
    codeVersion: codeHash,
    tenderId: 1n,
    vendor: "0x2000000000000000000000000000000000000002",
    submissionNonce: BigInt(Date.now()),
    rules: {
      schemaVersion: 1,
      ceilingXrpMicros: 1_000_000n,
      bidDeadline,
      allowXrp: true,
      allowUsd: false,
      ftsoFeedId: `0x${"00".repeat(21)}`,
      maxDeliveryDays: 30,
      minWarrantyDays: 12,
      maxWarrantyDays: 36,
      priceWeightBps: 6_000,
      deliveryWeightBps: 2_500,
      warrantyWeightBps: 1_500,
      requiredCredentials: [],
    },
    receiptExpiry: bidDeadline - 300n,
    quoteCurrency: 0,
    priceMicros: 400_000n,
    deliveryDays: 5,
    warrantyDays: 24,
    credentials: [],
    salt: keccak256(stringToHex(`VEILBID_GATE_B_SALT_${Date.now()}`)),
  };
  const plaintext = encodePrivateBidSubmission(submission);
  const commitment = privateBidCommitment(submission);
  const rulesHash = calculateFlareRulesHash(submission.rules);
  const ciphertexts = await Promise.all(teeMachines.map((machine) => encryptPrivateBidForTee(
    Uint8Array.from(Buffer.from(plaintext.slice(2), "hex")),
    machine.publicKey,
  )));
  const submissions = [];
  for (let index = 0; index < 3; index += 1) {
    const actionId = await sendDirect(proxyUrls[index], apiKeys[index], ciphertexts[index]);
    const value = await readResult(proxyUrls[index], actionId);
    const verified = await verifyReceipt(value, {
      actionId,
      submission,
      commitment,
      rulesHash,
    }, teeMachines[index].teeId);
    submissions.push({ index, actionId, verified });
  }

  const replayActionId = await sendDirect(proxyUrls[0], apiKeys[0], ciphertexts[0]);
  const replayValue = await readResult(proxyUrls[0], replayActionId);
  const replayResponse = parseFccActionResponse(replayValue);
  const replayRejected = replayResponse.result.status === 0 && replayResponse.result.log === "error: PRIVATE_BID_CONFLICT" && replayResponse.result.data === "0x";
  if (!replayRejected) throw new Error("FCC_GATE_B_REPLAY_NOT_REJECTED");

  const receiptAssertions = submissions.map(({ index, verified }) => ({ machine: index + 1, ...verified.assertions }));
  const assertions = {
    threeProductionMachinesBound: chainMachines.every((machine) => machine.status === 2 && machine.registeredExtensionId === extensionId),
    threeEncryptedSubmissionsAccepted: submissions.length === 3,
    threeDistinctReceiptSigners: new Set(submissions.map(({ verified }) => verified.receipt.teeId.toLowerCase())).size === 3,
    allReceiptsMatchCommitment: submissions.every(({ verified }) => sameHex(verified.receipt.plaintextCommitment, commitment)),
    allReceiptsBindDomain: submissions.every(({ verified }) => verified.assertions.receiptMarketMatches && verified.assertions.receiptTenderMatches && verified.assertions.receiptVendorMatches),
    allReceiptsSignerChecked: submissions.every(({ verified }) => verified.assertions.receiptSignerMatches),
    sealedReplayRejected: replayRejected,
    ciphertextNotRecorded: true,
    plaintextNotRecorded: true,
    sealedRestartRecoveryVerified: false,
  };
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const evidence = {
    schemaVersion: 1,
    gate: "B",
    status: "IN_PROGRESS",
    recordedAt: new Date().toISOString(),
    sourceCommit,
    network: { name: "flare-coston2", chainId: 114, blockNumber: blockNumber.toString() },
    publicIdentifiers: {
      manager,
      marketBinding: market,
      extensionId: extensionId.toString(),
      codeHash,
      machineIds: teeMachines.map(({ teeId }) => teeId),
      machineCount: teeMachines.length,
      actionIds: submissions.map(({ actionId }) => actionId),
      replayActionId,
      plaintextCommitment: commitment,
      receiptTeeIds: submissions.map(({ verified }) => verified.receipt.teeId),
      receiptExpiries: submissions.map(({ verified }) => verified.receipt.expiry.toString()),
      quoteCurrency: "XRP",
    },
    assertions,
    receiptAssertions,
    notes: [
      "This evidence records live authenticated ciphertext ingress and TEE-signed receipt binding on three Coston2 production-status simulated TEEs.",
      "A duplicate sealed slot was rejected as PRIVATE_BID_CONFLICT; this is replay protection, not a claim that a Railway process restart was performed.",
      "A restart proof remains open because restarting simulated TEE services rotates identity and requires re-registration; no service was restarted for this run.",
      "No plaintext bid, ciphertext, API key, raw signature, or private key is recorded.",
    ],
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ gate: evidence.gate, status: evidence.status, blockNumber: evidence.network.blockNumber, machines: teeMachines.map(({ teeId }) => teeId), receipts: submissions.length, replayRejected, evidence: "evidence/coston2/gate-b-fcc-ingress.json" }, null, 2));
}

await main();
