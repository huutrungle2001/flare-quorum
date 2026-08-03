import type {
  Coston2ProtocolBinding,
  Coston2PublicMarket,
  Coston2PublicTender,
  Coston2TenderStatus,
} from "@veilbid/flare-bindings";

export interface FlarePublicOperatorSource {
  snapshot(): Promise<Coston2PublicMarket>;
  protocolBinding(): Promise<Coston2ProtocolBinding>;
}

export interface FlareTenderContext {
  snapshot: Coston2PublicMarket;
  tender: Coston2PublicTender;
}

export interface FlarePublicTenderOutput {
  tenderId: string;
  buyer: string;
  metadataHash: string;
  rulesHash: string;
  publicCeilingXrp: string;
  bidDeadline: string;
  closeBlock: string;
  bidCount: string;
  approvedVendorCount: number;
  commonQuorumBitmap: number;
  orderedBidRoot: string;
  extensionId: string;
  codeVersion: string;
  ftsoFeedId: string;
  ftsoValue: string;
  ftsoDecimals: number;
  ftsoTimestamp: string;
  selectionStartedAt: string;
  selectionAttempt: number;
  resultNonce: string;
  resultExpiry: string;
  requestId: string;
  status: Coston2TenderStatus;
  teeIds: readonly string[];
  teeKeyFingerprints: readonly string[];
  winnerBidId: string | null;
  winner: string | null;
  winningAmountXrp: string | null;
  awardTransactionHash: string | null;
}
