import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import marketAbiJson from "../generated/abis/VeilBidFlareMarket.json" with { type: "json" };
import awardReceiptAbiJson from "../generated/abis/VeilBidFlareAwardReceipt.json" with { type: "json" };
import {
  assertFlareScoringPolicy,
  calculateFlareRulesHash,
  type FlareScoringPolicy,
} from "./smart-account.js";

const marketAbi = marketAbiJson as Abi;
const awardReceiptAbi = awardReceiptAbiJson as Abi;
const finalityDepth = 12n;

const coston2Chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

export type Coston2TenderStatus =
  | "FundingPending"
  | "Open"
  | "Closed"
  | "ComputePending"
  | "Awarded"
  | "Refunded"
  | "Cancelled";

export interface Coston2PublicTender {
  tenderId: bigint;
  buyer: Address;
  metadataHash: Hex;
  rulesHash: Hex;
  scoringPolicy: FlareScoringPolicy;
  publicCeilingXrp: bigint;
  bidDeadline: bigint;
  closeBlock: bigint;
  bidCount: bigint;
  approvedVendorCount: number;
  commonQuorumBitmap: number;
  orderedBidRoot: Hex;
  extensionId: bigint;
  codeVersion: Hex;
  ftsoFeedId: Hex;
  ftsoValue: bigint;
  ftsoDecimals: number;
  ftsoTimestamp: bigint;
  selectionStartedAt: bigint;
  selectionAttempt: number;
  resultNonce: bigint;
  resultExpiry: bigint;
  requestId: Hex;
  status: Coston2TenderStatus;
  teeIds: readonly [Address, Address, Address];
  teeKeyFingerprints: readonly [Hex, Hex, Hex];
  winnerBidId: bigint | null;
  winner: Address | null;
  winningAmountXrp: bigint | null;
  awardTransactionHash: Hex | null;
  bidReferences: readonly Coston2PublicBidReference[];
  award: Coston2PublicAward | null;
}

export interface Coston2PublicBidReference {
  bidId: bigint;
  vendor: Address;
  submissionNonce: bigint;
  plaintextCommitment: Hex;
  receiptBitmap: number;
  receiptExpiry: bigint;
  acceptedBlock: bigint;
}

export interface Coston2PublicAward {
  tenderId: bigint;
  winnerBidId: bigint;
  buyer: Address;
  winner: Address;
  paymentToken: Address;
  amount: bigint;
  rulesHash: Hex;
  orderedBidRoot: Hex;
  resultDigest: Hex;
  finalizedAt: bigint;
  finalizedBlock: bigint;
}

export interface Coston2MarketConfig {
  rpcUrl: string;
  marketAddress: Address;
  deploymentBlock: bigint;
  deploymentStatus: "planned" | "verified";
}

export interface Coston2PublicMarket {
  chainId: 114;
  tenders: readonly Coston2PublicTender[];
  indexedBlock: bigint;
  finalizedBlock: bigint;
  latestBlock: bigint;
  deploymentStatus: Coston2MarketConfig["deploymentStatus"];
}

export interface Coston2ProtocolBinding {
  chainId: 114;
  marketAddress: Address;
  deploymentStatus: Coston2MarketConfig["deploymentStatus"];
  deploymentBlock: bigint;
  finalizedBlock: bigint;
  runtimeCodeHash: Hex;
  runtimeCodeSize: number;
  paymentToken: Address;
  teeManager: Address;
  ftso: Address;
  teeExtensionRegistry: Address;
  awardReceipt: Address;
  tenderCount: bigint;
  teeCount: bigint;
  bidReceiptThreshold: number;
  resultThreshold: number;
}

export interface Coston2PublicLog {
  data: Hex;
  topics: readonly Hex[];
  transactionHash: Hex | null;
}

