import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicTender, TenderStatus } from "../src/domain/tender.ts";
import { getTenderReadiness } from "../src/readiness/tender.ts";

const buyer = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";

function tender(
  status: TenderStatus,
  overrides: Partial<PublicTender> = {},
): PublicTender {
  return {
    tenderId: 1n,
    buyer,
    reviewViewer: buyer,
    paymentToken: other,
    metadataHash: `0x${"33".repeat(32)}`,
    publicCeiling: 100n,
    bidDeadline: 50n,
    closeBlock: null,
    approvedVendorCount: 2,
    bidCount: 0,
    status,
    winnerBidId: null,
    winner: null,
    viewerGrantCount: 0,
    createdBlock: 1n,
    updatedBlock: 1n,
    createdTransaction: `0x${"44".repeat(32)}`,
    updatedTransaction: `0x${"44".repeat(32)}`,
    ...overrides,
  };
}

describe("getTenderReadiness", () => {
  it("separates funding proof, time readiness, and winner proof stages", () => {
    assert.equal(
      getTenderReadiness(tender("FundingPending"), 10n).needsFundingProof,
      true,
    );
    assert.equal(getTenderReadiness(tender("Open"), 49n).canClose, false);
    assert.equal(getTenderReadiness(tender("Open"), 50n).canClose, true);
    assert.equal(
      getTenderReadiness(
        tender("Open", { bidCount: 2 }),
        10n,
      ).canClose,
      true,
    );
    assert.equal(
      getTenderReadiness(tender("Closed"), 100n).needsWinnerProof,
      true,
    );
  });

  it("allows pre-bid cancellation only for the buyer", () => {
    assert.equal(
      getTenderReadiness(tender("Open"), 10n, buyer).canBuyerCancel,
      true,
    );
    assert.equal(
      getTenderReadiness(tender("Open"), 10n, other).canBuyerCancel,
      false,
    );
    assert.equal(
      getTenderReadiness(
        tender("Open", { bidCount: 1 }),
        10n,
        buyer,
      ).canBuyerCancel,
      false,
    );
  });

  it("marks only documented terminal statuses terminal", () => {
    for (const status of ["Awarded", "Refunded", "Cancelled"] as const) {
      assert.equal(getTenderReadiness(tender(status), 100n).terminal, true);
    }
    for (const status of ["FundingPending", "Open", "Closed"] as const) {
      assert.equal(getTenderReadiness(tender(status), 100n).terminal, false);
    }
  });
});
