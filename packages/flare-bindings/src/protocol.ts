import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export const coston2ChainId = 114n;
export const emptyBidRoot = keccak256("0x5645494c4249445f454d5054595f4249445f524f4f545f5631");
export const bidRootDomain = keccak256("0x5645494c4249445f4249445f524f4f545f5631");
export const selectionResultDomain = keccak256("0x5645494c4249445f53454c454354494f4e5f524553554c545f5631");

const bidRootTypes = [
  { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" },
  { type: "address" }, { type: "bytes32" }, { type: "uint8" }, { type: "uint64" },
] as const;

export interface FlareBidReference {
  bidId: bigint;
  vendor: Address;
  plaintextCommitment: Hex;
  receiptBitmap: number;
  acceptedBlock: bigint;
}

export function appendBidRoot(previous: Hex, tenderId: bigint, reference: FlareBidReference): Hex {
  return keccak256(encodeAbiParameters(bidRootTypes, [
    bidRootDomain, previous, tenderId, reference.bidId, reference.vendor,
    reference.plaintextCommitment, reference.receiptBitmap, reference.acceptedBlock,
  ]));
}

export function rebuildBidRoot(tenderId: bigint, references: readonly FlareBidReference[]): Hex {
  return references.reduce((root, reference, index) => {
    if (reference.bidId !== BigInt(index + 1)) throw new Error("NON_CANONICAL_BID_ID");
    if (reference.receiptBitmap < 3 || (reference.receiptBitmap & 7) !== reference.receiptBitmap) throw new Error("WEAK_RECEIPT_QUORUM");
    return appendBidRoot(root, tenderId, reference);
  }, emptyBidRoot);
}

const resultTypes = [
  { type: "bytes32" }, { type: "uint16" }, { type: "uint256" }, { type: "address" },
  { type: "uint256" }, { type: "bytes32" }, { type: "uint256" }, { type: "bytes32" },
  { type: "bytes32" }, { type: "uint8" }, { type: "bytes21" }, { type: "uint256" },
  { type: "int8" }, { type: "uint64" }, { type: "uint64" }, { type: "uint256" },
  { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" },
] as const;

export interface FlareSelectionResult {
  schemaVersion: number;
  chainId: bigint;
  market: Address;
  extensionId: bigint;
  codeVersion: Hex;
  tenderId: bigint;
  rulesHash: Hex;
  orderedBidRoot: Hex;
  quorumBitmap: number;
  ftsoFeedId: Hex;
  ftsoValue: bigint;
  ftsoDecimals: number;
  ftsoTimestamp: bigint;
  closeBlock: bigint;
  winnerBidId: bigint;
  winner: Address;
  winningAmountXrp: bigint;
  resultNonce: bigint;
  expiry: bigint;
}

export function selectionResultDigest(result: FlareSelectionResult): Hex {
  return keccak256(encodeAbiParameters(resultTypes, [
    selectionResultDomain, result.schemaVersion, result.chainId, result.market, result.extensionId,
    result.codeVersion, result.tenderId, result.rulesHash, result.orderedBidRoot, result.quorumBitmap,
    result.ftsoFeedId, result.ftsoValue, result.ftsoDecimals, result.ftsoTimestamp, result.closeBlock,
    result.winnerBidId, result.winner, result.winningAmountXrp, result.resultNonce, result.expiry,
  ]));
}
