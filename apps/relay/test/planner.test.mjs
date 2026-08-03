import assert from "node:assert/strict";
import test from "node:test";
import { planRelayActions } from "../dist/planner.js";

const address = "0x1111111111111111111111111111111111111111";
const hash = `0x${"22".repeat(32)}`;

function tender(tenderId, status, bidDeadline = 100n) {
  return {
    tenderId,
    buyer: address,
    reviewViewer: address,
    paymentToken: address,
    metadataHash: hash,
    publicCeiling: 1n,
    bidDeadline,
    closeBlock: status === "Closed" ? 10n : null,
    approvedVendorCount: 2,
    bidCount: 0,
    status,
    winnerBidId: null,
    winner: null,
    viewerGrantCount: 0,
    createdBlock: 1n,
    updatedBlock: 1n,
    createdTransaction: hash,
    updatedTransaction: hash,
  };
}

test("planner selects public funding, close, and finalize readiness", () => {
  const actions = planRelayActions(
    {
      tenders: [
        tender(4n, "Awarded"),
        tender(3n, "Open", 200n),
        tender(2n, "Open", 100n),
        tender(1n, "Closed"),
        tender(5n, "FundingPending"),
      ],
      bids: [],
      checkpoint: null,
    },
    150n,
  );
  assert.deepEqual(actions, [
    { kind: "confirm-funding", tenderId: 5n },
    { kind: "finalize", tenderId: 1n },
    { kind: "close", tenderId: 2n },
  ]);
});

test("planner is deterministic and prioritizes proof-ready tenders", () => {
  const actions = planRelayActions(
    {
      tenders: [
        tender(8n, "Open"),
        tender(7n, "Closed"),
        tender(2n, "Closed"),
        tender(1n, "Open"),
      ],
      bids: [],
      checkpoint: null,
    },
    100n,
  );
  assert.deepEqual(
    actions.map(({ kind, tenderId }) => `${kind}:${tenderId}`),
    ["finalize:2", "finalize:7", "close:1", "close:8"],
  );
});

test("planner closes early when every approved vendor has submitted", () => {
  const complete = tender(9n, "Open", 500n);
  complete.bidCount = complete.approvedVendorCount;
  assert.deepEqual(
    planRelayActions(
      { tenders: [complete], bids: [], checkpoint: null },
      100n,
    ),
    [{ kind: "close", tenderId: 9n }],
  );
});
