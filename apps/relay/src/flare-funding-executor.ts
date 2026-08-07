import {
  assertXrpPaymentProof,
  buildMintAndFundPlan,
  calculateFlareRulesHash,
  calculateFdcVotingRound,
  inspectDirectMintingReceipt,
  prepareXrpPaymentRequest,
  quoteSmartAccountDirectMinting,
  retrieveXrpPaymentProof,
  testXrpSourceId,
  xrpPaymentAttestationType,
} from "@veilbid/flare-bindings";
import {
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import type { FlareFundingConfig } from "./flare-funding-config.js";
import type {
  FlareFundingChain,
  FlareFundingNetwork,
  FlareFundingTenderFact,
} from "./flare-funding-chain.js";
import type {
  FlareFundingCheckpoint,
  FlareFundingJob,
} from "./flare-funding-job.js";
import { waitForXrplFinality, type XrplFinality } from "./xrpl-finality.js";

const tenderCreatedEventAbi = [{
  type: "event",
  name: "TenderCreated",
  anonymous: false,
  inputs: [
    { name: "tenderId", type: "uint256", indexed: true },
    { name: "buyer", type: "address", indexed: true },
    { name: "rulesHash", type: "bytes32", indexed: true },
    { name: "ceiling", type: "uint256", indexed: false },
  ],
}] as const;

export interface FlareFundingHealth {
  status: "ready" | "read-only";
  chainId: 114;
  blockNumber: bigint;
  finalizedBlock: bigint;
  market: Address;
  assetManager: Address;
  fTestXrp: Address;
  fdcHub: Address;
  fdcVerification: Address;
  relay: Address;
  masterAccountController: Address;
  directMintingPaymentAddress: string;
  marketRuntimeCodeHash: Hex;
  executor: Address | null;
}

export type FlareFundingExecution =
  | {
      outcome: "delayed";
      xrplTransactionId: Hex;
      xrplFinality: XrplFinality;
      fdcRequestTransactionHash: Hex;
      fdcVotingRound: bigint;
      directMintingTransactionHash: Hex;
      directMintingBlock: bigint;
      userOperationCommitment: Hex;
      paymentAmountUBA: bigint;
      executionAllowedAt: bigint;
      checkpoint: FlareFundingCheckpoint;
    }
  | {
      outcome: "executed";
      xrplTransactionId: Hex;
      xrplFinality: XrplFinality;
      fdcRequestTransactionHash: Hex;
      fdcVotingRound: bigint;
      directMintingTransactionHash: Hex;
      directMintingBlock: bigint;
      userOperationCommitment: Hex;
      personalAccount: Address;
      nonce: bigint;
      tenderId: bigint;
      mintedAmountUBA: bigint;
      mintingFeeUBA: bigint;
    };

export interface FlareFundingExecutorOptions {
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  onStage?: (stage: string) => void;
}

const MAX_TENDER_STATE_FALLBACK_SCAN = 16n;

interface TenderCreatedFact {
  args: {
    tenderId: bigint;
    buyer: Address;
    rulesHash: Hex;
    ceiling: bigint;
  };
}

export class FlareFundingExecutor {
  readonly config: FlareFundingConfig;
  readonly chain: FlareFundingChain;
  readonly options: FlareFundingExecutorOptions;

  constructor(
    config: FlareFundingConfig,
    chain: FlareFundingChain,
    options: FlareFundingExecutorOptions = {},
  ) {
    this.config = config;
    this.chain = chain;
    this.options = options;
  }

  private sleep(milliseconds: number): Promise<void> {
    return this.options.sleep
      ? this.options.sleep(milliseconds)
      : new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private stage(name: string): void {
    this.options.onStage?.(name);
  }

  async health(): Promise<FlareFundingHealth> {
    const network = await this.chain.inspectNetwork();
    return {
      status:
        this.config.marketDeploymentStatus === "verified" &&
        this.chain.executorAddress !== null &&
        this.config.verifierApiKey !== null
          ? "ready"
          : "read-only",
      chainId: network.chainId,
      blockNumber: network.blockNumber,
      finalizedBlock: network.finalizedBlock,
      market: this.config.marketAddress,
      assetManager: network.contracts.assetManager,
      fTestXrp: network.fTestXrp,
      fdcHub: network.contracts.fdcHub,
      fdcVerification: network.contracts.fdcVerification,
      relay: network.contracts.relay,
      masterAccountController: network.contracts.masterAccountController,
      directMintingPaymentAddress: network.directMintingPaymentAddress,
      marketRuntimeCodeHash: network.marketRuntimeCodeHash,
      executor: this.chain.executorAddress,
    };
  }

  private async waitForFdcFinalization(
    network: FlareFundingNetwork,
    votingRoundId: bigint,
  ): Promise<void> {
    const protocolId = await this.chain.getFdcProtocolId(
      network.contracts.fdcVerification,
    );
    for (let attempt = 0; attempt < this.config.pollAttempts; attempt += 1) {
      if (await this.chain.isFdcFinalized(
        network.contracts.relay,
        protocolId,
        votingRoundId,
      )) return;
      if (attempt + 1 < this.config.pollAttempts) {
        await this.sleep(this.config.pollIntervalMs);
      }
    }
    throw new Error("FDC_FINALIZATION_TIMEOUT");
  }

  private async retrieveProof(
    votingRoundId: bigint,
    abiEncodedRequest: Hex,
  ) {
    for (let attempt = 0; attempt < this.config.pollAttempts; attempt += 1) {
      const proof = await retrieveXrpPaymentProof({
        daLayerBaseUrl: this.config.daLayerBaseUrl,
        daLayerApiKey: this.config.daLayerApiKey ?? undefined,
        votingRoundId,
        abiEncodedRequest,
      }, { fetchImplementation: this.options.fetchImplementation });
      if (proof !== null) return proof;
      if (attempt + 1 < this.config.pollAttempts) {
        await this.sleep(this.config.pollIntervalMs);
      }
    }
    throw new Error("FDC_PROOF_TIMEOUT");
  }

  private assertWritable(): asserts this is this & {
    chain: FlareFundingChain & { executorAddress: Address };
    config: FlareFundingConfig & { verifierApiKey: string };
  } {
    if (
      this.config.mode !== "execute" ||
      this.chain.executorAddress === null ||
      this.config.verifierApiKey === null
    ) {
      throw new Error("FLARE_FUNDING_WRITE_DISABLED");
    }
  }

  private async finishMint(input: {
    network: FlareFundingNetwork;
    job: FlareFundingJob;
    plan: ReturnType<typeof buildMintAndFundPlan>;
    requiredMintedAmountUBA: bigint;
    xrplFinality: XrplFinality;
    fdcRequestTransactionHash: Hex;
    fdcVotingRound: bigint;
    fdcAbiEncodedRequest: Hex;
    paymentAmountUBA: bigint;
    tenderCountBefore: bigint | null;
    mintReceipt: Awaited<ReturnType<FlareFundingChain["executeDirectMinting"]>>;
  }): Promise<FlareFundingExecution> {
    const {
      network,
      job,
      plan,
      requiredMintedAmountUBA,
      xrplFinality,
      fdcRequestTransactionHash,
      fdcVotingRound,
      fdcAbiEncodedRequest,
      paymentAmountUBA,
      tenderCountBefore,
      mintReceipt,
    } = input;
    if (mintReceipt.status !== "success") throw new Error("DIRECT_MINTING_REVERTED");
    const executor = this.chain.executorAddress;
    if (executor === null) throw new Error("FLARE_FUNDING_WRITE_DISABLED");
    this.stage("inspect-direct-mint");
    const mintOutcome = inspectDirectMintingReceipt({
      logs: mintReceipt.logs,
      assetManager: network.contracts.assetManager,
      masterAccountController: network.contracts.masterAccountController,
      transactionId: job.xrplTransactionId,
      executor,
      memoData: plan.memoData,
      personalAccount: job.personalAccount,
      nonce: job.nonce,
    });
    const common = {
      xrplTransactionId: job.xrplTransactionId,
      xrplFinality,
      fdcRequestTransactionHash,
      fdcVotingRound,
      directMintingTransactionHash: mintReceipt.transactionHash,
      directMintingBlock: mintReceipt.blockNumber,
      userOperationCommitment: plan.userOperationCommitment,
      paymentAmountUBA,
    } as const;
    if (mintOutcome.status === "delayed") {
      const checkpoint: FlareFundingCheckpoint = {
        version: 1,
        kind: "flare-xrp-funding",
        job,
        xrplFinality,
        fdcRequestTransactionHash,
        fdcVotingRound,
        fdcAbiEncodedRequest,
        directMintingTransactionHash: mintReceipt.transactionHash,
        directMintingBlock: mintReceipt.blockNumber,
        userOperationCommitment: plan.userOperationCommitment,
        paymentAmountUBA,
        executionAllowedAt: mintOutcome.executionAllowedAt,
      };
      return {
        outcome: "delayed",
        ...common,
        executionAllowedAt: mintOutcome.executionAllowedAt,
        checkpoint,
      };
    }
    if (mintOutcome.mintedAmountUBA < requiredMintedAmountUBA) {
      throw new Error("DIRECT_MINTING_UNDERFUNDED");
    }
    this.stage("prove-tender-created");
    let tender = parseEventLogs({
      abi: tenderCreatedEventAbi,
      eventName: "TenderCreated",
      logs: [...mintReceipt.logs],
      strict: true,
    }).find((event) =>
      event.address.toLowerCase() === this.config.marketAddress.toLowerCase() &&
      event.args.buyer.toLowerCase() === job.personalAccount.toLowerCase() &&
      event.args.rulesHash.toLowerCase() === calculateFlareRulesHash(job.terms.scoringPolicy).toLowerCase() &&
      event.args.ceiling === job.terms.scoringPolicy.ceilingXrpMicros
    ) as TenderCreatedFact | undefined;
    // Some Coston2 RPC responses can briefly omit deeply nested logs even
    // though the state transition is committed. Re-read only the bounded
    // set of tenders created after our preflight count and require the exact
    // buyer/rules/ceiling tuple before accepting the funding result.
    if (
      !tender && tenderCountBefore !== null && this.chain.getMarketTender &&
      this.chain.getMarketTenderCount
    ) {
      let tenderCountAfter = tenderCountBefore;
      for (let attempt = 0; attempt < 6 && tenderCountAfter <= tenderCountBefore; attempt += 1) {
        tenderCountAfter = await this.chain.getMarketTenderCount(this.config.marketAddress);
        if (tenderCountAfter > tenderCountBefore) break;
        if (attempt < 5) await this.sleep(1_000);
      }
      const createdCount = tenderCountAfter - tenderCountBefore;
      if (createdCount > 0n && createdCount <= MAX_TENDER_STATE_FALLBACK_SCAN) {
        for (let id = tenderCountBefore + 1n; id <= tenderCountAfter; id += 1n) {
          const state: FlareFundingTenderFact = await this.chain.getMarketTender(
            this.config.marketAddress,
            id,
          );
          if (
            state.buyer.toLowerCase() === job.personalAccount.toLowerCase() &&
            state.rulesHash.toLowerCase() === calculateFlareRulesHash(job.terms.scoringPolicy).toLowerCase() &&
            state.publicCeilingXrp === job.terms.scoringPolicy.ceilingXrpMicros
          ) {
            tender = { args: {
              tenderId: id,
              buyer: state.buyer,
              rulesHash: state.rulesHash,
              ceiling: state.publicCeilingXrp,
            } };
            break;
          }
        }
      }
    }
    if (!tender) throw new Error("TENDER_CREATION_NOT_PROVEN");
    return {
      outcome: "executed",
      ...common,
      personalAccount: mintOutcome.personalAccount,
      nonce: mintOutcome.nonce,
      tenderId: tender.args.tenderId,
      mintedAmountUBA: mintOutcome.mintedAmountUBA,
      mintingFeeUBA: mintOutcome.mintingFeeUBA,
    };
  }

  async execute(job: FlareFundingJob): Promise<FlareFundingExecution> {
    this.assertWritable();
    this.stage("inspect-network");
    const network = await this.chain.inspectNetwork();
    this.stage("read-initial-nonce");
    const initialNonce = await this.chain.getSmartAccountNonce(
      network.contracts.masterAccountController,
      job.personalAccount,
    );
    if (initialNonce !== job.nonce) throw new Error("STALE_SMART_ACCOUNT_NONCE");
    this.stage("build-user-operation");
    const plan = buildMintAndFundPlan({
      personalAccount: job.personalAccount,
      nonce: job.nonce,
      fTestXrp: network.fTestXrp,
      market: this.config.marketAddress,
      terms: job.terms,
      walletId: job.walletId,
      executorFee: job.executorFeeUBA,
    });
    const requiredMintedAmountUBA =
      job.terms.scoringPolicy.ceilingXrpMicros + job.executorFeeUBA;
    const quote = quoteSmartAccountDirectMinting(
      requiredMintedAmountUBA,
      network.directMintingFeeBips,
      network.directMintingMinimumFeeUBA,
    );
    this.stage("xrpl-finality");
    const xrplFinality = await waitForXrplFinality({
      rpcUrl: this.config.xrplRpcUrl,
      transactionId: job.xrplTransactionId,
      minimumConfirmations: this.config.xrplConfirmations,
      attempts: this.config.pollAttempts,
      pollIntervalMs: this.config.pollIntervalMs,
      fetchImplementation: this.options.fetchImplementation,
      sleep: this.options.sleep,
    });
    this.stage("fdc-prepare-request");
    const prepared = await prepareXrpPaymentRequest({
      verifierBaseUrl: this.config.verifierBaseUrl,
      apiKey: this.config.verifierApiKey,
      transactionId: job.xrplTransactionId,
      proofOwner: this.chain.executorAddress,
    }, { fetchImplementation: this.options.fetchImplementation });
    this.stage("fdc-request-fee");
    const requestFee = await this.chain.getRequestFee(
      network.contracts.fdcHub,
      prepared.abiEncodedRequest,
    );
    this.stage("fdc-submit-request");
    const requestReceipt = await this.chain.submitAttestationRequest(
      network.contracts.fdcHub,
      prepared.abiEncodedRequest,
      requestFee,
    );
    if (requestReceipt.status !== "success") throw new Error("FDC_REQUEST_REVERTED");
    this.stage("fdc-round-calculation");
    const [requestBlockTimestamp, timing] = await Promise.all([
      this.chain.getBlockTimestamp(requestReceipt.blockNumber),
      this.chain.getFdcTiming(network.contracts.flareSystemsManager),
    ]);
    const votingRoundId = calculateFdcVotingRound(
      requestBlockTimestamp,
      timing.firstVotingRoundStartTimestamp,
      timing.votingEpochDurationSeconds,
    );
    this.stage("fdc-finalization");
    await this.waitForFdcFinalization(network, votingRoundId);
    this.stage("fdc-proof");
    const proof = await this.retrieveProof(
      votingRoundId,
      prepared.abiEncodedRequest,
    );
    this.stage("fdc-proof-verification");
    assertXrpPaymentProof(proof, {
      attestationType: xrpPaymentAttestationType,
      sourceId: testXrpSourceId,
      transactionId: job.xrplTransactionId,
      proofOwner: this.chain.executorAddress,
      memoData: plan.memoData,
      votingRound: votingRoundId,
      minimumReceivedAmount: quote.paymentAmountUBA,
    });
    this.stage("derive-personal-account");
    const derivedPersonalAccount = await this.chain.getPersonalAccount(
      network.contracts.masterAccountController,
      proof.data.responseBody.sourceAddress,
    );
    if (derivedPersonalAccount !== job.personalAccount) {
      throw new Error("XRPL_OWNER_PERSONAL_ACCOUNT_MISMATCH");
    }
    this.stage("read-current-nonce");
    const currentNonce = await this.chain.getSmartAccountNonce(
      network.contracts.masterAccountController,
      job.personalAccount,
    );
    if (currentNonce !== job.nonce) throw new Error("STALE_SMART_ACCOUNT_NONCE");
    this.stage("read-tender-count");
    const tenderCountBefore = this.chain.getMarketTenderCount
      ? await this.chain.getMarketTenderCount(this.config.marketAddress)
      : null;
    const totalCallValue = plan.calls.reduce((sum, call) => sum + call.value, 0n);
    this.stage("direct-mint");
    const mintReceipt = await this.chain.executeDirectMinting(
      network.contracts.assetManager,
      proof,
      plan.userOperationData,
      totalCallValue,
    );
    return this.finishMint({
      network,
      job,
      plan,
      requiredMintedAmountUBA,
      xrplFinality,
      fdcRequestTransactionHash: requestReceipt.transactionHash,
      fdcVotingRound: votingRoundId,
      fdcAbiEncodedRequest: prepared.abiEncodedRequest,
      paymentAmountUBA: quote.paymentAmountUBA,
      tenderCountBefore,
      mintReceipt,
    });
  }

  /**
   * Resume a delayed direct mint from its public checkpoint. This path never
   * submits another XRPL payment or FDC request and never changes the nonce.
   */
  async resume(checkpoint: FlareFundingCheckpoint): Promise<FlareFundingExecution> {
    this.assertWritable();
    const job = checkpoint.job;
    this.stage("resume-inspect-network");
    const network = await this.chain.inspectNetwork();
    this.stage("resume-build-user-operation");
    const plan = buildMintAndFundPlan({
      personalAccount: job.personalAccount,
      nonce: job.nonce,
      fTestXrp: network.fTestXrp,
      market: this.config.marketAddress,
      terms: job.terms,
      walletId: job.walletId,
      executorFee: job.executorFeeUBA,
    });
    if (plan.userOperationCommitment.toLowerCase() !== checkpoint.userOperationCommitment.toLowerCase()) {
      throw new Error("FUNDING_CHECKPOINT_HASH_MISMATCH");
    }
    const requiredMintedAmountUBA =
      job.terms.scoringPolicy.ceilingXrpMicros + job.executorFeeUBA;
    const quote = quoteSmartAccountDirectMinting(
      requiredMintedAmountUBA,
      network.directMintingFeeBips,
      network.directMintingMinimumFeeUBA,
    );
    if (quote.paymentAmountUBA !== checkpoint.paymentAmountUBA) {
      throw new Error("FUNDING_CHECKPOINT_QUOTE_MISMATCH");
    }
    this.stage("resume-xrpl-finality");
    const xrplFinality = await waitForXrplFinality({
      rpcUrl: this.config.xrplRpcUrl,
      transactionId: job.xrplTransactionId,
      minimumConfirmations: this.config.xrplConfirmations,
      attempts: this.config.pollAttempts,
      pollIntervalMs: this.config.pollIntervalMs,
      fetchImplementation: this.options.fetchImplementation,
      sleep: this.options.sleep,
    });
    this.stage("resume-read-current-nonce");
    const currentNonce = await this.chain.getSmartAccountNonce(
      network.contracts.masterAccountController,
      job.personalAccount,
    );
    if (currentNonce !== job.nonce) throw new Error("STALE_SMART_ACCOUNT_NONCE");
    const currentTimestamp = await this.chain.getBlockTimestamp(network.blockNumber);
    if (currentTimestamp < checkpoint.executionAllowedAt) {
      const refreshedCheckpoint: FlareFundingCheckpoint = {
        ...checkpoint,
        xrplFinality,
      };
      return {
        outcome: "delayed",
        xrplTransactionId: job.xrplTransactionId,
        xrplFinality,
        fdcRequestTransactionHash: checkpoint.fdcRequestTransactionHash,
        fdcVotingRound: checkpoint.fdcVotingRound,
        directMintingTransactionHash: checkpoint.directMintingTransactionHash,
        directMintingBlock: checkpoint.directMintingBlock,
        userOperationCommitment: checkpoint.userOperationCommitment,
        paymentAmountUBA: checkpoint.paymentAmountUBA,
        executionAllowedAt: checkpoint.executionAllowedAt,
        checkpoint: refreshedCheckpoint,
      };
    }
    this.stage("resume-fdc-finalization");
    await this.waitForFdcFinalization(network, checkpoint.fdcVotingRound);
    this.stage("resume-fdc-proof");
    const proof = await this.retrieveProof(
      checkpoint.fdcVotingRound,
      checkpoint.fdcAbiEncodedRequest,
    );
    this.stage("resume-fdc-proof-verification");
    assertXrpPaymentProof(proof, {
      attestationType: xrpPaymentAttestationType,
      sourceId: testXrpSourceId,
      transactionId: job.xrplTransactionId,
      proofOwner: this.chain.executorAddress,
      memoData: plan.memoData,
      votingRound: checkpoint.fdcVotingRound,
      minimumReceivedAmount: checkpoint.paymentAmountUBA,
    });
    this.stage("resume-derive-personal-account");
    const derivedPersonalAccount = await this.chain.getPersonalAccount(
      network.contracts.masterAccountController,
      proof.data.responseBody.sourceAddress,
    );
    if (derivedPersonalAccount !== job.personalAccount) {
      throw new Error("XRPL_OWNER_PERSONAL_ACCOUNT_MISMATCH");
    }
    const tenderCountBefore = this.chain.getMarketTenderCount
      ? await this.chain.getMarketTenderCount(this.config.marketAddress)
      : null;
    const totalCallValue = plan.calls.reduce((sum, call) => sum + call.value, 0n);
    this.stage("resume-direct-mint");
    const mintReceipt = await this.chain.executeDirectMinting(
      network.contracts.assetManager,
      proof,
      plan.userOperationData,
      totalCallValue,
    );
    return this.finishMint({
      network,
      job,
      plan,
      requiredMintedAmountUBA,
      xrplFinality,
      fdcRequestTransactionHash: checkpoint.fdcRequestTransactionHash,
      fdcVotingRound: checkpoint.fdcVotingRound,
      fdcAbiEncodedRequest: checkpoint.fdcAbiEncodedRequest,
      paymentAmountUBA: checkpoint.paymentAmountUBA,
      tenderCountBefore,
      mintReceipt,
    });
  }
}
