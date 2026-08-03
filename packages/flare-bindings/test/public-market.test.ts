import assert from "node:assert/strict";
import test from "node:test";
import type { Address, Hex } from "viem";
import {
  loadCoston2ProtocolBinding,
  loadCoston2PublicMarket,
  type Coston2MarketConfig,
  type Coston2PublicReader,
} from "../src/public-market.ts";

const market = "0x1000000000000000000000000000000000000001" as Address;
const buyer = "0x2000000000000000000000000000000000000002" as Address;
const token = "0x3000000000000000000000000000000000000003" as Address;
const manager = "0x4000000000000000000000000000000000000004" as Address;
const ftso = "0x5000000000000000000000000000000000000005" as Address;
const receipt = "0x6000000000000000000000000000000000000006" as Address;
const hash = `0x${"11".repeat(32)}` as Hex;
const zeroHash = `0x${"00".repeat(32)}` as Hex;

const config: Coston2MarketConfig = {
  rpcUrl: "https://coston2.example.invalid/rpc",
  marketAddress: market,
  deploymentBlock: 80n,
  deploymentStatus: "planned",
};

function mockReader() {
  const readBlocks: bigint[] = [];
  const logRanges: { fromBlock: bigint; toBlock: bigint }[] = [];
  const record = {
    buyer,
    metadataHash: hash,
    rulesHash: hash,
    publicCeilingXrp: 1_000_000n,
    bidDeadline: 1_000n,
    closeBlock: 88n,
    bidCount: 2n,
    approvedVendorCount: 2,
    commonQuorumBitmap: 7,
    orderedBidRoot: hash,
    extensionId: 65_921n,
    codeVersion: hash,
    ftsoFeedId: `0x${"12".repeat(21)}` as Hex,
    ftsoValue: 250_000n,
    ftsoDecimals: 5,
    ftsoTimestamp: 900n,
    selectionStartedAt: 901n,
    selectionAttempt: 1,
    resultNonce: 2n,
    resultExpiry: 1_200n,
    requestId: zeroHash,
    status: 3,
    teeIds: [manager, ftso, receipt],
    teeKeyFingerprints: [hash, hash, hash],
  } as const;
  const values: Record<string, unknown> = {
    tenderCount: 1n,
    paymentToken: token,
    teeManager: manager,
    ftso,
    teeExtensionRegistry: manager,
    awardReceipt: receipt,
    TEE_COUNT: 3n,
    RESULT_THRESHOLD: 2,
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
  assert.deepEqual(logRanges, [{ fromBlock: 80n, toBlock: 88n }]);
  assert.equal(readBlocks.every((block) => block === 88n), true);
  assert.equal(result.tenders[0]?.status, "ComputePending");
  assert.equal(result.tenders[0]?.winner, null);
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
