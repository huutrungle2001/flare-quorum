import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { readV2ReleasePlan } from "../flare/v2-release.mjs";
import { buildCoston2LogBlockRanges } from "../flare/rpc-log-ranges.mjs";

const root = resolve(import.meta.dirname, "../..");
const plan = readV2ReleasePlan(root);
const execute = process.argv.includes("--execute");
const mode = process.env.FCC_V2_REFUND_MODE?.trim() || "undispatched";
if (!new Set(["undispatched", "selection-expired"]).has(mode)) {
  throw new Error("FLARE_V2_REFUND_MODE_INVALID");
}
const selectionExpired = mode === "selection-expired";
const statePath = resolve(
  root,
  selectionExpired
    ? ".local/fcc/market-v2-selection-refund-lifecycle.state.json"
    : ".local/fcc/market-v2-refund-lifecycle.state.json",
);
const evidenceArtifact = selectionExpired
  ? plan.artifacts.postDispatchRefundEvidence
  : plan.artifacts.refundLifecycleEvidence;
const evidencePath = resolve(root, evidenceArtifact);
const zeroHash = `0x${"00".repeat(32)}`;
const zeroFeedId = `0x${"00".repeat(21)}`;
const ceiling = 1_000_000n;
const managerAbi = parseAbi([
  "function getTeeMachineStatus(address teeId) view returns (uint8)",
  "function getExtensionId(address teeId) view returns (uint256)",
  "function getPublicKey(address teeId) view returns ((bytes32 x,bytes32 y))",
]);
const tokenAbi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);
const receiptAbi = parseAbi([
  "event AwardReceiptMinted(uint256 indexed tenderId,uint256 indexed winnerBidId,address indexed winner,uint256 amount,bytes32 resultDigest)",
]);

function read(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function privateKey(value) {
  const normalized = value?.startsWith("0x") ? value : value ? `0x${value}` : "";
  if (!/^0x[0-9a-f]{64}$/i.test(normalized)) throw new Error("FLARE_V2_REFUND_KEY_INVALID");
  return normalized;
}

function tuple(value, name, index) {
  return value?.[name] ?? value?.[index];
}

function writeState(value, exclusive = false) {
  mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
  writeFileSync(statePath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    ...(exclusive ? { flag: "wx" } : {}),
  });
}

async function send({ client, wallet, account, address, abi, functionName, args, value }) {
  const simulation = await client.simulateContract({ account, address, abi, functionName, args, value });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== "success") throw new Error(`FLARE_V2_REFUND_${functionName.toUpperCase()}_FAILED`);
  return { hash, receipt };
}

async function awardExists(client, awardReceipt, tenderId, fromBlock, toBlock) {
  for (const range of buildCoston2LogBlockRanges(fromBlock, toBlock)) {
    const events = await client.getContractEvents({
      address: awardReceipt,
      abi: receiptAbi,
      eventName: "AwardReceiptMinted",
      args: { tenderId },
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
      strict: true,
    });
    if (events.length > 0) return true;
  }
  return false;
}

