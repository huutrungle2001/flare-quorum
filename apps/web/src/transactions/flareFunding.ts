import {
  assertXrpPaymentProof,
  buildMintAndFundPlan,
  encodeExecuteDirectMintingWithData,
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
  attestationType: Hex;
  sourceId: Hex;
  transactionId: Hex;
  proofOwner: Address;
  receivingAddressHash?: Hex;
  minimumReceivedAmount?: bigint;
}): FlareFundingPreparation {
  const plan = buildMintAndFundPlan(input);
  return {
    assetManager: input.assetManager,
    userOperation: plan.userOperation,
    userOperationData: plan.userOperationData,
    userOperationCommitment: plan.userOperationCommitment,
    memoData: plan.memoData,
    proofExpectation: {
      attestationType: input.attestationType,
      sourceId: input.sourceId,
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
