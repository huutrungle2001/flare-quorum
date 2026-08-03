import type { Address, Hex } from "viem";

interface EventPosition {
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

export type VeilBidPublicEvent =
  | (EventPosition & {
      name: "TenderCreated";
      tenderId: bigint;
      buyer: Address;
      metadataHash: Hex;
      paymentToken: Address;
      reviewViewer: Address;
      publicCeiling: bigint;
      bidDeadline: bigint;
      approvedVendorCount: number;
    })
  | (EventPosition & {
      name: "TenderFunded";
      tenderId: bigint;
    })
  | (EventPosition & {
      name: "BidSubmitted";
      tenderId: bigint;
      bidId: bigint;
      vendor: Address;
    })
  | (EventPosition & {
      name: "TenderClosed";
      tenderId: bigint;
      closeBlock: bigint;
    })
  | (EventPosition & {
      name: "TenderAwarded";
      tenderId: bigint;
      winnerBidId: bigint;
      winner: Address;
    })
  | (EventPosition & {
      name: "TenderRefunded";
      tenderId: bigint;
      buyer: Address;
    })
  | (EventPosition & {
      name: "TenderCancelled";
      tenderId: bigint;
      buyer: Address;
    })
  | (EventPosition & {
      name: "ViewerGranted";
      tenderId: bigint;
      bidId: bigint;
      viewer: Address;
      grantor: Address;
    });
