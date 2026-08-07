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
} from "./flare-funding-chain.js";
import type { FlareFundingJob } from "./flare-funding-job.js";
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
      executionAllowedAt: bigint;
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

  async execute(job: FlareFundingJob): Promise<FlareFundingExecution> {
    if (
      this.config.mode !== "execute" ||
      this.chain.executorAddress === null ||
      this.config.verifierApiKey === null
    ) {
      throw new Error("FLARE_FUNDING_WRITE_DISABLED");
    }
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
    const totalCallValue = plan.calls.reduce((sum, call) => sum + call.value, 0n);
    this.stage("direct-mint");
    const mintReceipt = await this.chain.executeDirectMinting(
      network.contracts.assetManager,
      proof,
      plan.userOperationData,
      totalCallValue,
    );
    if (mintReceipt.status !== "success") throw new Error("DIRECT_MINTING_REVERTED");
    this.stage("inspect-direct-mint");
    const mintOutcome = inspectDirectMintingReceipt({
      logs: mintReceipt.logs,
      assetManager: network.contracts.assetManager,
      masterAccountController: network.contracts.masterAccountController,
      transactionId: job.xrplTransactionId,
      executor: this.chain.executorAddress,
      memoData: plan.memoData,
      personalAccount: job.personalAccount,
      nonce: job.nonce,
    });
    const common = {
      xrplTransactionId: job.xrplTransactionId,
      xrplFinality,
      fdcRequestTransactionHash: requestReceipt.transactionHash,
      fdcVotingRound: votingRoundId,
      directMintingTransactionHash: mintReceipt.transactionHash,
      directMintingBlock: mintReceipt.blockNumber,
      userOperationCommitment: plan.userOperationCommitment,
    } as const;
    if (mintOutcome.status === "delayed") {
      return {
        outcome: "delayed",
        ...common,
        executionAllowedAt: mintOutcome.executionAllowedAt,
      };
    }
    if (mintOutcome.mintedAmountUBA < requiredMintedAmountUBA) {
      throw new Error("DIRECT_MINTING_UNDERFUNDED");
    }
    this.stage("prove-tender-created");
    const tender = parseEventLogs({
      abi: tenderCreatedEventAbi,
      eventName: "TenderCreated",
      logs: [...mintReceipt.logs],
      strict: true,
    }).find((event) =>
      event.address.toLowerCase() === this.config.marketAddress.toLowerCase() &&
      event.args.buyer.toLowerCase() === job.personalAccount.toLowerCase() &&
      event.args.rulesHash.toLowerCase() === calculateFlareRulesHash(job.terms.scoringPolicy).toLowerCase() &&
      event.args.ceiling === job.terms.scoringPolicy.ceilingXrpMicros
    );
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
}
