import {
  veilBidFlareMarketAbi,
  type Coston2FlareDeployment,
} from "@veilbid/flare-bindings";
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";

const marketAbi = veilBidFlareMarketAbi as Abi;
const finalityDepth = 12n;
const logChunkSize = 2_000n;
const coston2Chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

export type FlareTenderStatus =
  | "FundingPending"
  | "Open"
  | "Closed"
  | "ComputePending"
  | "Awarded"
  | "Refunded"
  | "Cancelled";

export interface FlarePublicTender {
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
  resultNonce: bigint;
  resultExpiry: bigint;
  requestId: Hex;
  status: FlareTenderStatus;
  teeIds: readonly [Address, Address, Address];
  teeKeyFingerprints: readonly [Hex, Hex, Hex];
  winnerBidId: bigint | null;
  winner: Address | null;
  winningAmountXrp: bigint | null;
  awardTransactionHash: Hex | null;
}

export interface FlareMarketConfig {
  rpcUrl: string;
  marketAddress: Address;
  deploymentBlock: bigint;
  deploymentStatus: Coston2FlareDeployment["status"];
}

export interface LoadedFlarePublicMarket {
  chainId: 114;
  tenders: readonly FlarePublicTender[];
  indexedBlock: bigint;
  finalizedBlock: bigint;
  latestBlock: bigint;
  deploymentStatus: Coston2FlareDeployment["status"];
}

interface FlareTenderRecord {
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

export function resolveFlareMarketConfig(
  env: Record<string, string | undefined> = import.meta.env,
): FlareMarketConfig {
  const rpcUrl = env.VITE_COSTON2_RPC_URL?.trim();
  const marketAddress = env.VITE_FLARE_MARKET_ADDRESS?.trim();
  const deploymentBlock = env.VITE_FLARE_MARKET_DEPLOYMENT_BLOCK?.trim();
  const deploymentStatus = env.VITE_FLARE_DEPLOYMENT_STATUS?.trim() || "planned";
  if (!rpcUrl || !marketAddress || !deploymentBlock) {
    throw new Error("FLARE_MARKET_NOT_CONFIGURED");
  }
  if (!isAddress(marketAddress)) throw new Error("FLARE_MARKET_ADDRESS_INVALID");
  if (!/^[0-9]+$/.test(deploymentBlock)) throw new Error("FLARE_DEPLOYMENT_BLOCK_INVALID");
  if (deploymentStatus !== "planned" && deploymentStatus !== "verified") {
    throw new Error("FLARE_DEPLOYMENT_STATUS_INVALID");
  }
  return {
    rpcUrl,
    marketAddress: getAddress(marketAddress),
    deploymentBlock: BigInt(deploymentBlock),
    deploymentStatus,
  };
}

function tenderStatus(value: number): FlareTenderStatus {
  const statuses: readonly FlareTenderStatus[] = [
    "FundingPending", "Open", "Closed", "ComputePending", "Awarded", "Refunded", "Cancelled",
  ];
  const status = statuses[value];
  if (!status) throw new Error("FLARE_TENDER_STATUS_INVALID");
  return status;
}

function decodeAwardFacts(
  logs: readonly { data: Hex; topics: readonly Hex[]; transactionHash: Hex | null }[],
): Map<bigint, AwardFact> {
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
      // Ignore unrelated logs; no fallback or synthetic public result is used.
    }
  }
  return awards;
}

function mapTender(
  tenderId: bigint,
  record: FlareTenderRecord,
  award: AwardFact | undefined,
): FlarePublicTender {
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

export async function loadFlarePublicMarket(
  config = resolveFlareMarketConfig(),
): Promise<LoadedFlarePublicMarket> {
  const client = createPublicClient({
    chain: coston2Chain,
    transport: http(config.rpcUrl, { retryCount: 1, timeout: 8_000 }),
  });
  const [chainId, latestBlock, code, tenderCount] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getCode({ address: config.marketAddress }),
    client.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName: "tenderCount",
    }),
  ]);
  if (chainId !== 114) throw new Error("FLARE_CHAIN_MISMATCH");
  if (!code || code === "0x") throw new Error("FLARE_MARKET_CODE_MISSING");
  if (config.deploymentBlock > latestBlock) throw new Error("FLARE_DEPLOYMENT_BLOCK_FUTURE");
  if (typeof tenderCount !== "bigint") throw new Error("FLARE_TENDER_COUNT_MALFORMED");

  const finalizedBlock = latestBlock > finalityDepth ? latestBlock - finalityDepth : 0n;
  const logs: { data: Hex; topics: readonly Hex[]; transactionHash: Hex | null }[] = [];
  for (let fromBlock = config.deploymentBlock; fromBlock <= latestBlock; fromBlock += logChunkSize) {
    const toBlock = fromBlock + logChunkSize - 1n < latestBlock
      ? fromBlock + logChunkSize - 1n
      : latestBlock;
    logs.push(...await client.getLogs({
      address: config.marketAddress,
      fromBlock,
      toBlock,
    }));
  }
  const awards = decodeAwardFacts(logs);
  const tenders: FlarePublicTender[] = [];
  for (let tenderId = 1n; tenderId <= tenderCount; tenderId += 1n) {
    const record = await client.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName: "getTender",
      args: [tenderId],
    });
    tenders.push(mapTender(tenderId, record as unknown as FlareTenderRecord, awards.get(tenderId)));
  }
  return {
    chainId: 114,
    tenders,
    indexedBlock: latestBlock,
    finalizedBlock,
    latestBlock,
    deploymentStatus: config.deploymentStatus,
  };
}