export interface Coston2PublicReader {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getCode(args: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  getLogs(args: {
    address: Address;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly Coston2PublicLog[]>;
  readContract(args: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    blockNumber: bigint;
  }): Promise<unknown>;
}

interface Coston2TenderRecord {
  buyer: Address;
  metadataHash: Hex;
  rulesHash: Hex;
  publicCeilingXrp: bigint;
  bidDeadline: bigint;
  closeBlock: bigint;
  bidCount: bigint;
  approvedVendorCount: number;
  commonQuorumBitmap: number;
  orderedBidRoot: Hex;
  extensionId: bigint;
  codeVersion: Hex;
  ftsoFeedId: Hex;
  ftsoValue: bigint;
  ftsoDecimals: number;
  ftsoTimestamp: bigint;
  selectionStartedAt: bigint;
  selectionAttempt: number;
  resultNonce: bigint;
  resultExpiry: bigint;
  requestId: Hex;
  status: number;
  teeIds: readonly [Address, Address, Address];
  teeKeyFingerprints: readonly [Hex, Hex, Hex];
}

interface AwardFact {
  award: Coston2PublicAward;
  transactionHash: Hex | null;
}

function createReader(rpcUrl: string): Coston2PublicReader {
  if (!rpcUrl.trim()) throw new Error("COSTON2_RPC_URL_MISSING");
  const client = createPublicClient({
    chain: coston2Chain,
    transport: http(rpcUrl, { retryCount: 1, timeout: 8_000 }),
  });
  return client as unknown as Coston2PublicReader;
}

function finalizedBlock(latestBlock: bigint): bigint {
  return latestBlock > finalityDepth ? latestBlock - finalityDepth : 0n;
}

function tenderStatus(value: number): Coston2TenderStatus {
  const statuses: readonly Coston2TenderStatus[] = [
    "FundingPending",
    "Open",
    "Closed",
    "ComputePending",
    "Awarded",
    "Refunded",
    "Cancelled",
  ];
  const status = statuses[value];
  if (!status) throw new Error("COSTON2_TENDER_STATUS_INVALID");
  return status;
}

function mapTender(
  tenderId: bigint,
  record: Coston2TenderRecord,
  scoringPolicy: FlareScoringPolicy,
  award: AwardFact | undefined,
  bidReferences: readonly Coston2PublicBidReference[],
): Coston2PublicTender {
  assertFlareScoringPolicy(scoringPolicy);
  if (calculateFlareRulesHash(scoringPolicy).toLowerCase() !== record.rulesHash.toLowerCase()) {
    throw new Error("COSTON2_SCORING_POLICY_HASH_MISMATCH");
  }
  return {
    ...record,
    tenderId,
    scoringPolicy,
    status: tenderStatus(record.status),
    winnerBidId: award?.award.winnerBidId ?? null,
    winner: award?.award.winner ?? null,
    winningAmountXrp: award?.award.amount ?? null,
    awardTransactionHash: award?.transactionHash ?? null,
    bidReferences,
    award: award?.award ?? null,
  };
}

async function readFoundation(
  config: Coston2MarketConfig,
  reader: Coston2PublicReader,
) {
  const [chainId, latestBlock] = await Promise.all([
    reader.getChainId(),
    reader.getBlockNumber(),
  ]);
  if (chainId !== 114) throw new Error("COSTON2_CHAIN_MISMATCH");
  const safeBlock = finalizedBlock(latestBlock);
  if (config.deploymentBlock > safeBlock) {
    throw new Error("COSTON2_DEPLOYMENT_NOT_FINALIZED");
  }
  const code = await reader.getCode({
    address: config.marketAddress,
    blockNumber: safeBlock,
  });
  if (!code || code === "0x") throw new Error("COSTON2_MARKET_CODE_MISSING");
  return { latestBlock, safeBlock, code };
}

async function readAwardFact(
  reader: Coston2PublicReader,
  awardReceipt: Address,
  tenderId: bigint,
  record: Coston2TenderRecord,
  blockNumber: bigint,
): Promise<AwardFact | undefined> {
  // A receipt exists only for a successful award. Refunded, open, and pending
  // tenders must not be interpreted as an award merely because a read failed.
  if (record.status !== 4) return undefined;
  const value = await reader.readContract({
    address: awardReceipt,
    abi: awardReceiptAbi,
    functionName: "getAward",
    args: [tenderId],
    blockNumber,
  });
  if (!value || typeof value !== "object") throw new Error("COSTON2_AWARD_MALFORMED");
  const award = value as Partial<{
    tenderId: bigint;
    winnerBidId: bigint;
    buyer: Address;
    winner: Address;
    paymentToken: Address;
    amount: bigint;
    rulesHash: Hex;
    orderedBidRoot: Hex;
    resultDigest: Hex;
    finalizedAt: bigint;
    finalizedBlock: bigint;
  }>;
  if (
    typeof award.tenderId !== "bigint" ||
    typeof award.winnerBidId !== "bigint" ||
    typeof award.buyer !== "string" ||
    typeof award.winner !== "string" ||
    typeof award.paymentToken !== "string" ||
    typeof award.amount !== "bigint" ||
    typeof award.rulesHash !== "string" ||
    typeof award.orderedBidRoot !== "string" ||
    typeof award.resultDigest !== "string" ||
    typeof award.finalizedAt !== "bigint" ||
    typeof award.finalizedBlock !== "bigint"
  ) {
    throw new Error("COSTON2_AWARD_MALFORMED");
  }
  const parsedAward: Coston2PublicAward = {
      tenderId: award.tenderId,
      winnerBidId: award.winnerBidId,
      buyer: addressResult(award.buyer, "AWARD_BUYER"),
      winner: addressResult(award.winner, "AWARD_WINNER"),
      paymentToken: addressResult(award.paymentToken, "AWARD_PAYMENT_TOKEN"),
      amount: award.amount,
      rulesHash: hexResult(award.rulesHash, "AWARD_RULES_HASH"),
      orderedBidRoot: hexResult(award.orderedBidRoot, "AWARD_BID_ROOT"),
      resultDigest: hexResult(award.resultDigest, "AWARD_RESULT_DIGEST"),
      finalizedAt: award.finalizedAt,
      finalizedBlock: award.finalizedBlock,
  };
  if (
    parsedAward.tenderId !== tenderId ||
    parsedAward.buyer.toLowerCase() !== record.buyer.toLowerCase() ||
    parsedAward.rulesHash.toLowerCase() !== record.rulesHash.toLowerCase() ||
    parsedAward.orderedBidRoot.toLowerCase() !== record.orderedBidRoot.toLowerCase() ||
    parsedAward.winnerBidId < 1n ||
    parsedAward.winnerBidId > record.bidCount ||
    parsedAward.amount < 1n ||
    parsedAward.amount > record.publicCeilingXrp ||
    parsedAward.finalizedBlock > blockNumber
  ) {
    throw new Error("COSTON2_AWARD_BINDING_MISMATCH");
  }
  return {
    award: parsedAward,
    // The receipt stores the public proof, not its mint transaction. This is
    // deliberate: the wallet-free view can inspect the receipt without a
    // provider-wide event scan.
    transactionHash: null,
  };
}

function hexResult(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`COSTON2_${field}_MALFORMED`);
  }
  return value as Hex;
}

