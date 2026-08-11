import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  getAddress,
  hashMessage,
  http,
  keccak256,
  recoverAddress,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  credentialDigest,
  decodeBidReceipt,
  directBidInstruction,
  encodePrivateBidSubmission,
  encryptPrivateBidForTee,
  fccActionResultHash,
  fccSigningDigest,
  parseFccActionResponse,
  privateBidCommitment,
  recoverBidReceiptSigner,
  teeActionResultPrefix,
  teeIdentityFromPublicKey,
  flareQuorumDirectOpType,
  flareQuorumDirectSubmitCommand,
} from "../../packages/flare-bindings/dist/index.js";
import { calculateFlareRulesHash } from "../../packages/flare-bindings/dist/smart-account.js";
import { readV2ReleasePlan } from "../flare/v2-release.mjs";

const root = resolve(import.meta.dirname, "../..");
const v2InvalidCredential =
  process.env.FCC_RELEASE_PROFILE?.trim().toLowerCase() === "v2" &&
  process.env.FCC_PRIVATE_INGRESS_NEGATIVE === "invalid-credential";
const v2Plan = v2InvalidCredential ? readV2ReleasePlan(root) : undefined;
const evidencePath = resolve(root, v2InvalidCredential
  ? v2Plan.artifacts.invalidCredentialEvidence
  : "evidence/coston2/gate-b-private-ingress.json");
const registrationPath = resolve(root, v2InvalidCredential
  ? v2Plan.artifacts.extensionRegistrationEvidence
  : "evidence/coston2/fcc-extension-registration.json");
const codeVersionPath = resolve(root, "evidence/coston2/fcc-code-version.json");
const machinesPath = resolve(root, v2InvalidCredential
  ? v2Plan.artifacts.machineEvidence
  : "evidence/coston2/fcc-machines.json");
