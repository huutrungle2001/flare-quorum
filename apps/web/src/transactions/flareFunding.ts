import {
  assertXrpPaymentProof,
  buildMintAndFundPlan,
  encodeExecuteDirectMintingWithData,
  quoteSmartAccountDirectMinting,
  testXrpSourceId,
  xrpPaymentAttestationType,
  type DirectMintingQuote,
  type FlareTenderTerms,
  type PackedUserOperation,
  type XrpPaymentProof,
  type XrpPaymentProofExpectation,
} from "@veilbid/flare-bindings";
import type { Address, Hex } from "viem";

export interface FlareFundingPreparation {
  assetManager: Address;
  userOperation: PackedUserOperation;
  userOperationData: Hex;
  userOperationCommitment: Hex;
  memoData: Hex;
  proofExpectation: XrpPaymentProofExpectation;
  paymentQuote: DirectMintingQuote;
}

export function prepareFlareFunding(input: {
  personalAccount: Address;
  nonce: bigint;
  fTestXrp: Address;
  market: Address;
  terms: FlareTenderTerms;
  walletId: number;
  executorFee: bigint;
  assetManager: Address;
  transactionId: Hex;
  proofOwner: Address;
  directMintingFeeBips: bigint;
  directMintingMinimumFeeUBA: bigint;
  receivingAddressHash?: Hex;
  minimumReceivedAmount?: bigint;
}): FlareFundingPreparation {
  const plan = buildMintAndFundPlan(input);
  const paymentQuote = quoteSmartAccountDirectMinting(
    input.terms.scoringPolicy.ceilingXrpMicros + input.executorFee,
    input.directMintingFeeBips,
    input.directMintingMinimumFeeUBA,
  );
  return {
    assetManager: input.assetManager,
    userOperation: plan.userOperation,
    userOperationData: plan.userOperationData,
    userOperationCommitment: plan.userOperationCommitment,
    memoData: plan.memoData,
    paymentQuote,
    proofExpectation: {
      attestationType: xrpPaymentAttestationType,
      sourceId: testXrpSourceId,
      transactionId: input.transactionId,
      proofOwner: input.proofOwner,
      memoData: plan.memoData,
      receivingAddressHash: input.receivingAddressHash,
      minimumReceivedAmount: input.minimumReceivedAmount,
    },
  };
}

/**
 * Bind the FDC proof to the exact user operation before the caller submits a
 * transaction. The proof must come from the official FDC flow; this helper
 * never fabricates or persists a proof.
 */
export function encodeFlareDirectMintingCall(
  preparation: FlareFundingPreparation,
  proof: XrpPaymentProof,
): Hex {
  assertXrpPaymentProof(proof, preparation.proofExpectation);
  return encodeExecuteDirectMintingWithData(proof, preparation.userOperationData);
}
