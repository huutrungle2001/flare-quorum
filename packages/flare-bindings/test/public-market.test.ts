import assert from "node:assert/strict";
import test from "node:test";
import type { Address, Hex } from "viem";
import {
  loadCoston2ProtocolBinding,
  loadCoston2PublicMarket,
  type Coston2MarketConfig,
  type Coston2PublicReader,
} from "../dist/public-market.js";
import { calculateFlareRulesHash, coston2XrpUsdFeedId } from "../dist/smart-account.js";

const market = "0x1000000000000000000000000000000000000001" as Address;
const buyer = "0x2000000000000000000000000000000000000002" as Address;
const token = "0x3000000000000000000000000000000000000003" as Address;
const manager = "0x4000000000000000000000000000000000000004" as Address;
const ftso = "0x5000000000000000000000000000000000000005" as Address;
const receipt = "0x6000000000000000000000000000000000000006" as Address;
const vendor = "0x7000000000000000000000000000000000000007" as Address;
const hash = `0x${"11".repeat(32)}` as Hex;
const zeroHash = `0x${"00".repeat(32)}` as Hex;

const config: Coston2MarketConfig = {
  rpcUrl: "https://coston2.example.invalid/rpc",
  marketAddress: market,
  deploymentBlock: 80n,
  deploymentStatus: "planned",
};

function mockReader(options: { rulesHash?: Hex; status?: number; award?: unknown } = {}) {
  const readBlocks: bigint[] = [];
  const logRanges: { fromBlock: bigint; toBlock: bigint }[] = [];
  const scoringPolicy = {
    schemaVersion: 1,
    ceilingXrpMicros: 1_000_000n,
    bidDeadline: 1_000n,
    allowXrp: true,
    allowUsd: true,
    ftsoFeedId: coston2XrpUsdFeedId,
    maxDeliveryDays: 30,
    minWarrantyDays: 12,
    maxWarrantyDays: 36,
    priceWeightBps: 6_000,
    deliveryWeightBps: 2_500,
    warrantyWeightBps: 1_500,
    requiredCredentials: [],
  } as const;
  const record = {
    buyer,
    metadataHash: hash,
    rulesHash: options.rulesHash ?? calculateFlareRulesHash(scoringPolicy),
    publicCeilingXrp: 1_000_000n,
    bidDeadline: 1_000n,
    closeBlock: 88n,
    bidCount: 2n,
    approvedVendorCount: 2,
    commonQuorumBitmap: 7,
    orderedBidRoot: hash,
    extensionId: 65_921n,
    codeVersion: hash,
    ftsoFeedId: coston2XrpUsdFeedId,
    ftsoValue: 250_000n,
    ftsoDecimals: 5,
    ftsoTimestamp: 900n,
    selectionStartedAt: 901n,
    selectionAttempt: 1,
    resultNonce: 2n,
    resultExpiry: 1_200n,
    requestId: zeroHash,
    status: options.status ?? 3,
    teeIds: [manager, ftso, receipt],
    teeKeyFingerprints: [hash, hash, hash],
  } as const;
  const awardValue = options.award && typeof options.award === "object"
    ? { ...(options.award as Record<string, unknown>), rulesHash: record.rulesHash }
    : options.award;
  const values: Record<string, unknown> = {
    tenderCount: 1n,
    paymentToken: token,
    teeManager: manager,
    ftso,
    teeExtensionRegistry: manager,
    awardReceipt: receipt,
    TEE_COUNT: 3n,
    BID_RECEIPT_THRESHOLD: 3,
    RESULT_THRESHOLD: 2,
    getAward: awardValue,
    getBidReference: {
      vendor,
      submissionNonce: 1n,
      plaintextCommitment: hash,
      receiptBitmap: 7,
      receiptExpiry: 1_100n,
      acceptedBlock: 84n,
    },
  };
  const reader: Coston2PublicReader = {
    async getChainId() {
      return 114;
    },
    async getBlockNumber() {
      return 100n;
    },
    async getCode({ blockNumber }) {
      readBlocks.push(blockNumber);
      return "0x6000";
    },
    async getLogs({ fromBlock, toBlock }) {
      logRanges.push({ fromBlock, toBlock });
      return [];
    },
    async readContract({ functionName, blockNumber }) {
      readBlocks.push(blockNumber);
      if (functionName === "getTender") return record;
      if (functionName === "getScoringPolicy") return scoringPolicy;
      return values[functionName];
    },
  };
  return { reader, readBlocks, logRanges };
}

