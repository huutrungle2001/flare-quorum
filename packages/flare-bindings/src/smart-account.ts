import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  toHex,
  zeroHash,
  type Address,
  type Hex,
} from "viem";

const erc20ApproveAbi = [{
  type: "function", name: "approve", stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

const marketCreateTenderAbi = [{
  type: "function", name: "createTender", stateMutability: "nonpayable",
  inputs: [{ name: "terms", type: "tuple", components: [
    { name: "metadataHash", type: "bytes32" }, { name: "rulesHash", type: "bytes32" },
    { name: "publicCeilingXrp", type: "uint256" }, { name: "bidDeadline", type: "uint64" },
    { name: "approvedVendors", type: "address[]" }, { name: "extensionId", type: "uint256" },
    { name: "codeVersion", type: "bytes32" }, { name: "teeIds", type: "address[3]" },
    { name: "teeKeyFingerprints", type: "bytes32[3]" }, { name: "ftsoFeedId", type: "bytes21" },
  ] }], outputs: [{ name: "tenderId", type: "uint256" }],
}] as const;

export const personalAccountExecuteUserOpAbi = [{
  type: "function", name: "executeUserOp", stateMutability: "payable",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
  ] }], outputs: [],
}] as const;

export const smartAccountReaderAbi = [
  { type: "function", name: "getPersonalAccount", stateMutability: "view", inputs: [{ name: "xrplOwner", type: "string" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "getNonce", stateMutability: "view", inputs: [{ name: "personalAccount", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

const packedUserOperationParameter = [{ type: "tuple", components: [
  { name: "sender", type: "address" }, { name: "nonce", type: "uint256" },
  { name: "initCode", type: "bytes" }, { name: "callData", type: "bytes" },
  { name: "accountGasLimits", type: "bytes32" }, { name: "preVerificationGas", type: "uint256" },
  { name: "gasFees", type: "bytes32" }, { name: "paymasterAndData", type: "bytes" },
  { name: "signature", type: "bytes" },
] }] as const;

export interface FlareTenderTerms {
  metadataHash: Hex;
  rulesHash: Hex;
  publicCeilingXrp: bigint;
  bidDeadline: bigint;
  approvedVendors: readonly Address[];
  extensionId: bigint;
  codeVersion: Hex;
  teeIds: readonly [Address, Address, Address];
  teeKeyFingerprints: readonly [Hex, Hex, Hex];
  ftsoFeedId: Hex;
}

export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

export interface MintAndFundPlan {
  calls: readonly [{ target: Address; value: 0n; data: Hex }, { target: Address; value: 0n; data: Hex }];
  userOperation: PackedUserOperation;
  userOperationData: Hex;
  userOperationCommitment: Hex;
  memoData: Hex;
}

export function buildMintAndFundPlan(input: {
  personalAccount: Address;
  nonce: bigint;
  fTestXrp: Address;
  market: Address;
  terms: FlareTenderTerms;
  walletId: number;
  executorFee: bigint;
}): MintAndFundPlan {
  if (input.nonce < 0n || input.terms.publicCeilingXrp <= 0n) throw new Error("INVALID_USER_OPERATION");
  if (!Number.isInteger(input.walletId) || input.walletId < 0 || input.walletId > 255) throw new Error("INVALID_WALLET_ID");
  if (input.executorFee < 0n || input.executorFee > 0xffff_ffff_ffff_ffffn) throw new Error("INVALID_EXECUTOR_FEE");

  const calls = [
    { target: input.fTestXrp, value: 0n as const, data: encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [input.market, input.terms.publicCeilingXrp] }) },
    { target: input.market, value: 0n as const, data: encodeFunctionData({ abi: marketCreateTenderAbi, functionName: "createTender", args: [input.terms] }) },
  ] as const;
  const callData = encodeFunctionData({ abi: personalAccountExecuteUserOpAbi, functionName: "executeUserOp", args: [calls] });
  const userOperation: PackedUserOperation = {
    sender: input.personalAccount,
    nonce: input.nonce,
    initCode: "0x",
    callData,
    accountGasLimits: zeroHash,
    preVerificationGas: 0n,
    gasFees: zeroHash,
    paymasterAndData: "0x",
    signature: "0x",
  };
  const userOperationData = encodeAbiParameters(packedUserOperationParameter, [userOperation]);
  const userOperationCommitment = keccak256(userOperationData);
  const memoData = concatHex(["0xfe", toHex(input.walletId, { size: 1 }), toHex(input.executorFee, { size: 8 }), userOperationCommitment]);
  if ((memoData.length - 2) / 2 !== 42) throw new Error("INVALID_0XFE_MEMO_LENGTH");
  return { calls, userOperation, userOperationData, userOperationCommitment, memoData };
}

export function buildIgnoreMemo(walletId: number, executorFee: bigint, targetTransactionId: Hex): Hex {
  if (!Number.isInteger(walletId) || walletId < 0 || walletId > 255) throw new Error("INVALID_WALLET_ID");
  if (executorFee < 0n || executorFee > 0xffff_ffff_ffff_ffffn) throw new Error("INVALID_EXECUTOR_FEE");
  const memo = concatHex(["0xe0", toHex(walletId, { size: 1 }), toHex(executorFee, { size: 8 }), targetTransactionId]);
  if ((memo.length - 2) / 2 !== 42) throw new Error("INVALID_TARGET_TRANSACTION_ID");
  return memo;
}