const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
if (!/^https:\/\//.test(rpcUrl ?? "")) throw new Error("FLARE_V2_REFUND_RPC_INVALID");
const account = privateKeyToAccount(privateKey(process.env.FLARE_DEPLOYMENT_PRIVATE_KEY));
const candidate = read(plan.artifacts.candidateManifest);
const registration = read(plan.artifacts.extensionRegistrationEvidence);
const machineEvidence = read(plan.artifacts.machineEvidence);
const market = getAddress(candidate.contracts.FlareQuorumMarketV2.address);
const awardReceipt = getAddress(candidate.contracts.FlareQuorumAwardReceiptV2.address);
const manager = getAddress(registration.publicIdentifiers.manager);
const extensionId = BigInt(registration.publicIdentifiers.extensionId);
const foundations = read("tooling/flare/coston2-foundations.json");
const token = getAddress(foundations.contracts.fTestXRP);
const marketAbi = read(plan.artifacts.candidateMarketAbi);
const machines = machineEvidence.publicIdentifiers?.machines ?? [];
if (machines.length !== 3 || new Set(machines.map(({ teeId }) => teeId.toLowerCase())).size !== 3) {
  throw new Error("FLARE_V2_REFUND_MACHINE_EVIDENCE_INVALID");
}
if (getAddress(registration.publicIdentifiers.sender) !== market) {
  throw new Error("FLARE_V2_REFUND_EXTENSION_SENDER_MISMATCH");
}

const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const transport = http(rpcUrl, { timeout: 20_000, retryCount: 2 });
const client = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });
const [chainId, block, tokenBalance, marketCode, receiptCode, closedRefundGrace, selectionRefundGrace] = await Promise.all([
  client.getChainId(),
  client.getBlock(),
  client.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [account.address] }),
  client.getCode({ address: market }),
  client.getCode({ address: awardReceipt }),
  client.readContract({ address: market, abi: marketAbi, functionName: "CLOSED_REFUND_GRACE" }),
  client.readContract({ address: market, abi: marketAbi, functionName: "SELECTION_REFUND_GRACE" }),
]);
const machineBindings = await Promise.all(machines.map(async ({ teeId }) => {
  const id = getAddress(teeId);
  const [status, boundExtensionId, publicKey] = await Promise.all([
    client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [id] }),
    client.readContract({ address: manager, abi: managerAbi, functionName: "getExtensionId", args: [id] }),
    client.readContract({ address: manager, abi: managerAbi, functionName: "getPublicKey", args: [id] }),
  ]);
  return {
    teeId: id,
    fingerprint: keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [tuple(publicKey, "x", 0), tuple(publicKey, "y", 1)],
    )),
    valid: Number(status) === 2 && boundExtensionId === extensionId,
  };
}));
const preflight = {
  chainIdMatches: chainId === 114,
  accountMatchesDeclaredDeployer: account.address === getAddress(foundations.network.declaredDeployer),
  buyerHasEscrow: tokenBalance >= ceiling,
  v2MarketCodePresent: Boolean(marketCode && marketCode !== "0x"),
  v2AwardReceiptCodePresent: Boolean(receiptCode && receiptCode !== "0x"),
  extensionSenderMatchesV2: getAddress(registration.publicIdentifiers.sender) === market,
  threeProductionMachinesBound: machineBindings.length === 3 && machineBindings.every(({ valid }) => valid),
  closedRefundGraceIs24Hours: closedRefundGrace === 86_400n,
  selectionRefundGraceIs24Hours: selectionRefundGrace === 86_400n,
};
if (!Object.values(preflight).every(Boolean)) throw new Error("FLARE_V2_REFUND_PREFLIGHT_FAILED");

const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : undefined;
if (!execute) {
  let waitingUntil = null;
  if (state?.phase === "OPEN") waitingUntil = state.bidDeadline;
  if (state?.phase === "CLOSED") waitingUntil = state.refundAvailableAt;
  if (state?.phase === "COMPUTE_PENDING") waitingUntil = state.refundAvailableAt;
  console.log(JSON.stringify({
    status: waitingUntil && block.timestamp < BigInt(waitingUntil) ? "WAITING" : "READY",
    scope: `V2 ${selectionExpired ? "post-dispatch selection-expired" : "undispatched"} refund preflight only; no transaction sent`,
    mode,
    phase: state?.phase ?? "NOT_STARTED",
    market,
    extensionId: extensionId.toString(),
    waitingUntil,
    currentChainTimestamp: block.timestamp.toString(),
    preflight,
  }, null, 2));
  process.exit(0);
}
if (existsSync(evidencePath)) throw new Error("FLARE_V2_REFUND_EVIDENCE_ALREADY_EXISTS");
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error("FLARE_V2_REFUND_REQUIRES_CLEAN_WORKTREE");
}

if (!state) {
  const approval = await send({
    client, wallet, account, address: token, abi: tokenAbi,
    functionName: "approve", args: [market, ceiling],
  });
  const bidDeadline = block.timestamp + 120n;
  const terms = {
    metadataHash: keccak256(stringToHex(
      `FLAREQUORUM_V2_${selectionExpired ? "SELECTION_EXPIRED" : "UNDISPATCHED"}_REFUND_${Date.now()}`,
    )),
    scoringPolicy: {
      schemaVersion: 1,
      ceilingXrpMicros: ceiling,
      bidDeadline,
      allowXrp: true,
      allowUsd: false,
      ftsoFeedId: zeroFeedId,
      maxDeliveryDays: 30,
      minWarrantyDays: 12,
      maxWarrantyDays: 36,
      priceWeightBps: 6_000,
      deliveryWeightBps: 2_500,
      warrantyWeightBps: 1_500,
      requiredCredentials: [],
    },
    approvedVendors: [account.address],
    extensionId,
    codeVersion: registration.publicIdentifiers.codeHash,
    teeIds: machineBindings.map(({ teeId }) => teeId),
    teeKeyFingerprints: machineBindings.map(({ fingerprint }) => fingerprint),
  };
  const tenderCountBefore = await client.readContract({ address: market, abi: marketAbi, functionName: "tenderCount" });
  const created = await send({
    client, wallet, account, address: market, abi: marketAbi,
    functionName: "createTender", args: [terms],
  });
  const tenderId = await client.readContract({ address: market, abi: marketAbi, functionName: "tenderCount" });
  if (tenderId !== tenderCountBefore + 1n) throw new Error("FLARE_V2_REFUND_TENDER_ID_INVALID");
  writeState({
    schemaVersion: 1,
    phase: "OPEN",
    mode,
    market,
    tenderId: tenderId.toString(),
    bidDeadline: bidDeadline.toString(),
    approvalTransaction: approval.hash,
    createTransaction: created.hash,
    createBlock: created.receipt.blockNumber.toString(),
  }, true);
  console.log(JSON.stringify({
    status: "WAITING",
    phase: "OPEN",
    mode,
    tenderId: tenderId.toString(),
    resumeAfterChainTimestamp: bidDeadline.toString(),
    nextCommand: selectionExpired ? "pnpm flare:v2:selection-refund" : "pnpm flare:v2:refund",
  }, null, 2));
  process.exit(0);
}