function bidReferenceResult(
  bidId: bigint,
  value: unknown,
): Coston2PublicBidReference {
  if (!value || typeof value !== "object") {
    throw new Error("COSTON2_BID_REFERENCE_MALFORMED");
  }
  const reference = value as Partial<Omit<Coston2PublicBidReference, "bidId">>;
  if (
    typeof reference.vendor !== "string" ||
    typeof reference.submissionNonce !== "bigint" ||
    typeof reference.plaintextCommitment !== "string" ||
    typeof reference.receiptBitmap !== "number" ||
    typeof reference.receiptExpiry !== "bigint" ||
    typeof reference.acceptedBlock !== "bigint"
  ) {
    throw new Error("COSTON2_BID_REFERENCE_MALFORMED");
  }
  if (reference.receiptBitmap !== 0b111) {
    throw new Error("COSTON2_BID_REFERENCE_QUORUM_MISMATCH");
  }
  return {
    bidId,
    vendor: addressResult(reference.vendor, "BID_VENDOR"),
    submissionNonce: reference.submissionNonce,
    plaintextCommitment: hexResult(reference.plaintextCommitment, "BID_COMMITMENT"),
    receiptBitmap: reference.receiptBitmap,
    receiptExpiry: reference.receiptExpiry,
    acceptedBlock: reference.acceptedBlock,
  };
}

