import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

function expectedArgmin(prices, ceiling) {
  let best = ceiling + 1n;
  let winnerBidId = 0n;
  prices.forEach((price, index) => {
    const candidate = price > 0n && price <= ceiling ? price : ceiling + 1n;
    if (candidate < best) {
      best = candidate;
      winnerBidId = BigInt(index + 1);
    }
  });
  return { best, winnerBidId };
}

function generator(seed) {
  let state = BigInt(seed);
  return () => {
    state = (1_103_515_245n * state + 12_345n) % 2_147_483_648n;
    return state;
  };
}

describe("Gate B deterministic model", () => {
  it("checks 2,000 bounded bid sets, invalid values, ties, and permutations", () => {
    const next = generator(0x5645494c);

    for (let caseIndex = 0; caseIndex < 2_000; caseIndex += 1) {
      const ceiling = (next() % 10_000n) + 1n;
      const bidCount = Number((next() % 7n) + 2n);
      const prices = Array.from({ length: bidCount }, (_, index) => {
        const mode = Number(next() % 6n);
        if (mode === 0) return 0n;
        if (mode === 1) return ceiling + 1n + (next() % 100n);
        if (mode === 2 && index > 0) return 1n;
        return (next() % ceiling) + 1n;
      });

      const result = expectedArgmin(prices, ceiling);
      const valid = prices.filter((price) => price > 0n && price <= ceiling);
      const expectedBest =
        valid.length === 0
          ? ceiling + 1n
          : valid.reduce((left, right) => (left < right ? left : right));

      assert.equal(result.best, expectedBest);
      if (result.winnerBidId === 0n) {
        assert.equal(valid.length, 0);
      } else {
        assert.equal(
          prices[Number(result.winnerBidId - 1n)],
          expectedBest,
        );
        assert.equal(
          result.winnerBidId,
          BigInt(prices.indexOf(expectedBest) + 1),
          "ties must retain the earlier bid",
        );
      }

      const reversed = expectedArgmin([...prices].reverse(), ceiling);
      assert.equal(
        reversed.best,
        result.best,
        "permutation must preserve the minimum value",
      );
    }
  });
});
