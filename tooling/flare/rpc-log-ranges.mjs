// The public Coston2 RPC currently rejects eth_getLogs requests spanning more
// than 30 blocks. Keep live evidence readers on this conservative boundary.
export const coston2LogBlockChunkSize = 30n;

export function buildCoston2LogBlockRanges(fromBlock, toBlock) {
  const ranges = [];
  for (
    let start = fromBlock;
    start <= toBlock;
    start += coston2LogBlockChunkSize
  ) {
    const candidateEnd = start + coston2LogBlockChunkSize - 1n;
    ranges.push({
      fromBlock: start,
      toBlock: candidateEnd < toBlock ? candidateEnd : toBlock,
    });
  }
  return ranges;
}
