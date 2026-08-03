/**
 * Conservative public-log window supported by the canonical Sepolia RPC.
 * Keep every consumer on this shared boundary so browser, relay, and MCP
 * rebuild the same finalized state without provider-specific range failures.
 */
export const publicLogBlockChunkSize = 1_000n;

export interface PublicLogBlockRange {
  fromBlock: bigint;
  toBlock: bigint;
}

export function buildPublicLogBlockRanges(
  fromBlock: bigint,
  toBlock: bigint,
): PublicLogBlockRange[] {
  const ranges: PublicLogBlockRange[] = [];
  for (
    let chunkStart = fromBlock;
    chunkStart <= toBlock;
    chunkStart += publicLogBlockChunkSize
  ) {
    ranges.push({
      fromBlock: chunkStart,
      toBlock:
        chunkStart + publicLogBlockChunkSize - 1n < toBlock
          ? chunkStart + publicLogBlockChunkSize - 1n
          : toBlock,
    });
  }
  return ranges;
}
