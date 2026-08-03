import type { Address, Hex } from "viem";

export const tenderStatuses = [
  "FundingPending",
  "Open",
  "Closed",
  "Awarded",
  "Refunded",
  "Cancelled",
] as const;

export type TenderStatus = (typeof tenderStatuses)[number];

export interface PublicLifecycleEvent {
  name: string;
  blockNumber: bigint;
  transactionHash: Hex;
}

export interface PublicTender {
  tenderId: bigint;
  buyer: Address;
  reviewViewer: Address;
  paymentToken: Address;
  metadataHash: Hex;
  publicCeiling: bigint;
  bidDeadline: bigint;
  closeBlock: bigint | null;
  approvedVendorCount: number;
  bidCount: number;
  status: TenderStatus;
  winnerBidId: bigint | null;
  winner: Address | null;
  viewerGrantCount: number;
  createdBlock: bigint;
  updatedBlock: bigint;
  createdTransaction: Hex;
  updatedTransaction: Hex;
  /** Public lifecycle checkpoints only; no confidential values are included. */
  history?: readonly PublicLifecycleEvent[];
}

export interface PublicBid {
  tenderId: bigint;
  bidId: bigint;
  vendor: Address;
  submittedBlock: bigint;
  submittedTransaction: Hex;
}

export interface PublicIndexCheckpoint {
  blockNumber: bigint;
  eventCount: number;
}

export interface PublicMarketIndex {
  tenders: readonly PublicTender[];
  bids: readonly PublicBid[];
  checkpoint: PublicIndexCheckpoint | null;
}