const replacementPath = resolve(root, "evidence/coston2/fcc-replacement-recovery.json");
const currentLifecyclePath = resolve(root, "evidence/coston2/gate-c-e-f-v023-live-lifecycle.json");

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
    const value = process.env[v2InvalidCredential
      ? `FCC_V2_DIRECT_API_KEY_${index}`
      : `FCC_DIRECT_API_KEY_${index}`];
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
    const resultUrl = new URL(`${url.replace(/\/+$/, "")}/action/result/${actionId}`);
    resultUrl.searchParams.set("submissionTag", "submit");
    const response = await fetch(resultUrl, {
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
    response.result.opType !== flareQuorumDirectOpType ||
    response.result.opCommand !== flareQuorumDirectSubmitCommand
  ) throw new Error("FCC_GATE_B_RESULT_BINDING_INVALID");
  const receipt = decodeBidReceipt(response.result.data);
  const signer = await recoverBidReceiptSigner(receipt);
  const assertions = {
    actionIdMatches: response.result.id.toLowerCase() === context.actionId.toLowerCase(),
    resultStatusSuccess: response.result.status === 1,
    operationMatches: response.result.opType === flareQuorumDirectOpType && response.result.opCommand === flareQuorumDirectSubmitCommand,
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

async function verifyRejectedAction(value, actionId, teeId) {
  const response = parseFccActionResponse(value);
  const resultHash = fccActionResultHash(response.result);
  const signingDigest = fccSigningDigest(teeActionResultPrefix, 114n, resultHash);
  const signer = getAddress(await recoverAddress({
    hash: hashMessage({ raw: signingDigest }),
    signature: response.signature,
  }));
  const assertions = {
    actionIdMatches: response.result.id.toLowerCase() === actionId.toLowerCase(),
    submissionTagMatches: response.result.submissionTag === "submit",
    operationMatches:
      response.result.opType === flareQuorumDirectOpType &&
      response.result.opCommand === flareQuorumDirectSubmitCommand,
    invalidCredentialRejected:
      response.result.status === 0 &&
      response.result.log === "error: PRIVATE_BID_REJECTED" &&
      response.result.data === "0x",
    rejectionSignedByExpectedTee: signer.toLowerCase() === teeId.toLowerCase(),
  };
  if (!Object.values(assertions).every(Boolean)) {
    throw new Error("FCC_V2_INVALID_CREDENTIAL_REJECTION_INVALID");
  }
  return assertions;
}

async function runV2InvalidCredentialProbe({
  proxyUrls,
  apiKeys,
  teeMachines,
  chainMachines,
  blockNumber,
  manager,
  market,
  extensionId,
  codeHash,
}) {
  if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
    throw new Error("FCC_V2_INVALID_CREDENTIAL_REQUIRES_CLEAN_WORKTREE");
  }
  if (existsSync(evidencePath)) throw new Error("FCC_V2_INVALID_CREDENTIAL_EVIDENCE_EXISTS");

  const now = BigInt(Math.floor(Date.now() / 1000));
  const tenderId = BigInt(Date.now());
  const bidDeadline = now + 3_600n;
  const issuer = privateKeyToAccount(generatePrivateKey());
  const wrongSigner = privateKeyToAccount(generatePrivateKey());
  const vendor = privateKeyToAccount(generatePrivateKey());
  const credentialType = keccak256(stringToHex("FLAREQUORUM_VENDOR_ELIGIBILITY_V1"));
  const credential = {
    credentialType,
    issuer: issuer.address,
    validUntil: bidDeadline + 600n,
    nonce: keccak256(stringToHex(`FLAREQUORUM_V2_CREDENTIAL_${Date.now()}`)),
  };
  const submission = {
    schemaVersion: 1,
    chainId: 114n,
    market,
    extensionId,
    codeVersion: codeHash,
    tenderId,
    vendor: vendor.address,
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
      requiredCredentials: [{ credentialType, issuer: issuer.address }],
    },
    receiptExpiry: bidDeadline - 300n,
    quoteCurrency: 0,
    priceMicros: 400_000n,
    deliveryDays: 5,
    warrantyDays: 24,
    credentials: [],
    salt: keccak256(stringToHex(`FLAREQUORUM_V2_INVALID_CREDENTIAL_SALT_${Date.now()}`)),
  };
  const digest = credentialDigest({ submission, credential });
  const invalidSignature = await wrongSigner.signMessage({ message: { raw: digest } });
  submission.credentials = [{ ...credential, signature: invalidSignature }];
  const invalidPlaintext = encodePrivateBidSubmission(submission);
  const invalidCiphertexts = await Promise.all(teeMachines.map(({ publicKey }) =>
    encryptPrivateBidForTee(
      Uint8Array.from(Buffer.from(invalidPlaintext.slice(2), "hex")),
      publicKey,
    )));
  const rejected = [];
  for (let index = 0; index < 3; index += 1) {
    const actionId = await sendDirect(proxyUrls[index], apiKeys[index], invalidCiphertexts[index]);
    const result = await readResult(proxyUrls[index], actionId);
    const assertions = await verifyRejectedAction(result, actionId, teeMachines[index].teeId);
    rejected.push({ actionId, assertions });
  }

  const validSignature = await issuer.signMessage({ message: { raw: digest } });
  submission.credentials = [{ ...credential, signature: validSignature }];
  const validPlaintext = encodePrivateBidSubmission(submission);
  const commitment = privateBidCommitment(submission);
  const rulesHash = calculateFlareRulesHash(submission.rules);
  const validCiphertexts = await Promise.all(teeMachines.map(({ publicKey }) =>
    encryptPrivateBidForTee(
      Uint8Array.from(Buffer.from(validPlaintext.slice(2), "hex")),
      publicKey,
    )));
  const accepted = [];
  for (let index = 0; index < 3; index += 1) {
    const actionId = await sendDirect(proxyUrls[index], apiKeys[index], validCiphertexts[index]);
    const result = await readResult(proxyUrls[index], actionId);
    const verified = await verifyReceipt(result, {
      actionId,
      submission,
      commitment,
      rulesHash,
    }, teeMachines[index].teeId);
    accepted.push({ actionId, verified });
  }

  const assertions = {
    threeProductionMachinesBound:
      chainMachines.every(({ status, registeredExtensionId }) =>
        status === 2 && registeredExtensionId === extensionId),
    wrongIssuerSignatureRejectedByAllThree:
      rejected.length === 3 && rejected.every(({ assertions: item }) =>
        Object.values(item).every(Boolean)),
    rejectedPayloadCreatedNoReceipt:
      rejected.every(({ assertions: item }) => item.invalidCredentialRejected),
    correctedCredentialAcceptedByAllThree:
      accepted.length === 3 && accepted.every(({ verified }) =>
        verified.response.result.status === 1),
    rejectedAttemptDidNotConsumeCanonicalSlot:
      accepted.every(({ verified }) => verified.assertions.receiptCommitmentMatches),
    threeDistinctReceiptSigners:
      new Set(accepted.map(({ verified }) => verified.receipt.teeId.toLowerCase())).size === 3,
    noCredentialOrSignatureRecorded: true,
    noPlaintextOrCiphertextRecorded: true,
  };
  if (!Object.values(assertions).every(Boolean)) {
    throw new Error("FCC_V2_INVALID_CREDENTIAL_ASSERTIONS_FAILED");
  }
  const evidence = {
    schemaVersion: 1,
    gate: "FLARE_V2_INVALID_CREDENTIAL_REJECTION",
    status: "PASSED",
    recordedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    network: { name: "flare-coston2", chainId: 114, blockNumber: blockNumber.toString() },
    publicIdentifiers: {
      manager,
      market,
      extensionId: extensionId.toString(),
      codeHash,
      machineIds: teeMachines.map(({ teeId }) => teeId),
      rejectedActionIds: rejected.map(({ actionId }) => actionId),
      acceptedActionIds: accepted.map(({ actionId }) => actionId),
      acceptedPlaintextCommitment: commitment,
      rejectionCode: "PRIVATE_BID_REJECTED",
    },
    assertions,
    rejectionAssertions: rejected.map(({ assertions: item }, index) => ({
      machine: index + 1,
      ...item,
    })),
    blockers: [],
    notes: [
      "Each V2 TEE rejected a domain-shaped encrypted bid whose credential signature recovered to the wrong issuer.",
      "A corrected credential for the exact canonical slot was then accepted by all three machines, proving the rejected attempt did not consume sealed bid state.",
      "Only public action IDs, machine IDs, a commitment, and assertion booleans are recorded; no credential, signature, bid plaintext, ciphertext, key, or proxy secret is recorded.",
    ],
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({
    gate: evidence.gate,
    status: evidence.status,
    machines: teeMachines.length,
    rejected: rejected.length,
    accepted: accepted.length,
    evidence: v2Plan.artifacts.invalidCredentialEvidence,
  }, null, 2));
}

