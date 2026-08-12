import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoston2LogBlockRanges,
  coston2LogBlockChunkSize,
} from "../flare/rpc-log-ranges.mjs";

test("keeps Coston2 evidence log queries within the public RPC limit", () => {
  const ranges = buildCoston2LogBlockRanges(100n, 166n);
  assert.equal(coston2LogBlockChunkSize, 30n);
  assert.deepEqual(ranges, [
    { fromBlock: 100n, toBlock: 129n },
    { fromBlock: 130n, toBlock: 159n },
    { fromBlock: 160n, toBlock: 166n },
  ]);
  assert.equal(
    ranges.every(({ fromBlock, toBlock }) => toBlock - fromBlock + 1n <= 30n),
    true,
  );
});

test("returns no Coston2 log ranges for an empty interval", () => {
  assert.deepEqual(buildCoston2LogBlockRanges(2n, 1n), []);
});
