import {
  collectSelectionQuorum,
  FccSelectionPendingError,
  type FlareTenderSelectionContext,
  type SelectionQuorum,
} from "./flare-results.js";
import { veilBidFlareMarketAbi } from "@veilbid/flare-bindings";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  type Abi,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { FlareRelayConfig } from "./flare-config.js";

const marketAbi = veilBidFlareMarketAbi as Abi;
const coston2Chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

export type FlareTenderStatus =
  | "FundingPending" | "Open" | "Closed" | "ComputePending"
  | "Awarded" | "Refunded" | "Cancelled";

export interface FlareTender {
  tenderId: bigint;
  buyer: Address;
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
  selectionAttempt: bigint;
  resultNonce: bigint;
  resultExpiry: bigint;
  requestId: Hex;
  status: FlareTenderStatus;
  teeIds: readonly [Address, Address, Address];
}

export type FlareLifecycleAction =
  | { kind: "close" | "request" | "retry" | "finalize"; tenderId: bigint };

export interface FlareLifecycleSummary {
  latestBlock: bigint;
  chainTimestamp: bigint;
  tenders: readonly FlareTender[];
  actions: readonly FlareLifecycleAction[];
}

function status(value: unknown): FlareTenderStatus {
  const values: readonly FlareTenderStatus[] = [
    "FundingPending", "Open", "Closed", "ComputePending", "Awarded", "Refunded", "Cancelled",
  ];
  if (!Number.isInteger(value) || values[value as number] === undefined) throw new Error("MALFORMED_FLARE_TENDER");
  return values[value as number];
}

function tuple(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`MALFORMED_${name}`);
  return value as Record<string, unknown>;
}

function bigintField(value: unknown, name: string): bigint {
  if (typeof value !== "bigint") throw new Error(`MALFORMED_${name}`);
  return value;
}

function addressField(value: unknown, name: string): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new Error(`MALFORMED_${name}`);
  return getAddress(value);
}

function hexField(value: unknown, name: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) throw new Error(`MALFORMED_${name}`);
  return value.toLowerCase() as Hex;
}

export function parseFlareTender(tenderId: bigint, value: unknown): FlareTender {
  const item = tuple(value, "FLARE_TENDER");
  const teeIds = item.teeIds;
  if (!Array.isArray(teeIds) || teeIds.length !== 3) throw new Error("MALFORMED_FLARE_TEE_SET");
  const parsedTeeIds = teeIds.map((id) => addressField(id, "FLARE_TEE_ID")) as [Address, Address, Address];
  if (new Set(parsedTeeIds.map((id) => id.toLowerCase())).size !== 3) throw new Error("DUPLICATE_FLARE_TEE_ID");
  const record: FlareTender = {
    tenderId,
    buyer: addressField(item.buyer, "FLARE_BUYER"),
    rulesHash: hexField(item.rulesHash, "FLARE_RULES_HASH"),
    publicCeilingXrp: bigintField(item.publicCeilingXrp, "FLARE_CEILING"),
    bidDeadline: bigintField(item.bidDeadline, "FLARE_DEADLINE"),
    closeBlock: bigintField(item.closeBlock, "FLARE_CLOSE_BLOCK"),
    bidCount: bigintField(item.bidCount, "FLARE_BID_COUNT"),
    approvedVendorCount: Number(item.approvedVendorCount),
    commonQuorumBitmap: Number(item.commonQuorumBitmap),
    orderedBidRoot: hexField(item.orderedBidRoot, "FLARE_BID_ROOT"),
    extensionId: bigintField(item.extensionId, "FLARE_EXTENSION_ID"),
    codeVersion: hexField(item.codeVersion, "FLARE_CODE_VERSION"),
    ftsoFeedId: hexField(item.ftsoFeedId, "FLARE_FTSO_FEED"),
    ftsoValue: bigintField(item.ftsoValue, "FLARE_FTSO_VALUE"),
    ftsoDecimals: Number(item.ftsoDecimals),
    ftsoTimestamp: bigintField(item.ftsoTimestamp, "FLARE_FTSO_TIMESTAMP"),
    selectionStartedAt: bigintField(item.selectionStartedAt, "FLARE_SELECTION_STARTED"),
    selectionAttempt: bigintField(item.selectionAttempt, "FLARE_SELECTION_ATTEMPT"),
    resultNonce: bigintField(item.resultNonce, "FLARE_RESULT_NONCE"),
    resultExpiry: bigintField(item.resultExpiry, "FLARE_RESULT_EXPIRY"),
    requestId: hexField(item.requestId, "FLARE_REQUEST_ID"),
    status: status(item.status),
    teeIds: parsedTeeIds,
  };
  if (!Number.isSafeInteger(record.approvedVendorCount) || !Number.isSafeInteger(record.commonQuorumBitmap)) {
    throw new Error("MALFORMED_FLARE_TENDER_COUNTS");
  }
  return record;
}

/** Plans only permissionless chain transitions; it never invents a result. */
export function planFlareLifecycle(
  tenders: readonly FlareTender[],
  chainTimestamp: bigint,
): readonly FlareLifecycleAction[] {
  const actions: FlareLifecycleAction[] = [];
  for (const tender of tenders) {
    if (tender.status === "ComputePending") {
      actions.push({ kind: tender.resultExpiry < chainTimestamp ? "retry" : "finalize", tenderId: tender.tenderId });
    } else if (tender.status === "Closed") {
      actions.push({ kind: "request", tenderId: tender.tenderId });
    } else if (
      tender.status === "Open"
      && (chainTimestamp >= tender.bidDeadline || tender.bidCount >= BigInt(tender.approvedVendorCount))
    ) {
      actions.push({ kind: "close", tenderId: tender.tenderId });
    }
  }
  return actions.sort((left, right) => {
    const priority = { finalize: 0, retry: 1, request: 2, close: 3 } as const;
    return priority[left.kind] - priority[right.kind] || Number(left.tenderId - right.tenderId);
  });
}