async function main() {
  const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
  if (!rpcUrl || !/^https:\/\//.test(rpcUrl)) throw new Error("FCC_GATE_B_RPC_INVALID");
  const proxyUrls = String(process.env[
    v2InvalidCredential ? "FLARE_FCC_V2_PROXY_URLS" : "FLARE_FCC_PROXY_URLS"
  ] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (proxyUrls.length !== 3 || new Set(proxyUrls).size !== 3) throw new Error("FCC_GATE_B_PROXY_SET_INVALID");
  const apiKeys = requiredApiKeys();
  const registration = JSON.parse(readFileSync(registrationPath, "utf8"));
  const codeVersion = JSON.parse(readFileSync(codeVersionPath, "utf8"));
  const machinesEvidence = JSON.parse(readFileSync(machinesPath, "utf8"));
  const manager = getAddress(registration.publicIdentifiers.manager);
  const market = getAddress(registration.publicIdentifiers[
    v2InvalidCredential ? "sender" : "foundationSender"
  ]);
  const extensionId = BigInt(registration.publicIdentifiers.extensionId);
  const codeHash = v2InvalidCredential
    ? registration.publicIdentifiers.codeHash
    : codeVersion.publicIdentifiers.codeHash;
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

  if (v2InvalidCredential) {
    await runV2InvalidCredentialProbe({
      proxyUrls,
      apiKeys,
      teeMachines,
      chainMachines,
      blockNumber,
      manager,
      market,
      extensionId,
      codeHash,
    });
    return;
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  // Use a fresh synthetic tender namespace for every live probe.  The TEE's
  // sealed store intentionally allows only one ciphertext per
  // (chain, market, extension, tender, vendor) slot, so a rerun must not
  // collide with an earlier evidence attempt.
  const tenderId = BigInt(Date.now());
  const bidDeadline = now + 3_600n;
  const submission = {
    schemaVersion: 1,
    chainId: 114n,
    market,
    extensionId,
    codeVersion: codeHash,
    tenderId,
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
    salt: keccak256(stringToHex(`FLAREQUORUM_GATE_B_SALT_${Date.now()}`)),
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

  // An exact transport retry is intentionally idempotent: it returns the
  // same receipt rather than minting a second sealed slot.  A re-encrypted
  // payload for the same canonical slot must be rejected, which prevents a
  // caller from replacing a bid after the first ciphertext was accepted.
  const idempotentRetryActionId = await sendDirect(proxyUrls[0], apiKeys[0], ciphertexts[0]);
  const idempotentRetryValue = await readResult(proxyUrls[0], idempotentRetryActionId);
  const idempotentRetry = await verifyReceipt(idempotentRetryValue, {
    actionId: idempotentRetryActionId,
    submission,
    commitment,
    rulesHash,
  }, teeMachines[0].teeId);
  const conflictCiphertext = await encryptPrivateBidForTee(
    Uint8Array.from(Buffer.from(plaintext.slice(2), "hex")),
    teeMachines[0].publicKey,
  );
  const replayActionId = await sendDirect(proxyUrls[0], apiKeys[0], conflictCiphertext);
  const replayValue = await readResult(proxyUrls[0], replayActionId);
  const replayResponse = parseFccActionResponse(replayValue);
  const replayRejected = replayResponse.result.status === 0 && replayResponse.result.log === "error: PRIVATE_BID_CONFLICT" && replayResponse.result.data === "0x";
  if (!replayRejected) throw new Error("FCC_GATE_B_REPLAY_NOT_REJECTED");

  const receiptAssertions = submissions.map(({ index, verified }) => ({ machine: index + 1, ...verified.assertions }));
  const replacement = JSON.parse(readFileSync(replacementPath, "utf8"));
  const currentLifecycle = JSON.parse(readFileSync(currentLifecyclePath, "utf8"));
  const replacementIds = replacement.publicIdentifiers?.currentMachines?.map(({ teeId }) => getAddress(teeId)) ?? [];
  const lifecycleIds = (currentLifecycle.publicIdentifiers?.teeIds ?? []).map(getAddress);
  const normalizedSet = (values) => [...values].map((value) => value.toLowerCase()).sort();
  if (
    replacement.status !== "PASSED"
    || replacement.gate !== "FCC_REPLACEMENT_RECOVERY"
    || !Object.values(replacement.assertions ?? {}).every(Boolean)
    || currentLifecycle.status !== "PASSED"
    || currentLifecycle.gate !== "C-E-F"
    || !sameHex(currentLifecycle.publicIdentifiers?.codeHash, codeHash)
    || replacementIds.length !== 3
    || JSON.stringify(normalizedSet(replacementIds)) !== JSON.stringify(normalizedSet(lifecycleIds))
  ) throw new Error("FCC_GATE_B_REPLACEMENT_EVIDENCE_INVALID");
  const assertions = {
    threeProductionMachinesBound: chainMachines.every((machine) => machine.status === 2 && machine.registeredExtensionId === extensionId),
    threeEncryptedSubmissionsAccepted: submissions.length === 3,
    threeDistinctReceiptSigners: new Set(submissions.map(({ verified }) => verified.receipt.teeId.toLowerCase())).size === 3,
    allReceiptsMatchCommitment: submissions.every(({ verified }) => sameHex(verified.receipt.plaintextCommitment, commitment)),
    allReceiptsBindDomain: submissions.every(({ verified }) => verified.assertions.receiptMarketMatches && verified.assertions.receiptTenderMatches && verified.assertions.receiptVendorMatches),
    allReceiptsSignerChecked: submissions.every(({ verified }) => verified.assertions.receiptSignerMatches),
    exactCiphertextRetryIdempotent: idempotentRetry.response.result.status === 1 && idempotentRetry.assertions.receiptCommitmentMatches,
    sealedReplayRejected: replayRejected,
    ciphertextNotRecorded: true,
    plaintextNotRecorded: true,
    supportedReplacementRecoveryVerified: true,
    postReplacementPrivateLifecycleVerified:
      currentLifecycle.assertions?.threeEncryptedBidsAcceptedByDistinctTees === true
      && currentLifecycle.assertions?.noPlaintextOrCiphertextRecorded === true,
  };
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const evidence = {
    schemaVersion: 1,
    gate: "B",
    status: "PASSED",
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
      idempotentRetryActionId,
      replayActionId,
      plaintextCommitment: commitment,
      receiptTeeIds: submissions.map(({ verified }) => verified.receipt.teeId),
      receiptExpiries: submissions.map(({ verified }) => verified.receipt.expiry.toString()),
      quoteCurrency: "XRP",
      replacementExtensionId: String(replacement.publicIdentifiers.extensionId),
      replacementMachineIds: replacementIds,
      postReplacementTenderId: String(currentLifecycle.publicIdentifiers.tenderId),
      postReplacementFinalizationTransaction: currentLifecycle.publicIdentifiers.finalizationTransaction,
    },
    assertions,
    receiptAssertions,
    blockers: [],
    notes: [
      "This evidence records live authenticated ciphertext ingress and TEE-signed receipt binding on three Coston2 production-status simulated TEEs.",
      "A duplicate sealed slot was rejected as PRIVATE_BID_CONFLICT; this is replay protection, not a claim that a Railway process restart was performed.",
      "The original ingress/replay run and the supported rolling replacement drill are separate live records aggregated under Gate B.",
      "All three product identities were replaced and re-registered, stale identities were retired, and a new three-vendor lifecycle finalized on the replacement set.",
      "No plaintext bid, ciphertext, API key, raw signature, or private key is recorded.",
    ],
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ gate: evidence.gate, status: evidence.status, blockNumber: evidence.network.blockNumber, machines: teeMachines.map(({ teeId }) => teeId), receipts: submissions.length, replayRejected, evidence: "evidence/coston2/gate-b-private-ingress.json" }, null, 2));
}

await main();
