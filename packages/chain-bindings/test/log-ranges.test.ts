import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPublicLogBlockRanges,
  publicLogBlockChunkSize,
} from "../src/index/log-ranges.ts";

describe("public log block ranges", () => {
  it("uses inclusive windows accepted by the canonical Sepolia RPC", () => {
    const ranges = buildPublicLogBlockRanges(11_349_568n, 11_352_219n);

    assert.equal(publicLogBlockChunkSize, 1_000n);
    assert.deepEqual(ranges, [
      { fromBlock: 11_349_568n, toBlock: 11_350_567n },
      { fromBlock: 11_350_568n, toBlock: 11_351_567n },
      { fromBlock: 11_351_568n, toBlock: 11_352_219n },
    ]);
    assert.equal(
      ranges.every(
        ({ fromBlock, toBlock }) =>
          toBlock - fromBlock + 1n <= publicLogBlockChunkSize,
      ),
      true,
    );
  });

  it("returns no ranges for an empty window", () => {
    assert.deepEqual(buildPublicLogBlockRanges(10n, 9n), []);
  });
});
