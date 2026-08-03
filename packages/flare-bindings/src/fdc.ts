import { encodeFunctionData, type Address, type Hex } from "viem";

/** The Coston2 IXRPPayment proof shape from the pinned Flare periphery source. */
export interface XrpPaymentRequestBody {
  transactionId: Hex;
  proofOwner: Address;
}

export interface XrpPaymentResponseBody {
  blockNumber: bigint;
  blockTimestamp: bigint;
  sourceAddress: string;
  sourceAddressHash: Hex;
  receivingAddressHash: Hex;
  intendedReceivingAddressHash: Hex;
  spentAmount: bigint;
  intendedSpentAmount: bigint;
  receivedAmount: bigint;
  intendedReceivedAmount: bigint;
  hasMemoData: boolean;
  firstMemoData: Hex;
  hasDestinationTag: boolean;
  destinationTag: bigint;
  status: number;
}

export interface XrpPaymentResponse {
  attestationType: Hex;
  sourceId: Hex;
  votingRound: bigint;
  lowestUsedTimestamp: bigint;
  requestBody: XrpPaymentRequestBody;
  responseBody: XrpPaymentResponseBody;
}

export interface XrpPaymentProof {
  merkleProof: readonly Hex[];
  data: XrpPaymentResponse;
}

export interface XrpPaymentProofExpectation {
  attestationType: Hex;
  sourceId: Hex;
  transactionId: Hex;
  proofOwner: Address;
  memoData: Hex;
  receivingAddressHash?: Hex;
  minimumReceivedAmount?: bigint;
}

const xrpPaymentProofParameter = {
  type: "tuple",
  components: [
    { name: "merkleProof", type: "bytes32[]" },
    {
      name: "data",
      type: "tuple",
      components: [
        { name: "attestationType", type: "bytes32" },
        { name: "sourceId", type: "bytes32" },
        { name: "votingRound", type: "uint64" },
        { name: "lowestUsedTimestamp", type: "uint64" },
        {
          name: "requestBody",
          type: "tuple",
          components: [
            { name: "transactionId", type: "bytes32" },
            { name: "proofOwner", type: "address" },
          ],
        },
        {
          name: "responseBody",
          type: "tuple",
          components: [
            { name: "blockNumber", type: "uint64" },
            { name: "blockTimestamp", type: "uint64" },
            { name: "sourceAddress", type: "string" },
            { name: "sourceAddressHash", type: "bytes32" },
            { name: "receivingAddressHash", type: "bytes32" },
            { name: "intendedReceivingAddressHash", type: "bytes32" },
            { name: "spentAmount", type: "int256" },
            { name: "intendedSpentAmount", type: "int256" },
            { name: "receivedAmount", type: "int256" },
            { name: "intendedReceivedAmount", type: "int256" },
            { name: "hasMemoData", type: "bool" },
            { name: "firstMemoData", type: "bytes" },
            { name: "hasDestinationTag", type: "bool" },
            { name: "destinationTag", type: "uint256" },
            { name: "status", type: "uint8" },
          ],
        },
      ],
    },
  ],
} as const;

/** Official AssetManager entry point used for Smart Account direct minting. */
export const assetManagerDirectMintingAbi = [
  {
    type: "function",
    name: "executeDirectMintingWithData",
    stateMutability: "payable",
    inputs: [xrpPaymentProofParameter, { name: "data", type: "bytes" }],
    outputs: [],
  },
] as const;

function equalHex(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function isBytes32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Validate only the public FDC/payment binding required before a write.
 * This does not replace on-chain Merkle verification and never manufactures a
 * proof; callers must supply the proof returned by the official FDC flow.
 */
export function assertXrpPaymentProof(
  proof: XrpPaymentProof,
  expected: XrpPaymentProofExpectation,
): void {
  const response = proof.data;
  const request = response.requestBody;
  const payment = response.responseBody;
  if (proof.merkleProof.length === 0) throw new Error("INVALID_FDC_PROOF");
  if (
    !isBytes32(response.attestationType) ||
    !isBytes32(response.sourceId) ||
    !isBytes32(request.transactionId) ||
    !equalHex(response.attestationType, expected.attestationType) ||
    !equalHex(response.sourceId, expected.sourceId) ||
    !equalHex(request.transactionId, expected.transactionId) ||
    request.proofOwner.toLowerCase() !== expected.proofOwner.toLowerCase()
  ) {
    throw new Error("FDC_PAYMENT_DOMAIN_MISMATCH");
  }
  if (
    payment.status !== 0 ||
    payment.blockNumber === 0n ||
    payment.blockTimestamp === 0n ||
    payment.spentAmount <= 0n ||
    payment.receivedAmount <= 0n ||
    !payment.hasMemoData ||
    !equalHex(payment.firstMemoData, expected.memoData) ||
    payment.hasDestinationTag
  ) {
    throw new Error("INVALID_XRP_PAYMENT");
  }
  if (
    expected.receivingAddressHash !== undefined &&
    !equalHex(payment.receivingAddressHash, expected.receivingAddressHash)
  ) {
    throw new Error("FDC_RECEIVING_ADDRESS_MISMATCH");
  }
  if (
    expected.minimumReceivedAmount !== undefined &&
    payment.receivedAmount < expected.minimumReceivedAmount
  ) {
    throw new Error("FDC_PAYMENT_UNDERFUNDED");
  }
}

export function encodeExecuteDirectMintingWithData(
  proof: XrpPaymentProof,
  userOperationData: Hex,
): Hex {
  return encodeFunctionData({
    abi: assetManagerDirectMintingAbi,
    functionName: "executeDirectMintingWithData",
    args: [proof, userOperationData],
  });
}
