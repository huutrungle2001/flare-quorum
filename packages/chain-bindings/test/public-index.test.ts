import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hex } from "viem";
import type { FlareQuorumPublicEvent } from "../src/events/types.ts";
import { buildPublicMarketIndex } from "../src/index/public-index.ts";

const buyer = "0x1111111111111111111111111111111111111111";
const vendor = "0x2222222222222222222222222222222222222222";
const token = "0x3333333333333333333333333333333333333333";
const metadataHash = `0x${"44".repeat(32)}` as Hex;

function position(blockNumber: bigint, logIndex = 0) {
  return {
    blockNumber,
    logIndex,
    transactionHash: `0x${blockNumber
      .toString(16)
      .padStart(64, "0")}` as Hex,
  };
}

function lifecycle(): FlareQuorumPublicEvent[] {
  return [
    {
      ...position(10n),
      name: "TenderCreated",
      tenderId: 1n,
      buyer,
      reviewViewer: buyer,
      metadataHash,
      paymentToken: token,
      publicCeiling: 100n,
      bidDeadline: 50n,
      approvedVendorCount: 1,
    },
    { ...position(11n), name: "TenderFunded", tenderId: 1n },
    {
      ...position(12n),
      name: "BidSubmitted",
      tenderId: 1n,
      bidId: 1n,
      vendor,
    },
    {
      ...position(13n),
      name: "ViewerGranted",
      tenderId: 1n,
      bidId: 1n,
      viewer: buyer,
      grantor: vendor,
    },
    {
      ...position(14n),
      name: "TenderClosed",
      tenderId: 1n,
      closeBlock: 14n,
    },
    {
      ...position(15n),
      name: "TenderAwarded",
      tenderId: 1n,
      winnerBidId: 1n,
      winner: vendor,
    },
  ];
}

describe("buildPublicMarketIndex", () => {
  it("rebuilds the same terminal state from shuffled duplicate logs", () => {
    const events = lifecycle();
    const shuffled = [
      events[5],
      events[2],
      events[0],
      events[3],
      events[1],
      events[4],
      events[2],
      {
        ...position(16n),
        name: "ViewerGranted",
        tenderId: 1n,
        bidId: 1n,
        viewer: token,
        grantor: buyer,
      },
    ] as FlareQuorumPublicEvent[];

    const index = buildPublicMarketIndex(shuffled);
    assert.equal(index.tenders.length, 1);
    assert.equal(index.bids.length, 1);
    assert.deepEqual(
      {
        status: index.tenders[0].status,
        bidCount: index.tenders[0].bidCount,
        approvedVendorCount: index.tenders[0].approvedVendorCount,
        winnerBidId: index.tenders[0].winnerBidId,
        winner: index.tenders[0].winner,
        viewerGrantCount: index.tenders[0].viewerGrantCount,
        closeBlock: index.tenders[0].closeBlock,
      },
      {
        status: "Awarded",
        bidCount: 1,
        approvedVendorCount: 1,
        winnerBidId: 1n,
        winner: vendor,
        viewerGrantCount: 2,
        closeBlock: 14n,
      },
    );
    assert.deepEqual(index.checkpoint, {
      blockNumber: 16n,
      eventCount: 7,
    });
    assert.deepEqual(
      index.tenders[0].history?.map((event) => event.name),
      [
        "TenderCreated",
        "TenderFunded",
        "BidSubmitted",
        "ViewerGranted",
        "TenderClosed",
        "TenderAwarded",
        "ViewerGranted",
      ],
    );
  });

  it("rejects events before creation and changes after terminal state", () => {
    assert.throws(() =>
      buildPublicMarketIndex([
        { ...position(1n), name: "TenderFunded", tenderId: 99n },
      ]),
    );
    assert.throws(() =>
      buildPublicMarketIndex([
        ...lifecycle(),
        {
          ...position(16n),
          name: "TenderFunded",
          tenderId: 1n,
        },
      ]),
    );
  });

  it("rejects an award that references an unknown bid", () => {
    const events = lifecycle().filter(
      (event) => event.name !== "BidSubmitted",
    );
    assert.throws(() => buildPublicMarketIndex(events));
  });
});
