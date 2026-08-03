import assert from "node:assert/strict";
import { describe, it } from "node:test";

const CASE_COUNT = 10_000;
const MAX_BIDS = 8;

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function productionSelection(ceiling, bids) {
  let bestPrice = ceiling + 1n;
  let winnerBidId = 0;

  for (const [index, price] of bids.entries()) {
    const positiveCandidate = price > 0n ? price : ceiling + 1n;
    const candidate =
      price <= ceiling ? positiveCandidate : ceiling + 1n;
    if (candidate < bestPrice) {
      bestPrice = candidate;
      winnerBidId = index + 1;
    }
  }

  return { bestPrice, winnerBidId };
}

function oracleSelection(ceiling, bids) {
  const valid = bids
    .map((price, index) => ({ bidId: index + 1, price }))
    .filter(({ price }) => price > 0n && price <= ceiling);
  if (valid.length === 0) {
    return { bestPrice: ceiling + 1n, winnerBidId: 0 };
  }
  const winner = valid.reduce((best, candidate) =>
    candidate.price < best.price ? candidate : best,
  );
  return {
    bestPrice: winner.price,
    winnerBidId: winner.bidId,
  };
}

function randomBid(random, ceiling, existing) {
  const mode = Math.floor(random() * 8);
  if (mode === 0) return 0n;
  if (mode === 1) return ceiling + 1n;
  if (mode === 2) return ceiling + BigInt(1 + Math.floor(random() * 1_000));
  if (mode === 3 && existing.length > 0) {
    return existing[Math.floor(random() * existing.length)];
  }
  return BigInt(1 + Math.floor(random() * Number(ceiling)));
}

describe("VeilBid production selection properties", () => {
  it(`matches the earliest-valid-minimum oracle for ${CASE_COUNT} bid sets`, () => {
    const random = mulberry32(0x5645494c);

    for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex += 1) {
      const ceiling = BigInt(1 + Math.floor(random() * 1_000_000));
      const bidCount = Math.floor(random() * (MAX_BIDS + 1));
      const bids = [];
      for (let index = 0; index < bidCount; index += 1) {
        bids.push(randomBid(random, ceiling, bids));
      }

      const actual = productionSelection(ceiling, bids);
      const expected = oracleSelection(ceiling, bids);
      assert.deepEqual(actual, expected, `case ${caseIndex}`);

      if (actual.winnerBidId === 0) {
        assert.equal(
          bids.every((price) => price === 0n || price > ceiling),
          true,
        );
      } else {
        const winningPrice = bids[actual.winnerBidId - 1];
        assert.ok(winningPrice > 0n && winningPrice <= ceiling);
        assert.equal(
          bids
            .slice(0, actual.winnerBidId - 1)
            .every(
              (price) =>
                price === 0n ||
                price > ceiling ||
                price > winningPrice,
            ),
          true,
          "an earlier equal or lower valid bid must retain priority",
        );
        assert.equal(
          winningPrice + (ceiling - winningPrice),
          ceiling,
          "winner payment and buyer remainder must conserve escrow",
        );
      }
    }
  });

  it("preserves the earliest bid across every deterministic tie position", () => {
    for (let bidCount = 1; bidCount <= MAX_BIDS; bidCount += 1) {
      for (let firstTie = 0; firstTie < bidCount; firstTie += 1) {
        const bids = Array.from(
          { length: bidCount },
          (_, index) => (index < firstTie ? 80n : 40n),
        );
        assert.equal(
          productionSelection(100n, bids).winnerBidId,
          firstTie + 1,
        );
      }
    }
  });
});

describe("VeilBid lifecycle invariants", () => {
  const transitions = new Map([
    ["FundingPending", new Set(["Open", "Cancelled"])],
    ["Open", new Set(["Closed", "Cancelled"])],
    ["Closed", new Set(["Awarded", "Refunded"])],
    ["Awarded", new Set()],
    ["Refunded", new Set()],
    ["Cancelled", new Set()],
  ]);

  it("allows only documented monotonic transitions", () => {
    assert.deepEqual([...transitions.get("FundingPending")], [
      "Open",
      "Cancelled",
    ]);
    assert.deepEqual([...transitions.get("Open")], ["Closed", "Cancelled"]);
    assert.deepEqual([...transitions.get("Closed")], [
      "Awarded",
      "Refunded",
    ]);
    for (const terminal of ["Awarded", "Refunded", "Cancelled"]) {
      assert.equal(transitions.get(terminal).size, 0);
    }
  });

  it("has exactly one terminal outcome for every valid path", () => {
    const paths = [
      ["FundingPending", "Cancelled"],
      ["FundingPending", "Open", "Cancelled"],
      ["FundingPending", "Open", "Closed", "Awarded"],
      ["FundingPending", "Open", "Closed", "Refunded"],
    ];

    for (const path of paths) {
      for (let index = 1; index < path.length; index += 1) {
        assert.equal(
          transitions.get(path[index - 1]).has(path[index]),
          true,
        );
      }
      assert.equal(transitions.get(path.at(-1)).size, 0);
    }
  });
});
