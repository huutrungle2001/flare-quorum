import assert from "node:assert/strict";
import test from "node:test";
import {
  parseFlareTender,
  planFlareLifecycle,
} from "../dist/flare-lifecycle.js";

const ids = [
  "0x1000000000000000000000000000000000000001",
  "0x2000000000000000000000000000000000000002",
  "0x3000000000000000000000000000000000000003",
];

function rawTender(status, overrides = {}) {
  return {
    buyer: "0x4000000000000000000000000000000000000004",
    rulesHash: `0x${"11".repeat(32)}`,
    publicCeilingXrp: 1_000_000n,
    bidDeadline: 2_000n,
    closeBlock: 100n,
    bidCount: 0n,
    approvedVendorCount: 2,
    commonQuorumBitmap: 7,
    orderedBidRoot: `0x${"22".repeat(32)}`,
    extensionId: 65_537n,
    codeVersion: `0x${"33".repeat(32)}`,
    ftsoFeedId: "0x015852502f55534400000000000000000000000000",
    ftsoValue: 250_000n,
    ftsoDecimals: 5,
    ftsoTimestamp: 1_900n,
    selectionStartedAt: 1_500n,
    selectionAttempt: 1n,
    resultNonce: 4n,
    resultExpiry: 2_500n,
    requestId: `0x${"44".repeat(32)}`,
    status,
    teeIds: ids,
    ...overrides,
  };
}

test("parses the current tender tuple and rejects duplicate frozen TEE identities", () => {
  const tender = parseFlareTender(7n, rawTender(3));
  assert.equal(tender.tenderId, 7n);
  assert.equal(tender.status, "ComputePending");
  assert.equal(tender.selectionAttempt, 1n);
  assert.throws(() => parseFlareTender(7n, rawTender(3, { teeIds: [ids[0], ids[0], ids[2]] })), /DUPLICATE_FLARE_TEE_ID/);
});

test("plans urgent finalization, retry, request, and deadline close without trusting a winner", () => {
  const actions = planFlareLifecycle([
    parseFlareTender(1n, rawTender(1, { bidCount: 2n })),
    parseFlareTender(2n, rawTender(2)),
    parseFlareTender(3n, rawTender(3, { resultExpiry: 1_000n })),
    parseFlareTender(4n, rawTender(3, { resultExpiry: 3_000n })),
  ], 2_100n);
  assert.deepEqual(actions, [
    { kind: "finalize", tenderId: 4n },
    { kind: "retry", tenderId: 3n },
    { kind: "request", tenderId: 2n },
    { kind: "close", tenderId: 1n },
  ]);
});

test("does not close an open tender before deadline when quorum is incomplete", () => {
  const actions = planFlareLifecycle([parseFlareTender(1n, rawTender(1, { bidCount: 1n }))], 1_999n);
  assert.deepEqual(actions, []);
});
