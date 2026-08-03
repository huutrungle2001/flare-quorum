import type {
  Coston2PublicTender,
  Coston2TenderStatus,
} from "@veilbid/flare-bindings";
import type {
  FlarePublicOperatorSource,
  FlarePublicTenderOutput,
  FlareTenderContext,
} from "./flare-types.js";

export const flareTenderStatuses = [
  "FundingPending",
  "Open",
  "Closed",
  "ComputePending",
  "Awarded",
  "Refunded",
  "Cancelled",
] as const satisfies readonly Coston2TenderStatus[];

export class FlareOperatorQueryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "FlareOperatorQueryError";
    this.code = code;
  }
}

function positiveId(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new FlareOperatorQueryError("invalid-tender-id");
  }
  return BigInt(value);
}

function publicTender(tender: Coston2PublicTender): FlarePublicTenderOutput {
  return {
    tenderId: tender.tenderId.toString(),
    buyer: tender.buyer,
    metadataHash: tender.metadataHash,
    rulesHash: tender.rulesHash,
    scoringPolicy: {
      ...tender.scoringPolicy,
      ceilingXrpMicros: tender.scoringPolicy.ceilingXrpMicros.toString(),
      bidDeadline: tender.scoringPolicy.bidDeadline.toString(),
    },
    publicCeilingXrp: tender.publicCeilingXrp.toString(),
    bidDeadline: tender.bidDeadline.toString(),
    closeBlock: tender.closeBlock.toString(),
    bidCount: tender.bidCount.toString(),
    approvedVendorCount: tender.approvedVendorCount,
    commonQuorumBitmap: tender.commonQuorumBitmap,
    orderedBidRoot: tender.orderedBidRoot,
    extensionId: tender.extensionId.toString(),
    codeVersion: tender.codeVersion,
    ftsoFeedId: tender.ftsoFeedId,
    ftsoValue: tender.ftsoValue.toString(),
    ftsoDecimals: tender.ftsoDecimals,
    ftsoTimestamp: tender.ftsoTimestamp.toString(),
    selectionStartedAt: tender.selectionStartedAt.toString(),
    selectionAttempt: tender.selectionAttempt,
    resultNonce: tender.resultNonce.toString(),
    resultExpiry: tender.resultExpiry.toString(),
    requestId: tender.requestId,
    status: tender.status,
    teeIds: tender.teeIds,
    teeKeyFingerprints: tender.teeKeyFingerprints,
    winnerBidId: tender.winnerBidId?.toString() ?? null,
    winner: tender.winner,
    winningAmountXrp: tender.winningAmountXrp?.toString() ?? null,
    awardTransactionHash: tender.awardTransactionHash,
  };
}

export class FlarePublicOperatorService {
  readonly #source: FlarePublicOperatorSource;

  constructor(source: FlarePublicOperatorSource) {
    this.#source = source;
  }

  async listTenders({
    status,
    limit = 20,
  }: {
    status?: Coston2TenderStatus;
    limit?: number;
  } = {}) {
    if (status !== undefined && !flareTenderStatuses.includes(status)) {
      throw new FlareOperatorQueryError("invalid-status");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new FlareOperatorQueryError("invalid-limit");
    }
    const snapshot = await this.#source.snapshot();
    const matching = snapshot.tenders.filter(
      (tender) => status === undefined || tender.status === status,
    );
    return {
      chainId: snapshot.chainId,
      indexedBlock: snapshot.indexedBlock.toString(),
      finalizedBlock: snapshot.finalizedBlock.toString(),
      latestBlock: snapshot.latestBlock.toString(),
      deploymentStatus: snapshot.deploymentStatus,
      total: matching.length,
      tenders: matching.slice(0, limit).map(publicTender),
    };
  }

  async #context(tenderIdInput: string): Promise<FlareTenderContext> {
    const tenderId = positiveId(tenderIdInput);
    const snapshot = await this.#source.snapshot();
    const tender = snapshot.tenders.find((candidate) => candidate.tenderId === tenderId);
    if (!tender) throw new FlareOperatorQueryError("tender-not-found");
    return { snapshot, tender };
  }

  async getTender(tenderIdInput: string) {
    const { snapshot, tender } = await this.#context(tenderIdInput);
    return {
      chainId: snapshot.chainId,
      indexedBlock: snapshot.indexedBlock.toString(),
      deploymentStatus: snapshot.deploymentStatus,
      tender: publicTender(tender),
    };
  }

  async inspectSelection(tenderIdInput: string) {
    const { snapshot, tender } = await this.#context(tenderIdInput);
    return {
      chainId: snapshot.chainId,
      indexedBlock: snapshot.indexedBlock.toString(),
      tenderId: tender.tenderId.toString(),
      status: tender.status,
      extensionId: tender.extensionId.toString(),
      codeVersion: tender.codeVersion,
      teeIds: tender.teeIds,
      teeKeyFingerprints: tender.teeKeyFingerprints,
      commonQuorumBitmap: tender.commonQuorumBitmap,
      orderedBidRoot: tender.orderedBidRoot,
      closeBlock: tender.closeBlock.toString(),
      ftsoFeedId: tender.ftsoFeedId,
      ftsoValue: tender.ftsoValue.toString(),
      ftsoDecimals: tender.ftsoDecimals,
      ftsoTimestamp: tender.ftsoTimestamp.toString(),
      selectionAttempt: tender.selectionAttempt,
      requestId: tender.requestId,
      resultNonce: tender.resultNonce.toString(),
      resultExpiry: tender.resultExpiry.toString(),
      winnerBidId: tender.winnerBidId?.toString() ?? null,
      winner: tender.winner,
      winningAmountXrp: tender.winningAmountXrp?.toString() ?? null,
      awardTransactionHash: tender.awardTransactionHash,
    };
  }

  async inspectProtocolBinding() {
    const binding = await this.#source.protocolBinding();
    return {
      ...binding,
      deploymentBlock: binding.deploymentBlock.toString(),
      finalizedBlock: binding.finalizedBlock.toString(),
      tenderCount: binding.tenderCount.toString(),
      teeCount: binding.teeCount.toString(),
    };
  }
}