const tenderId = BigInt(state.tenderId);
if (state.market !== market) throw new Error("FLARE_V2_REFUND_STATE_MARKET_MISMATCH");
if ((state.mode ?? "undispatched") !== mode) throw new Error("FLARE_V2_REFUND_STATE_MODE_MISMATCH");
if (state.phase === "OPEN") {
  if (block.timestamp <= BigInt(state.bidDeadline)) {
    console.log(JSON.stringify({ status: "WAITING", phase: "OPEN", tenderId: state.tenderId, resumeAfterChainTimestamp: state.bidDeadline }, null, 2));
    process.exit(0);
  }
  const closed = await send({
    client, wallet, account, address: market, abi: marketAbi,
    functionName: "closeTender", args: [tenderId],
  });
  const tender = await client.readContract({ address: market, abi: marketAbi, functionName: "getTender", args: [tenderId] });
  const closedAt = BigInt(tuple(tender, "closedAt", 6));
  if (selectionExpired) {
    const instructionFee = BigInt(process.env.FLARE_FCC_INSTRUCTION_FEE_WEI ?? "1000000");
    if (instructionFee <= 0n) throw new Error("FLARE_V2_REFUND_INSTRUCTION_FEE_INVALID");
    const requested = await send({
      client, wallet, account, address: market, abi: marketAbi,
      functionName: "requestSelection", args: [tenderId], value: instructionFee,
    });
    const pending = await client.readContract({
      address: market, abi: marketAbi, functionName: "getTender", args: [tenderId],
    });
    const selectionStartedAt = BigInt(tuple(pending, "selectionStartedAt", 17));
    const requestId = tuple(pending, "requestId", 21);
    if (Number(tuple(pending, "status", 22)) !== 3 || selectionStartedAt === 0n || requestId === zeroHash) {
      throw new Error("FLARE_V2_SELECTION_REFUND_DISPATCH_INVALID");
    }
    const refundAvailableAt = selectionStartedAt + selectionRefundGrace + 1n;
    writeState({
      ...state,
      phase: "COMPUTE_PENDING",
      closeTransaction: closed.hash,
      requestTransaction: requested.hash,
      closedAt: closedAt.toString(),
      selectionStartedAt: selectionStartedAt.toString(),
      requestId,
      refundAvailableAt: refundAvailableAt.toString(),
    });
    console.log(JSON.stringify({
      status: "WAITING",
      phase: "COMPUTE_PENDING",
      mode,
      tenderId: state.tenderId,
      requestId,
      resumeAfterChainTimestamp: refundAvailableAt.toString(),
      nextCommand: "pnpm flare:v2:selection-refund",
    }, null, 2));
    process.exit(0);
  }
  const refundAvailableAt = closedAt + closedRefundGrace + 1n;
  writeState({
    ...state,
    phase: "CLOSED",
    closeTransaction: closed.hash,
    closedAt: closedAt.toString(),
    refundAvailableAt: refundAvailableAt.toString(),
  });
  console.log(JSON.stringify({
    status: "WAITING",
    phase: "CLOSED",
    mode,
    tenderId: state.tenderId,
    resumeAfterChainTimestamp: refundAvailableAt.toString(),
    nextCommand: "pnpm flare:v2:refund",
  }, null, 2));
  process.exit(0);
}
const expectedPhase = selectionExpired ? "COMPUTE_PENDING" : "CLOSED";
if (state.phase !== expectedPhase) throw new Error("FLARE_V2_REFUND_STATE_INVALID");
if (block.timestamp < BigInt(state.refundAvailableAt)) {
  console.log(JSON.stringify({
    status: "WAITING",
    phase: expectedPhase,
    mode,
    tenderId: state.tenderId,
    resumeAfterChainTimestamp: state.refundAvailableAt,
  }, null, 2));
  process.exit(0);
}

