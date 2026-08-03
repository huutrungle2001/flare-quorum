import assert from "node:assert/strict";
import test from "node:test";
import { rebuildBidRoot, selectionResultDigest } from "../src/protocol.ts";

test("Flare ordered root matches the canonical Go/Solidity vector", () => {
  const root = rebuildBidRoot(42n, [
    { bidId: 1n, vendor: "0x1000000000000000000000000000000000000001", plaintextCommitment: "0x0000000000000000000000000000000000000000000000000000000000001111", receiptBitmap: 7, acceptedBlock: 33500001n },
    { bidId: 2n, vendor: "0x2000000000000000000000000000000000000002", plaintextCommitment: "0x0000000000000000000000000000000000000000000000000000000000002222", receiptBitmap: 7, acceptedBlock: 33500009n },
  ]);
  assert.equal(root, "0xed019a9542e15443dda5329d4988cf864e9189e39200755837488fcba327eb13");
});

test("rejects a championship root missing any frozen TEE receipt", () => {
  assert.throws(() => rebuildBidRoot(42n, [{
    bidId: 1n,
    vendor: "0x1000000000000000000000000000000000000001",
    plaintextCommitment: "0x0000000000000000000000000000000000000000000000000000000000001111",
    receiptBitmap: 3,
    acceptedBlock: 33_500_001n,
  }]), /INCOMPLETE_RECEIPT_QUORUM/);
});

test("Flare result digest binds the full public selection envelope", () => {
  const digest = selectionResultDigest({
    schemaVersion: 1, chainId: 114n, market: "0x1000000000000000000000000000000000000001", extensionId: 65537n,
    codeVersion: "0x0000000000000000000000000000000000000000000000000000000000001111", tenderId: 42n,
    rulesHash: "0x0000000000000000000000000000000000000000000000000000000000002222",
    orderedBidRoot: "0x0000000000000000000000000000000000000000000000000000000000003333", quorumBitmap: 7,
    ftsoFeedId: "0x5852502f5553440000000000000000000000000000", ftsoValue: 250000n, ftsoDecimals: 5,
    ftsoTimestamp: 1700000000n, closeBlock: 33500010n, winnerBidId: 1n,
    winner: "0x2000000000000000000000000000000000000002", winningAmountXrp: 400000n, resultNonce: 3n, expiry: 2000n,
  });
  assert.equal(digest, "0xe323859bd3351602eb780752822de0adb41ffca6f2906f9095bb3b0a3baa9763");
});
