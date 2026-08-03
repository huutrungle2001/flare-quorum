import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  keccak256,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import marketAbiJson from "../generated/abis/VeilBidFlareMarket.json" with { type: "json" };

const marketAbi = marketAbiJson as Abi;
const finalityDepth = 12n;
const logChunkSize = 2_000n;

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
  winnerBidId: bigint;
  winner: Address;
  winningAmountXrp: bigint;
  transactionHash: Hex;
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

function decodeAwardFacts(logs: readonly Coston2PublicLog[]): Map<bigint, AwardFact> {
  const awards = new Map<bigint, AwardFact>();
  for (const log of logs) {
    if (log.transactionHash === null) continue;
    try {
      const decoded = decodeEventLog({
        abi: marketAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      if (decoded.eventName !== "TenderAwarded") continue;
      const args = decoded.args as unknown as {
        tenderId: bigint;
        winnerBidId: bigint;
        winner: Address;
        amount: bigint;
      };
      awards.set(args.tenderId, {
        winnerBidId: args.winnerBidId,
        winner: args.winner,
        winningAmountXrp: args.amount,
        transactionHash: log.transactionHash,
      });
    } catch {
      // Unrelated logs are ignored; no result or award is inferred from them.
    }
  }
  return awards;
}

function mapTender(
  tenderId: bigint,
  record: Coston2TenderRecord,
  award: AwardFact | undefined,
): Coston2PublicTender {
  return {
    ...record,
    tenderId,
    status: tenderStatus(record.status),
    winnerBidId: award?.winnerBidId ?? null,
    winner: award?.winner ?? null,
    winningAmountXrp: award?.winningAmountXrp ?? null,
    awardTransactionHash: award?.transactionHash ?? null,
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

export async function loadCoston2PublicMarket(
  config: Coston2MarketConfig,
  suppliedReader?: Coston2PublicReader,
): Promise<Coston2PublicMarket> {
  const reader = suppliedReader ?? createReader(config.rpcUrl);
  const { latestBlock, safeBlock } = await readFoundation(config, reader);
  const tenderCount = await reader.readContract({
    address: config.marketAddress,
    abi: marketAbi,
    functionName: "tenderCount",
    blockNumber: safeBlock,
  });
  if (typeof tenderCount !== "bigint") throw new Error("COSTON2_TENDER_COUNT_MALFORMED");

  const logs: Coston2PublicLog[] = [];
  for (
    let fromBlock = config.deploymentBlock;
    fromBlock <= safeBlock;
    fromBlock += logChunkSize
  ) {
    const toBlock = fromBlock + logChunkSize - 1n < safeBlock
      ? fromBlock + logChunkSize - 1n
      : safeBlock;
    logs.push(...await reader.getLogs({
      address: config.marketAddress,
      fromBlock,
      toBlock,
    }));
  }

  const awards = decodeAwardFacts(logs);
  const tenders: Coston2PublicTender[] = [];
  for (let tenderId = 1n; tenderId <= tenderCount; tenderId += 1n) {
    const record = await reader.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName: "getTender",
      args: [tenderId],
      blockNumber: safeBlock,
    });
    tenders.push(mapTender(
      tenderId,
      record as Coston2TenderRecord,
      awards.get(tenderId),
    ));
  }

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
  const [paymentToken, teeManager, ftso, teeExtensionRegistry, awardReceipt, tenderCount, teeCount, resultThreshold] =
    await Promise.all([
      "paymentToken",
      "teeManager",
      "ftso",
      "teeExtensionRegistry",
      "awardReceipt",
      "tenderCount",
      "TEE_COUNT",
      "RESULT_THRESHOLD",
    ].map((functionName) => reader.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName,
      blockNumber: safeBlock,
    })));
  if (typeof tenderCount !== "bigint" || typeof teeCount !== "bigint" || typeof resultThreshold !== "number") {
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
    resultThreshold,
  };
}