export class FlareLifecycleRelay {
  readonly config: FlareRelayConfig;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | null;
  readonly account: Account | null;

  constructor(config: FlareRelayConfig) {
    this.config = config;
    this.publicClient = createPublicClient({
      chain: coston2Chain,
      transport: http(config.rpcUrl, { retryCount: 1, timeout: 8_000 }),
    });
    if (config.signerPrivateKey === null) {
      this.walletClient = null;
      this.account = null;
    } else {
      const account = privateKeyToAccount(config.signerPrivateKey);
      this.account = account;
      this.walletClient = createWalletClient({
        account,
        chain: coston2Chain,
        transport: http(config.rpcUrl, { retryCount: 1, timeout: 8_000 }),
      });
    }
  }

  async snapshot(): Promise<FlareLifecycleSummary> {
    const [block, countValue] = await Promise.all([
      this.publicClient.getBlock({ blockTag: "latest" }),
      this.publicClient.readContract({ address: this.config.marketAddress, abi: marketAbi, functionName: "tenderCount" }),
    ]);
    if (block.number === null || typeof block.timestamp !== "bigint" || typeof countValue !== "bigint") {
      throw new Error("MALFORMED_FLARE_CHAIN_SNAPSHOT");
    }
    const tenders: FlareTender[] = [];
    for (let tenderId = 1n; tenderId <= countValue; tenderId += 1n) {
      const value = await this.publicClient.readContract({
        address: this.config.marketAddress,
        abi: marketAbi,
        functionName: "getTender",
        args: [tenderId],
      });
      tenders.push(parseFlareTender(tenderId, value));
    }
    return {
      latestBlock: block.number,
      chainTimestamp: block.timestamp,
      tenders,
      actions: planFlareLifecycle(tenders, block.timestamp),
    };
  }

  private assertWritable(): asserts this is this & { walletClient: WalletClient; account: Account } {
    if (this.walletClient === null || this.account === null) throw new Error("FLARE_RELAY_WRITE_DISABLED");
    if (this.config.deploymentStatus !== "verified") throw new Error("FLARE_RELAY_DEPLOYMENT_UNVERIFIED");
    if (this.config.fccInstructionFeeWei === null || this.config.fccExtensionVersion === null) {
      throw new Error("FLARE_RELAY_FCC_CONFIG_MISSING");
    }
  }

  private async write(functionName: string, args: readonly unknown[], value?: bigint): Promise<Hex> {
    this.assertWritable();
    const request = await this.publicClient.simulateContract({
      address: this.config.marketAddress,
      abi: marketAbi,
      functionName,
      args,
      account: this.account,
      ...(value === undefined ? {} : { value }),
    });
    const hash = await this.walletClient.writeContract(request.request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("FLARE_RELAY_TRANSACTION_FAILED");
    return hash;
  }

  async execute(action: FlareLifecycleAction): Promise<Hex | SelectionQuorum> {
    this.assertWritable();
    const instructionFee = this.config.fccInstructionFeeWei;
    if (instructionFee === null) throw new Error("FLARE_RELAY_FCC_CONFIG_MISSING");
    const tender = parseFlareTender(action.tenderId, await this.publicClient.readContract({
      address: this.config.marketAddress,
      abi: marketAbi,
      functionName: "getTender",
      args: [action.tenderId],
    }));
    if (action.kind === "close") {
      return this.write("closeTender", [action.tenderId]);
    }
    if (action.kind === "request") {
      if (tender.status !== "Closed") throw new Error("FLARE_TENDER_STATE_RACE");
      return this.write("requestSelection", [action.tenderId], instructionFee);
    }
    if (action.kind === "retry") {
      if (tender.status !== "ComputePending") throw new Error("FLARE_TENDER_STATE_RACE");
      return this.write("retrySelection", [action.tenderId], instructionFee);
    }
    if (tender.status !== "ComputePending" || tender.requestId === `0x${"00".repeat(32)}`) {
      throw new Error("FLARE_TENDER_STATE_RACE");
    }
    if (this.config.fccExtensionVersion === null) throw new Error("FLARE_RELAY_FCC_CONFIG_MISSING");
    const context: FlareTenderSelectionContext = {
      market: this.config.marketAddress,
      tenderId: tender.tenderId,
      extensionId: tender.extensionId,
      codeVersion: tender.codeVersion,
      rulesHash: tender.rulesHash,
      orderedBidRoot: tender.orderedBidRoot,
      commonQuorumBitmap: tender.commonQuorumBitmap,
      ftsoFeedId: tender.ftsoFeedId,
      ftsoValue: tender.ftsoValue,
      ftsoDecimals: tender.ftsoDecimals,
      ftsoTimestamp: tender.ftsoTimestamp,
      closeBlock: tender.closeBlock,
      resultNonce: tender.resultNonce,
      resultExpiry: tender.resultExpiry,
      requestId: tender.requestId,
      teeIds: tender.teeIds,
    };
    const quorum = await collectSelectionQuorum({
      proxyUrls: this.config.fccProxyUrls,
      context,
      expectedVersion: this.config.fccExtensionVersion,
    });
    await this.write("finalizeTender", [action.tenderId, quorum.result, quorum.proofs]);
    return quorum;
  }
}

export { FccSelectionPendingError };
