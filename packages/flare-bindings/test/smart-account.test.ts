import assert from "node:assert/strict";
import test from "node:test";
import { decodeAbiParameters, decodeFunctionData, keccak256, type Abi } from "viem";
import marketAbiJson from "../generated/abis/FlareQuorumMarketV2.json" with { type: "json" };
import {
  buildIgnoreMemo,
  buildMintAndFundPlan,
  calculateFlareRulesHash,
  coston2XrpUsdFeedId,
  personalAccountExecuteUserOpAbi,
} from "../src/smart-account.ts";

const packedUserOperationParameter = [{ type: "tuple", components: [
  { name: "sender", type: "address" }, { name: "nonce", type: "uint256" }, { name: "initCode", type: "bytes" },
  { name: "callData", type: "bytes" }, { name: "accountGasLimits", type: "bytes32" },
  { name: "preVerificationGas", type: "uint256" }, { name: "gasFees", type: "bytes32" },
  { name: "paymasterAndData", type: "bytes" }, { name: "signature", type: "bytes" },
] }] as const;

test("builds exact 0xFE commitment for atomic FTestXRP approval and tender funding", () => {
  const plan = buildMintAndFundPlan({
    personalAccount: "0x1000000000000000000000000000000000000001", nonce: 7n,
    fTestXrp: "0x0b6A3645c240605887a5532109323A3E12273dc7", market: "0x2000000000000000000000000000000000000002",
    walletId: 3, executorFee: 25n,
    terms: {
      metadataHash: "0x0000000000000000000000000000000000000000000000000000000000001111",
      scoringPolicy: {
        schemaVersion: 1, ceilingXrpMicros: 1_000_000n, bidDeadline: 2_000n,
        allowXrp: true, allowUsd: true, ftsoFeedId: coston2XrpUsdFeedId,
        maxDeliveryDays: 30, minWarrantyDays: 12, maxWarrantyDays: 36,
        priceWeightBps: 6_000, deliveryWeightBps: 2_500, warrantyWeightBps: 1_500,
        requiredCredentials: [],
      },
      approvedVendors: ["0x3000000000000000000000000000000000000003"], extensionId: 65_537n,
      codeVersion: "0x0000000000000000000000000000000000000000000000000000000000003333",
      teeIds: ["0x4000000000000000000000000000000000000004", "0x5000000000000000000000000000000000000005", "0x6000000000000000000000000000000000000006"],
      teeKeyFingerprints: ["0x0000000000000000000000000000000000000000000000000000000000004444", "0x0000000000000000000000000000000000000000000000000000000000005555", "0x0000000000000000000000000000000000000000000000000000000000006666"],
    },
  });
  assert.equal((plan.memoData.length - 2) / 2, 42);
  assert.equal(plan.memoData.slice(0, 22), "0xfe030000000000000019");
  assert.equal(`0x${plan.memoData.slice(22)}`, keccak256(plan.userOperationData));
  const [decoded] = decodeAbiParameters(packedUserOperationParameter, plan.userOperationData);
  assert.equal(decoded.sender, plan.userOperation.sender);
  assert.equal(decoded.nonce, 7n);
  const call = decodeFunctionData({ abi: personalAccountExecuteUserOpAbi, data: decoded.callData });
  assert.equal(call.functionName, "executeUserOp");
  assert.equal(call.args[0].length, 2);
  assert.equal(call.args[0][0].target.toLowerCase(), "0x0b6a3645c240605887a5532109323a3e12273dc7");
  assert.equal(call.args[0][1].target, "0x2000000000000000000000000000000000000002");
  const create = decodeFunctionData({ abi: marketAbiJson as Abi, data: call.args[0][1].data });
  assert.equal(create.functionName, "createTender");
  const [terms] = create.args as readonly [{ scoringPolicy: { ceilingXrpMicros: bigint } }];
  assert.equal(terms.scoringPolicy.ceilingXrpMicros, 1_000_000n);
});

test("matches the Solidity and Go canonical public scoring-policy hash", () => {
  assert.equal(calculateFlareRulesHash({
    schemaVersion: 1,
    ceilingXrpMicros: 1_000n,
    bidDeadline: 1_700_000_000n,
    allowXrp: true,
    allowUsd: true,
    ftsoFeedId: coston2XrpUsdFeedId,
    maxDeliveryDays: 30,
    minWarrantyDays: 12,
    maxWarrantyDays: 36,
    priceWeightBps: 6_000,
    deliveryWeightBps: 2_500,
    warrantyWeightBps: 1_500,
    requiredCredentials: [],
  }), "0x8969aa4d8ee1fde2fbf813214484c245419fd278b1b791fe05997813315f8cb2");
});

test("rejects invalid scoring weights and non-canonical Coston2 feed ids", () => {
  const policy = {
    schemaVersion: 1,
    ceilingXrpMicros: 1_000n,
    bidDeadline: 1_700_000_000n,
    allowXrp: true,
    allowUsd: true,
    ftsoFeedId: coston2XrpUsdFeedId,
    maxDeliveryDays: 30,
    minWarrantyDays: 12,
    maxWarrantyDays: 36,
    priceWeightBps: 6_000,
    deliveryWeightBps: 2_500,
    warrantyWeightBps: 1_500,
    requiredCredentials: [],
  } as const;
  assert.throws(
    () => calculateFlareRulesHash({ ...policy, deliveryWeightBps: 2_499 }),
    /INVALID_FLARE_SCORING_POLICY/,
  );
  assert.throws(
    () => calculateFlareRulesHash({ ...policy, ftsoFeedId: `0x${"99".repeat(21)}` }),
    /INVALID_FLARE_SCORING_POLICY/,
  );
});

test("builds the exact 42-byte ignore-memo recovery envelope", () => {
  const target = "0x0000000000000000000000000000000000000000000000000000000000007777";
  const memo = buildIgnoreMemo(1, 0n, target);
  assert.equal((memo.length - 2) / 2, 42);
  assert.equal(memo.slice(0, 22), "0xe0010000000000000000");
  assert.equal(`0x${memo.slice(22)}`, target);
});
