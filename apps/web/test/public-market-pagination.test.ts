import { describe, expect, it } from "vitest";
import {
  buildPublicLogBlockRanges,
  publicLogBlockChunkSize,
} from "../src/public-market/loadPublicMarket";

describe("public market RPC pagination", () => {
  it("keeps every inclusive eth_getLogs range within the provider limit", () => {
    const ranges = buildPublicLogBlockRanges(11_349_568n, 11_352_219n);

    expect(publicLogBlockChunkSize).toBe(1_000n);
    expect(ranges).toEqual([
      { fromBlock: 11_349_568n, toBlock: 11_350_567n },
      { fromBlock: 11_350_568n, toBlock: 11_351_567n },
      { fromBlock: 11_351_568n, toBlock: 11_352_219n },
    ]);
    expect(
      ranges.every(
        ({ fromBlock, toBlock }) =>
          toBlock - fromBlock + 1n <= publicLogBlockChunkSize,
      ),
    ).toBe(true);
  });

  it("returns no ranges when the finalized block precedes deployment", () => {
    expect(buildPublicLogBlockRanges(10n, 9n)).toEqual([]);
  });
});
