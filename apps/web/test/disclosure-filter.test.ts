import { describe, expect, it } from "vitest";
import { eligibleDisclosureBids } from "../src/disclosure/DisclosurePanel";

const buyer = "0x1111111111111111111111111111111111111111" as const;
const vendor = "0x2222222222222222222222222222222222222222" as const;
const hash = `0x${"33".repeat(32)}` as const;

function tender(tenderId: bigint, status: "Open" | "Closed") {
  return {
    tenderId,
    buyer,
    reviewViewer: buyer,
    paymentToken: buyer,
    metadataHash: hash,
    publicCeiling: 1n,
    bidDeadline: 1n,
    closeBlock: status === "Closed" ? 2n : null,
    approvedVendorCount: 2,
    bidCount: 1,
    status,
    winnerBidId: null,
    winner: null,
    viewerGrantCount: 0,
    createdBlock: 1n,
    updatedBlock: 1n,
    createdTransaction: hash,
    updatedTransaction: hash,
  } as const;
}

const bids = [
  {
    tenderId: 1n,
    bidId: 1n,
    vendor,
    submittedBlock: 1n,
    submittedTransaction: hash,
  },
  {
    tenderId: 2n,
    bidId: 1n,
    vendor,
    submittedBlock: 1n,
    submittedTransaction: hash,
  },
];

describe("selective disclosure bid filters", () => {
  it("lets a vendor act only on its own bids", () => {
    expect(
      eligibleDisclosureBids("VENDOR", vendor, [tender(1n, "Open")], bids),
    ).toHaveLength(2);
  });

  it("withholds buyer grants until the tender leaves Open", () => {
    const result = eligibleDisclosureBids(
      "BUYER",
      buyer,
      [tender(1n, "Open"), tender(2n, "Closed")],
      bids,
    );
    expect(result.map((bid) => bid.tenderId)).toEqual([2n]);
  });
});
