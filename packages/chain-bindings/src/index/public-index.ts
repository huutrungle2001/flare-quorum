import type {
  PublicBid,
  PublicLifecycleEvent,
  PublicMarketIndex,
  PublicTender,
  TenderStatus,
} from "../domain/tender.js";
import type { FlareQuorumPublicEvent } from "../events/types.js";

const terminalStatuses = new Set<TenderStatus>([
  "Awarded",
  "Refunded",
  "Cancelled",
]);

function positionKey(event: FlareQuorumPublicEvent): string {
  return `${event.transactionHash.toLowerCase()}:${event.logIndex}`;
}

function orderedEvents(
  events: readonly FlareQuorumPublicEvent[],
): FlareQuorumPublicEvent[] {
  return [...events].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber < right.blockNumber ? -1 : 1;
    }
    if (left.logIndex !== right.logIndex) {
      return left.logIndex - right.logIndex;
    }
    return left.transactionHash.localeCompare(right.transactionHash);
  });
}

function requireTender(
  tenders: Map<bigint, PublicTender>,
  tenderId: bigint,
): PublicTender {
  const tender = tenders.get(tenderId);
  if (!tender) {
    throw new Error(`Tender ${tenderId} event precedes TenderCreated`);
  }
  return tender;
}

function updateTender(
  tenders: Map<bigint, PublicTender>,
  tender: PublicTender,
  event: FlareQuorumPublicEvent,
  changes: Partial<PublicTender>,
): void {
  if (terminalStatuses.has(tender.status)) {
    throw new Error(`Tender ${tender.tenderId} changed after terminal state`);
  }
  tenders.set(tender.tenderId, {
    ...tender,
    ...changes,
    updatedBlock: event.blockNumber,
    updatedTransaction: event.transactionHash,
    history: [...(tender.history ?? []), publicLifecycleEvent(event)],
  });
}

function publicLifecycleEvent(event: FlareQuorumPublicEvent): PublicLifecycleEvent {
  return {
    name: event.name,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
  };
}

function recordViewerGrant(
  tenders: Map<bigint, PublicTender>,
  tender: PublicTender,
  event: FlareQuorumPublicEvent,
): void {
  tenders.set(tender.tenderId, {
    ...tender,
    viewerGrantCount: tender.viewerGrantCount + 1,
    updatedBlock: event.blockNumber,
    updatedTransaction: event.transactionHash,
    history: [...(tender.history ?? []), publicLifecycleEvent(event)],
  });
}

/**
 * Rebuilds public state from a caller-supplied finalized log window.
 * RPC pagination, finality depth, and reorg rollback remain caller concerns.
 */
export function buildPublicMarketIndex(
  events: readonly FlareQuorumPublicEvent[],
): PublicMarketIndex {
  const tenders = new Map<bigint, PublicTender>();
  const bids = new Map<string, PublicBid>();
  const seen = new Set<string>();
  let lastEvent: FlareQuorumPublicEvent | null = null;

  for (const event of orderedEvents(events)) {
    const key = positionKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    lastEvent = event;

    if (event.name === "TenderCreated") {
      if (tenders.has(event.tenderId)) {
        throw new Error(`Tender ${event.tenderId} was created twice`);
      }
      tenders.set(event.tenderId, {
        tenderId: event.tenderId,
        buyer: event.buyer,
        reviewViewer: event.reviewViewer,
        paymentToken: event.paymentToken,
        metadataHash: event.metadataHash,
        publicCeiling: event.publicCeiling,
        bidDeadline: event.bidDeadline,
        closeBlock: null,
        approvedVendorCount: event.approvedVendorCount,
        bidCount: 0,
        status: "FundingPending",
        winnerBidId: null,
        winner: null,
        viewerGrantCount: 0,
        createdBlock: event.blockNumber,
        updatedBlock: event.blockNumber,
        createdTransaction: event.transactionHash,
        updatedTransaction: event.transactionHash,
        history: [publicLifecycleEvent(event)],
      });
      continue;
    }

    const tender = requireTender(tenders, event.tenderId);
    switch (event.name) {
      case "TenderFunded":
        updateTender(tenders, tender, event, { status: "Open" });
        break;
      case "BidSubmitted": {
        if (tender.status !== "Open") {
          throw new Error(`Tender ${event.tenderId} bid outside Open`);
        }
        const bidKey = `${event.tenderId}:${event.bidId}`;
        if (bids.has(bidKey)) {
          throw new Error(`Bid ${bidKey} was submitted twice`);
        }
        bids.set(bidKey, {
          tenderId: event.tenderId,
          bidId: event.bidId,
          vendor: event.vendor,
          submittedBlock: event.blockNumber,
          submittedTransaction: event.transactionHash,
        });
        updateTender(tenders, tender, event, {
          bidCount: tender.bidCount + 1,
        });
        break;
      }
      case "TenderClosed":
        if (tender.status !== "Open") {
          throw new Error(`Tender ${event.tenderId} closed outside Open`);
        }
        updateTender(tenders, tender, event, {
          status: "Closed",
          closeBlock: event.closeBlock,
        });
        break;
      case "TenderAwarded":
        if (tender.status !== "Closed") {
          throw new Error(`Tender ${event.tenderId} awarded outside Closed`);
        }
        if (!bids.has(`${event.tenderId}:${event.winnerBidId}`)) {
          throw new Error(`Tender ${event.tenderId} winner bid is unknown`);
        }
        updateTender(tenders, tender, event, {
          status: "Awarded",
          winnerBidId: event.winnerBidId,
          winner: event.winner,
        });
        break;
      case "TenderRefunded":
        if (tender.status !== "Closed") {
          throw new Error(`Tender ${event.tenderId} refunded outside Closed`);
        }
        updateTender(tenders, tender, event, { status: "Refunded" });
        break;
      case "TenderCancelled":
        if (
          tender.status !== "FundingPending" &&
          tender.status !== "Open"
        ) {
          throw new Error(`Tender ${event.tenderId} cancelled too late`);
        }
        updateTender(tenders, tender, event, { status: "Cancelled" });
        break;
      case "ViewerGranted":
        if (!bids.has(`${event.tenderId}:${event.bidId}`)) {
          throw new Error(`Viewer grant references an unknown bid`);
        }
        recordViewerGrant(tenders, tender, event);
        break;
    }
  }

  return {
    tenders: [...tenders.values()].sort((left, right) =>
      left.tenderId < right.tenderId ? -1 : 1,
    ),
    bids: [...bids.values()].sort((left, right) => {
      if (left.tenderId !== right.tenderId) {
        return left.tenderId < right.tenderId ? -1 : 1;
      }
      return left.bidId < right.bidId ? -1 : 1;
    }),
    checkpoint:
      lastEvent === null
        ? null
        : {
            blockNumber: lastEvent.blockNumber,
            eventCount: seen.size,
          },
  };
}
