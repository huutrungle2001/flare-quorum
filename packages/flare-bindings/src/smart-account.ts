import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  stringToHex,
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
    { name: "metadataHash", type: "bytes32" },
    { name: "scoringPolicy", type: "tuple", components: [
      { name: "schemaVersion", type: "uint16" }, { name: "ceilingXrpMicros", type: "uint64" },
      { name: "bidDeadline", type: "uint64" }, { name: "allowXrp", type: "bool" },
      { name: "allowUsd", type: "bool" }, { name: "ftsoFeedId", type: "bytes21" },
      { name: "maxDeliveryDays", type: "uint16" }, { name: "minWarrantyDays", type: "uint16" },
      { name: "maxWarrantyDays", type: "uint16" }, { name: "priceWeightBps", type: "uint16" },
      { name: "deliveryWeightBps", type: "uint16" }, { name: "warrantyWeightBps", type: "uint16" },
      { name: "requiredCredentials", type: "tuple[]", components: [
        { name: "credentialType", type: "bytes32" }, { name: "issuer", type: "address" },
      ] },
    ] },
    { name: "approvedVendors", type: "address[]" }, { name: "extensionId", type: "uint256" },
    { name: "codeVersion", type: "bytes32" }, { name: "teeIds", type: "address[3]" },
    { name: "teeKeyFingerprints", type: "bytes32[3]" },
  ] }], outputs: [{ name: "tenderId", type: "uint256" }],
}] as const;

const scoringPolicyParameter = [{ type: "tuple", components: [
  { name: "schemaVersion", type: "uint16" }, { name: "ceilingXrpMicros", type: "uint64" },
  { name: "bidDeadline", type: "uint64" }, { name: "allowXrp", type: "bool" },
  { name: "allowUsd", type: "bool" }, { name: "ftsoFeedId", type: "bytes21" },
  { name: "maxDeliveryDays", type: "uint16" }, { name: "minWarrantyDays", type: "uint16" },
  { name: "maxWarrantyDays", type: "uint16" }, { name: "priceWeightBps", type: "uint16" },
  { name: "deliveryWeightBps", type: "uint16" }, { name: "warrantyWeightBps", type: "uint16" },
  { name: "requiredCredentials", type: "tuple[]", components: [
    { name: "credentialType", type: "bytes32" }, { name: "issuer", type: "address" },
  ] },
]}] as const;

const rulesDomain = keccak256(stringToHex("VEILBID_RULES_V1"));
export const coston2XrpUsdFeedId = "0x015852502f55534400000000000000000000000000" as const;
const zeroFeedId = `0x${"00".repeat(21)}`;
const zeroAddress = "0x0000000000000000000000000000000000000000";
const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;

export interface FlareCredentialRequirement {
  credentialType: Hex;
  issuer: Address;
}

export interface FlareScoringPolicy {
  schemaVersion: number;
  ceilingXrpMicros: bigint;
  bidDeadline: bigint;
  allowXrp: boolean;
  allowUsd: boolean;
  ftsoFeedId: Hex;
  maxDeliveryDays: number;
  minWarrantyDays: number;
  maxWarrantyDays: number;
  priceWeightBps: number;
  deliveryWeightBps: number;
  warrantyWeightBps: number;
  requiredCredentials: readonly FlareCredentialRequirement[];
}

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
  scoringPolicy: FlareScoringPolicy;
  approvedVendors: readonly Address[];
  extensionId: bigint;
  codeVersion: Hex;
  teeIds: readonly [Address, Address, Address];
  teeKeyFingerprints: readonly [Hex, Hex, Hex];
}

function uint16(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 65_535;
}

export function assertFlareScoringPolicy(policy: FlareScoringPolicy): void {
  const credentials = policy.requiredCredentials;
  if (
    policy.schemaVersion !== 1 || policy.ceilingXrpMicros <= 0n || policy.ceilingXrpMicros > 0xffff_ffff_ffff_ffffn ||
    policy.bidDeadline <= 0n || policy.bidDeadline > 0xffff_ffff_ffff_ffffn ||
    (!policy.allowXrp && !policy.allowUsd) || !uint16(policy.maxDeliveryDays) || policy.maxDeliveryDays === 0 ||
    !uint16(policy.minWarrantyDays) || !uint16(policy.maxWarrantyDays) ||
    policy.maxWarrantyDays < policy.minWarrantyDays || !uint16(policy.priceWeightBps) ||
    !uint16(policy.deliveryWeightBps) || !uint16(policy.warrantyWeightBps) ||
    policy.priceWeightBps + policy.deliveryWeightBps + policy.warrantyWeightBps !== 10_000 ||
    (policy.warrantyWeightBps !== 0 && policy.maxWarrantyDays === policy.minWarrantyDays) ||
    !Array.isArray(credentials) || credentials.length > 4
  ) throw new Error("INVALID_FLARE_SCORING_POLICY");
  const feed = policy.ftsoFeedId.toLowerCase();
  if (
    (policy.allowUsd && feed !== coston2XrpUsdFeedId.toLowerCase()) ||
    (!policy.allowUsd && feed !== zeroFeedId)
  ) throw new Error("INVALID_FLARE_SCORING_POLICY");
  const seen = new Set<string>();
  for (const requirement of credentials) {
    const key = `${requirement.credentialType.toLowerCase()}:${requirement.issuer.toLowerCase()}`;
    if (
      !bytes32Pattern.test(requirement.credentialType) || /^0x0{64}$/.test(requirement.credentialType) ||
      !/^0x[0-9a-fA-F]{40}$/.test(requirement.issuer) || requirement.issuer.toLowerCase() === zeroAddress ||
      seen.has(key)
    ) throw new Error("INVALID_FLARE_SCORING_POLICY");
    seen.add(key);
  }
}

export function calculateFlareRulesHash(policy: FlareScoringPolicy): Hex {
  assertFlareScoringPolicy(policy);
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, scoringPolicyParameter[0]],
    [rulesDomain, policy],
  ));
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
  assertFlareScoringPolicy(input.terms.scoringPolicy);
  if (input.nonce < 0n || !bytes32Pattern.test(input.terms.metadataHash)) throw new Error("INVALID_USER_OPERATION");
  if (!Number.isInteger(input.walletId) || input.walletId < 0 || input.walletId > 255) throw new Error("INVALID_WALLET_ID");
  if (input.executorFee < 0n || input.executorFee > 0xffff_ffff_ffff_ffffn) throw new Error("INVALID_EXECUTOR_FEE");

  const calls = [
    { target: input.fTestXrp, value: 0n as const, data: encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [input.market, input.terms.scoringPolicy.ceilingXrpMicros] }) },
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