export async function loadCoston2PublicMarket(
  config: Coston2MarketConfig,
  suppliedReader?: Coston2PublicReader,
): Promise<Coston2PublicMarket> {
  const reader = suppliedReader ?? createReader(config.rpcUrl);
  const { latestBlock, safeBlock } = await readFoundation(config, reader);
  const [tenderCount, awardReceiptValue] = await Promise.all([
    reader.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName: "tenderCount",
      blockNumber: safeBlock,
    }),
    reader.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName: "awardReceipt",
      blockNumber: safeBlock,
    }),
  ]);
  if (typeof tenderCount !== "bigint") throw new Error("COSTON2_TENDER_COUNT_MALFORMED");
  const awardReceipt = addressResult(awardReceiptValue, "AWARD_RECEIPT");
  const tenders = await Promise.all(
    Array.from({ length: Number(tenderCount) }, (_, index) => BigInt(index + 1)).map(async (tenderId) => {
      const [record, scoringPolicy] = await Promise.all([
        reader.readContract({
          address: config.marketAddress,
          abi: marketAbi,
          functionName: "getTender",
          args: [tenderId],
          blockNumber: safeBlock,
        }),
        reader.readContract({
          address: config.marketAddress,
          abi: marketAbi,
          functionName: "getScoringPolicy",
          args: [tenderId],
          blockNumber: safeBlock,
        }),
      ]);
      const typedRecord = record as Coston2TenderRecord;
      if (typedRecord.bidCount < 0n || typedRecord.bidCount > 8n) {
        throw new Error("COSTON2_BID_COUNT_OUT_OF_RANGE");
      }
      const [award, bidReferences] = await Promise.all([
        readAwardFact(reader, awardReceipt, tenderId, typedRecord, safeBlock),
        Promise.all(
          Array.from({ length: Number(typedRecord.bidCount) }, (_, index) => BigInt(index + 1))
            .map(async (bidId) => bidReferenceResult(bidId, await reader.readContract({
              address: config.marketAddress,
              abi: marketAbi,
              functionName: "getBidReference",
              args: [tenderId, bidId],
              blockNumber: safeBlock,
            }))),
        ),
      ]);
      return mapTender(
        tenderId,
        typedRecord,
        scoringPolicy as FlareScoringPolicy,
        award,
        bidReferences,
      );
    }),
  );

  return {
    chainId: 114,
    tenders,
    indexedBlock: safeBlock,
    finalizedBlock: safeBlock,
    latestBlock,
    deploymentStatus: config.deploymentStatus,
  };
}

function addressResult(value: unknown, field: string): Address {
  if (typeof value !== "string") throw new Error(`COSTON2_${field}_MALFORMED`);
  try {
    return getAddress(value);
  } catch {
    throw new Error(`COSTON2_${field}_MALFORMED`);
  }
}

export async function loadCoston2ProtocolBinding(
  config: Coston2MarketConfig,
  suppliedReader?: Coston2PublicReader,
): Promise<Coston2ProtocolBinding> {
  const reader = suppliedReader ?? createReader(config.rpcUrl);
  const { safeBlock, code } = await readFoundation(config, reader);
  const [
    paymentToken,
    teeManager,
    ftso,
    teeExtensionRegistry,
    awardReceipt,
    tenderCount,
    teeCount,
    bidReceiptThreshold,
    resultThreshold,
  ] =
    await Promise.all([
      "paymentToken",
      "teeManager",
      "ftso",
      "teeExtensionRegistry",
      "awardReceipt",
      "tenderCount",
      "TEE_COUNT",
      "BID_RECEIPT_THRESHOLD",
      "RESULT_THRESHOLD",
    ].map((functionName) => reader.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName,
      blockNumber: safeBlock,
    })));
  if (
    typeof tenderCount !== "bigint" || typeof teeCount !== "bigint" ||
    typeof bidReceiptThreshold !== "number" || typeof resultThreshold !== "number"
  ) {
    throw new Error("COSTON2_PROTOCOL_CONSTANT_MALFORMED");
  }
  return {
    chainId: 114,
    marketAddress: config.marketAddress,
    deploymentStatus: config.deploymentStatus,
    deploymentBlock: config.deploymentBlock,
    finalizedBlock: safeBlock,
    runtimeCodeHash: keccak256(code),
    runtimeCodeSize: (code.length - 2) / 2,
    paymentToken: addressResult(paymentToken, "PAYMENT_TOKEN"),
    teeManager: addressResult(teeManager, "TEE_MANAGER"),
    ftso: addressResult(ftso, "FTSO"),
    teeExtensionRegistry: addressResult(teeExtensionRegistry, "TEE_EXTENSION_REGISTRY"),
    awardReceipt: addressResult(awardReceipt, "AWARD_RECEIPT"),
    tenderCount,
    teeCount,
    bidReceiptThreshold,
    resultThreshold,
  };
}
