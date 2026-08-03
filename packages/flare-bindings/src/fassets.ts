import {
  parseEventLogs,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { xrpPaymentProofParameter } from "./fdc.js";

export const flareContractRegistryAbi = [{
  type: "function",
  name: "getContractAddressByName",
  stateMutability: "view",
  inputs: [{ name: "_name", type: "string" }],
  outputs: [{ name: "", type: "address" }],
}] as const;

export const fdcHubAbi = [
  {
    type: "function",
    name: "fdcRequestFeeConfigurations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "requestAttestation",
    stateMutability: "payable",
    inputs: [{ name: "_data", type: "bytes" }],
    outputs: [],
  },
] as const;

export const fdcRequestFeeConfigurationsAbi = [{
  type: "function",
  name: "getRequestFee",
  stateMutability: "view",
  inputs: [{ name: "_data", type: "bytes" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

export const flareSystemsManagerAbi = [
  {
    type: "function",
    name: "firstVotingRoundStartTs",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "votingEpochDurationSeconds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
] as const;

export const fdcVerificationProtocolAbi = [{
  type: "function",
  name: "fdcProtocolId",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "_fdcProtocolId", type: "uint8" }],
}] as const;

export const relayFinalizationAbi = [{
  type: "function",
  name: "isFinalized",
  stateMutability: "view",
  inputs: [
    { name: "_protocolId", type: "uint256" },
    { name: "_votingRoundId", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
}] as const;

export const assetManagerFAssetsAbi = [
  {
    type: "function",
    name: "fAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "directMintingPaymentAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "getDirectMintingFeeBIPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getDirectMintingMinimumFeeUBA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "executeDirectMintingWithData",
    stateMutability: "payable",
    inputs: [xrpPaymentProofParameter, { name: "_data", type: "bytes" }],
    outputs: [],
  },
  {
    type: "event",
    name: "DirectMintingDelayed",
    anonymous: false,
    inputs: [
      { name: "transactionId", type: "bytes32", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "executionAllowedAt", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DirectMintingExecutedToSmartAccount",
    anonymous: false,
    inputs: [
      { name: "transactionId", type: "bytes32", indexed: false },
      { name: "sourceAddress", type: "string", indexed: false },
      { name: "executor", type: "address", indexed: false },
      { name: "mintedAmountUBA", type: "uint256", indexed: false },
      { name: "mintingFeeUBA", type: "uint256", indexed: false },
      { name: "memoData", type: "bytes", indexed: false },
    ],
  },
] as const;

export const memoInstructionsEventsAbi = [{
  type: "event",
  name: "UserOperationExecuted",
  anonymous: false,
  inputs: [
    { name: "personalAccount", type: "address", indexed: true },
    { name: "nonce", type: "uint256", indexed: false },
  ],
}] as const;

export interface DirectMintingQuote {
  requiredMintedAmountUBA: bigint;
  paymentAmountUBA: bigint;
  mintingFeeUBA: bigint;
}

/**
 * Solve the percentage fee against the gross payment, then apply the minimum
 * fee. The result guarantees payment - fee >= requested minted amount.
 */
export function quoteSmartAccountDirectMinting(
  requiredMintedAmountUBA: bigint,
  feeBips: bigint,
  minimumFeeUBA: bigint,
): DirectMintingQuote {
  if (
    requiredMintedAmountUBA <= 0n ||
    feeBips < 0n ||
    feeBips >= 10_000n ||
    minimumFeeUBA < 0n
  ) {
    throw new Error("INVALID_DIRECT_MINTING_QUOTE_INPUT");
  }
  const denominator = 10_000n - feeBips;
  const percentageCandidate =
    (requiredMintedAmountUBA * 10_000n + denominator - 1n) / denominator;
  let paymentAmountUBA = percentageCandidate > requiredMintedAmountUBA + minimumFeeUBA
    ? percentageCandidate
    : requiredMintedAmountUBA + minimumFeeUBA;
  let mintingFeeUBA = (paymentAmountUBA * feeBips) / 10_000n;
  if (mintingFeeUBA < minimumFeeUBA) mintingFeeUBA = minimumFeeUBA;
  while (paymentAmountUBA - mintingFeeUBA < requiredMintedAmountUBA) {
    paymentAmountUBA += 1n;
    mintingFeeUBA = (paymentAmountUBA * feeBips) / 10_000n;
    if (mintingFeeUBA < minimumFeeUBA) mintingFeeUBA = minimumFeeUBA;
  }
  while (paymentAmountUBA > 1n) {
    const previousAmount = paymentAmountUBA - 1n;
    let previousFee = (previousAmount * feeBips) / 10_000n;
    if (previousFee < minimumFeeUBA) previousFee = minimumFeeUBA;
    if (previousAmount - previousFee < requiredMintedAmountUBA) break;
    paymentAmountUBA = previousAmount;
    mintingFeeUBA = previousFee;
  }
  return { requiredMintedAmountUBA, paymentAmountUBA, mintingFeeUBA };
}

export type DirectMintingReceiptOutcome =
  | {
      status: "delayed";
      transactionId: Hex;
      amountUBA: bigint;
      executionAllowedAt: bigint;
    }
  | {
      status: "executed";
      transactionId: Hex;
      executor: Address;
      mintedAmountUBA: bigint;
      mintingFeeUBA: bigint;
      memoData: Hex;
      personalAccount: Address;
      nonce: bigint;
    };

export function inspectDirectMintingReceipt(input: {
  logs: readonly Log[];
  assetManager: Address;
  masterAccountController: Address;
  transactionId: Hex;
  executor: Address;
  memoData: Hex;
  personalAccount: Address;
  nonce: bigint;
}): DirectMintingReceiptOutcome {
  const delayed = parseEventLogs({
    abi: assetManagerFAssetsAbi,
    eventName: "DirectMintingDelayed",
    logs: [...input.logs],
    strict: true,
  });
  for (const event of delayed) {
    if (
      event.address.toLowerCase() === input.assetManager.toLowerCase() &&
      event.args.transactionId.toLowerCase() === input.transactionId.toLowerCase()
    ) {
      return {
        status: "delayed",
        transactionId: event.args.transactionId,
        amountUBA: event.args.amount,
        executionAllowedAt: event.args.executionAllowedAt,
      };
    }
  }
  const minted = parseEventLogs({
    abi: assetManagerFAssetsAbi,
    eventName: "DirectMintingExecutedToSmartAccount",
    logs: [...input.logs],
    strict: true,
  }).find((event) =>
    event.address.toLowerCase() === input.assetManager.toLowerCase() &&
    event.args.transactionId.toLowerCase() === input.transactionId.toLowerCase() &&
    event.args.executor.toLowerCase() === input.executor.toLowerCase() &&
    event.args.memoData.toLowerCase() === input.memoData.toLowerCase()
  );
  const executed = parseEventLogs({
    abi: memoInstructionsEventsAbi,
    eventName: "UserOperationExecuted",
    logs: [...input.logs],
    strict: true,
  }).find((event) =>
    event.address.toLowerCase() === input.masterAccountController.toLowerCase() &&
    event.args.personalAccount.toLowerCase() === input.personalAccount.toLowerCase() &&
    event.args.nonce === input.nonce
  );
  if (!minted || !executed) throw new Error("DIRECT_MINTING_EXECUTION_NOT_PROVEN");
  return {
    status: "executed",
    transactionId: minted.args.transactionId,
    executor: minted.args.executor,
    mintedAmountUBA: minted.args.mintedAmountUBA,
    mintingFeeUBA: minted.args.mintingFeeUBA,
    memoData: minted.args.memoData,
    personalAccount: executed.args.personalAccount,
    nonce: executed.args.nonce,
  };
}
