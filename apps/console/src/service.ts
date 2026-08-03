import {
  getTenderReadiness,
  tenderStatuses,
  type PublicTender,
  type TenderStatus,
} from "@veilbid/chain-bindings";
import { getAddress, isAddress, type Address } from "viem";
import type {
  PublicOperatorSource,
  PublicTenderOutput,
  TenderContext,
} from "./types.js";

export class OperatorQueryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "OperatorQueryError";
    this.code = code;
  }
}

function publicTender(tender: PublicTender): PublicTenderOutput {
  return {
    tenderId: tender.tenderId.toString(),
    buyer: tender.buyer,
    reviewViewer: tender.reviewViewer,
    paymentToken: tender.paymentToken,
    metadataHash: tender.metadataHash,
    publicCeiling: tender.publicCeiling.toString(),
    bidDeadline: tender.bidDeadline.toString(),
    closeBlock: tender.closeBlock?.toString() ?? null,
    approvedVendorCount: tender.approvedVendorCount,
    bidCount: tender.bidCount,
    status: tender.status,
    winnerBidId: tender.winnerBidId?.toString() ?? null,
    winner: tender.winner,
    viewerGrantCount: tender.viewerGrantCount,
    createdBlock: tender.createdBlock.toString(),
    updatedBlock: tender.updatedBlock.toString(),
    createdTransaction: tender.createdTransaction,
    updatedTransaction: tender.updatedTransaction,
  };
}

function positiveId(value: string, field: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new OperatorQueryError(`invalid-${field}`);
  }
  return BigInt(value);
}

export class PublicOperatorService {
  readonly #source: PublicOperatorSource;

  constructor(source: PublicOperatorSource) {
    this.#source = source;
  }

  async listTenders({
    status,
    limit = 20,
  }: {
    status?: TenderStatus;
    limit?: number;
  } = {}) {
    if (status !== undefined && !tenderStatuses.includes(status)) {
      throw new OperatorQueryError("invalid-status");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new OperatorQueryError("invalid-limit");
    }
    const snapshot = await this.#source.snapshot();
    const matching = snapshot.index.tenders.filter(
      (tender) => status === undefined || tender.status === status,
    );
    return {
      chainTimestamp: snapshot.chainTimestamp.toString(),
      finalizedBlock: snapshot.finalizedBlock.toString(),
      deploymentKind: snapshot.deploymentKind,
      deploymentVerified: snapshot.deploymentVerified,
      total: matching.length,
      tenders: matching.slice(0, limit).map(publicTender),
    };
  }

  async #context(tenderIdInput: string): Promise<TenderContext> {
    const tenderId = positiveId(tenderIdInput, "tender-id");
    const snapshot = await this.#source.snapshot();
    const tender = snapshot.index.tenders.find(
      (candidate) => candidate.tenderId === tenderId,
    );
    if (!tender) throw new OperatorQueryError("tender-not-found");
    return { snapshot, tender };
  }

  async getTender(tenderIdInput: string) {
    const { snapshot, tender } = await this.#context(tenderIdInput);
    return {
      tender: publicTender(tender),
      bids: snapshot.index.bids
        .filter((bid) => bid.tenderId === tender.tenderId)
        .map((bid) => ({
          tenderId: bid.tenderId.toString(),
          bidId: bid.bidId.toString(),
          vendor: bid.vendor,
          submittedBlock: bid.submittedBlock.toString(),
          submittedTransaction: bid.submittedTransaction,
        })),
    };
  }

  async explainReadiness(tenderIdInput: string) {
    const { snapshot, tender } = await this.#context(tenderIdInput);
    return {
      tenderId: tender.tenderId.toString(),
      status: tender.status,
      chainTimestamp: snapshot.chainTimestamp.toString(),
      ...getTenderReadiness(tender, snapshot.chainTimestamp),
    };
  }

  async inspectSettlement(tenderIdInput: string) {
    const { tender } = await this.#context(tenderIdInput);
    const [flags, award] = await Promise.all([
      this.#source.settlementFlags(tender.tenderId),
      this.#source.awardEvidence(tender.tenderId),
    ]);
    return {
      tenderId: tender.tenderId.toString(),
      status: tender.status,
      closeBlock: tender.closeBlock?.toString() ?? null,
      winnerBidId: tender.winnerBidId?.toString() ?? null,
      winner: tender.winner,
      updatedTransaction: tender.updatedTransaction,
      ...flags,
      award:
        award === null
          ? null
          : {
              tenderId: award.tenderId.toString(),
              buyer: award.buyer,
              winner: award.winner,
              paymentToken: award.paymentToken,
              finalizedAt: award.finalizedAt.toString(),
              finalizedBlock: award.finalizedBlock.toString(),
            },
    };
  }

  async inspectBidViewer({
    tenderId: tenderIdInput,
    bidId: bidIdInput,
    account: accountInput,
  }: {
    tenderId: string;
    bidId: string;
    account: string;
  }) {
    const tenderId = positiveId(tenderIdInput, "tender-id");
    const bidId = positiveId(bidIdInput, "bid-id");
    if (!isAddress(accountInput)) {
      throw new OperatorQueryError("invalid-account");
    }
    const account = getAddress(accountInput);
    const viewable = await this.#source.bidViewableBy(
      tenderId,
      bidId,
      account,
    );
    return {
      tenderId: tenderId.toString(),
      bidId: bidId.toString(),
      account,
      viewable,
      scope: "single-stored-bid",
    };
  }
}