test("reads market state and award logs only through the finalized Coston2 block", async () => {
  const { reader, readBlocks, logRanges } = mockReader();
  const result = await loadCoston2PublicMarket(config, reader);
  assert.equal(result.latestBlock, 100n);
  assert.equal(result.finalizedBlock, 88n);
  assert.equal(result.indexedBlock, 88n);
  assert.deepEqual(logRanges, []);
  assert.equal(readBlocks.every((block) => block === 88n), true);
  assert.equal(result.tenders[0]?.status, "ComputePending");
  assert.equal(result.tenders[0]?.scoringPolicy.priceWeightBps, 6_000);
  assert.equal(result.tenders[0]?.winner, null);
  assert.equal(result.tenders[0]?.bidReferences.length, 2);
  assert.equal(result.tenders[0]?.bidReferences[0]?.vendor, vendor);
  assert.equal(result.tenders[0]?.bidReferences[0]?.receiptBitmap, 7);
});

test("reads an awarded tender from the public receipt contract", async () => {
  const { reader } = mockReader({
    status: 4,
    award: {
      tenderId: 1n,
      winnerBidId: 2n,
      buyer,
      winner: vendor,
      paymentToken: token,
      amount: 500_000n,
      rulesHash: hash,
      orderedBidRoot: hash,
      resultDigest: hash,
      finalizedAt: 950n,
      finalizedBlock: 87n,
    },
  });
  const result = await loadCoston2PublicMarket(config, reader);
  assert.equal(result.tenders[0]?.status, "Awarded");
  assert.equal(result.tenders[0]?.winnerBidId, 2n);
  assert.equal(result.tenders[0]?.winner, vendor);
  assert.equal(result.tenders[0]?.winningAmountXrp, 500_000n);
  assert.equal(result.tenders[0]?.award?.resultDigest, hash);
  assert.equal(result.tenders[0]?.award?.finalizedBlock, 87n);
  assert.equal(result.tenders[0]?.awardTransactionHash, null);
});

test("returns public immutable protocol bindings without result or signature material", async () => {
  const { reader, readBlocks } = mockReader();
  const result = await loadCoston2ProtocolBinding(config, reader);
  assert.equal(result.chainId, 114);
  assert.equal(result.finalizedBlock, 88n);
  assert.equal(result.paymentToken, token);
  assert.equal(result.teeManager, manager);
  assert.equal(result.teeExtensionRegistry, manager);
  assert.equal(result.teeCount, 3n);
  assert.equal(result.bidReceiptThreshold, 3);
  assert.equal(result.resultThreshold, 2);
  assert.equal(readBlocks.every((block) => block === 88n), true);
  assert.doesNotMatch(JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value), /signature|ciphertext|resultData/i);
});

test("fails closed while the configured deployment block is not finalized", async () => {
  const { reader } = mockReader();
  await assert.rejects(
    () => loadCoston2PublicMarket({ ...config, deploymentBlock: 89n }, reader),
    /COSTON2_DEPLOYMENT_NOT_FINALIZED/,
  );
});

test("fails closed when finalized tender state and public scoring policy disagree", async () => {
  const { reader } = mockReader({ rulesHash: zeroHash });
  await assert.rejects(
    () => loadCoston2PublicMarket(config, reader),
    /COSTON2_SCORING_POLICY_HASH_MISMATCH/,
  );
});
