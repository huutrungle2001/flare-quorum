import type {
  PublicMarketIndex,
  PublicTender,
  TenderStatus,
} from "@flarequorum/chain-bindings";
import type { Address, Hex } from "viem";

export interface OperatorSnapshot {
  index: PublicMarketIndex;
  chainTimestamp: bigint;
  latestBlock: bigint;
  finalizedBlock: bigint;
  deploymentKind: string;
  deploymentVerified: boolean;
}

export interface SettlementFlags {
  winnerIdPubliclyDecryptable: boolean;
  canFinalize: boolean;
  refundRequiresZeroWinnerProof: boolean;
}

export interface AwardEvidence {
  tenderId: bigint;
  buyer: Address;
  winner: Address;
  paymentToken: Address;
  finalizedAt: bigint;
  finalizedBlock: bigint;
}

export interface PublicOperatorSource {
  snapshot(): Promise<OperatorSnapshot>;
  settlementFlags(tenderId: bigint): Promise<SettlementFlags>;
  awardEvidence(tenderId: bigint): Promise<AwardEvidence | null>;
  bidViewableBy(
    tenderId: bigint,
    bidId: bigint,
    account: Address,
  ): Promise<boolean>;
}

export interface PublicTenderOutput {
  tenderId: string;
  buyer: Address;
  reviewViewer: Address;
  paymentToken: Address;
  metadataHash: Hex;
  publicCeiling: string;
  bidDeadline: string;
  closeBlock: string | null;
  approvedVendorCount: number;
  bidCount: number;
  status: TenderStatus;
  winnerBidId: string | null;
  winner: Address | null;
  viewerGrantCount: number;
  createdBlock: string;
  updatedBlock: string;
  createdTransaction: Hex;
  updatedTransaction: Hex;
}

export interface TenderContext {
  snapshot: OperatorSnapshot;
  tender: PublicTender;
}