const beforeTender = await client.readContract({ address: market, abi: marketAbi, functionName: "getTender", args: [tenderId] });
const lifecycleStartBlock = BigInt(state.createBlock);
const [buyerBefore, marketBefore, awardBefore] = await Promise.all([
  client.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [account.address] }),
  client.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [market] }),
  awardExists(client, awardReceipt, tenderId, lifecycleStartBlock, block.number),
]);
const refunded = await send({
  client, wallet, account, address: market, abi: marketAbi,
  functionName: selectionExpired ? "refundExpiredSelection" : "refundUndispatchedTender", args: [tenderId],
});
const [afterTender, buyerAfter, marketAfter, awardAfter] = await Promise.all([
  client.readContract({ address: market, abi: marketAbi, functionName: "getTender", args: [tenderId], blockNumber: refunded.receipt.blockNumber }),
  client.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [account.address], blockNumber: refunded.receipt.blockNumber }),
  client.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [market], blockNumber: refunded.receipt.blockNumber }),
  awardExists(client, awardReceipt, tenderId, lifecycleStartBlock, refunded.receipt.blockNumber),
]);
const events = parseEventLogs({
  abi: marketAbi,
  logs: refunded.receipt.logs,
  eventName: "TenderRefunded",
  strict: true,
});
const assertions = {
  ...preflight,
  ...(selectionExpired
    ? {
        selectionWasDispatched:
          BigInt(tuple(beforeTender, "selectionStartedAt", 17)) > 0n &&
          tuple(beforeTender, "requestId", 21) !== zeroHash,
        firstDispatchGraceElapsed:
          block.timestamp > BigInt(tuple(beforeTender, "selectionStartedAt", 17)) + selectionRefundGrace,
      }
    : {
        selectionNeverDispatched:
          BigInt(tuple(beforeTender, "selectionStartedAt", 17)) === 0n &&
          tuple(beforeTender, "requestId", 21) === zeroHash,
        closedGraceElapsed:
          block.timestamp > BigInt(tuple(beforeTender, "closedAt", 6)) + closedRefundGrace,
      }),
  refundTransactionSucceeded: refunded.receipt.status === "success",
  tenderStatusRefunded: Number(tuple(afterTender, "status", 22)) === 5,
  fullEscrowReturned: buyerAfter - buyerBefore === ceiling && marketBefore - marketAfter === ceiling,
  noAwardMinted: awardBefore === false && awardAfter === false,
  [selectionExpired ? "refundReasonSelectionExpired" : "refundReasonUndispatchedTimeout"]:
    events.length === 1 && Number(events[0].args.reason) === (selectionExpired ? 1 : 2) &&
    events[0].args.tenderId === tenderId,
};
if (!Object.values(assertions).every(Boolean)) throw new Error("FLARE_V2_REFUND_VERIFICATION_FAILED");
const evidence = {
  schemaVersion: 1,
  gate: selectionExpired ? "FLARE_V2_SELECTION_EXPIRED_REFUND" : "FLARE_V2_UNDISPATCHED_REFUND",
  status: "PASSED",
  recordedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  network: { name: "flare-coston2", chainId: 114, blockNumber: refunded.receipt.blockNumber.toString() },
  publicIdentifiers: {
    market,
    awardReceipt,
    extensionId: extensionId.toString(),
    tenderId: tenderId.toString(),
    closedAt: state.closedAt,
    refundAvailableAt: state.refundAvailableAt,
    approvalTransaction: state.approvalTransaction,
    createTransaction: state.createTransaction,
    closeTransaction: state.closeTransaction,
    ...(selectionExpired ? {
      requestTransaction: state.requestTransaction,
      requestId: state.requestId,
      selectionStartedAt: state.selectionStartedAt,
    } : {}),
    refundTransaction: refunded.hash,
    refundReason: selectionExpired ? "SelectionExpired" : "UndispatchedTimeout",
    escrowAmount: ceiling.toString(),
  },
  assertions,
  blockers: [],
  notes: [
    selectionExpired
      ? "The tender entered ComputePending through a real FCC dispatch and remained unresolved until the fixed first-dispatch grace elapsed."
      : "The tender was closed and never dispatched to FCC before the bounded refund grace elapsed.",
    "The full public FTestXRP escrow returned to the buyer and no award receipt was minted.",
    "No bid, TEE result, proxy credential, private key, or fabricated lifecycle value is recorded.",
  ],
};
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
writeState({ ...state, phase: "PASSED", refundTransaction: refunded.hash });
console.log(JSON.stringify({
  gate: evidence.gate,
  status: evidence.status,
  tenderId: state.tenderId,
  refundTransaction: refunded.hash,
  evidence: evidenceArtifact,
}, null, 2));
