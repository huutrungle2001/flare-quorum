import assert from "node:assert/strict";
import test from "node:test";
import { decodeAbiParameters, decodeFunctionData, keccak256 } from "viem";
import { buildIgnoreMemo, buildMintAndFundPlan, personalAccountExecuteUserOpAbi } from "../src/smart-account.ts";

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
      rulesHash: "0x0000000000000000000000000000000000000000000000000000000000002222",
      publicCeilingXrp: 1_000_000n, bidDeadline: 2_000n,
      approvedVendors: ["0x3000000000000000000000000000000000000003"], extensionId: 65_537n,
      codeVersion: "0x0000000000000000000000000000000000000000000000000000000000003333",
      teeIds: ["0x4000000000000000000000000000000000000004", "0x5000000000000000000000000000000000000005", "0x6000000000000000000000000000000000000006"],
      teeKeyFingerprints: ["0x0000000000000000000000000000000000000000000000000000000000004444", "0x0000000000000000000000000000000000000000000000000000000000005555", "0x0000000000000000000000000000000000000000000000000000000000006666"],
      ftsoFeedId: "0x015852502f55534400000000000000000000000000",
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
});

test("builds the exact 42-byte ignore-memo recovery envelope", () => {
  const target = "0x0000000000000000000000000000000000000000000000000000000000007777";
  const memo = buildIgnoreMemo(1, 0n, target);
  assert.equal((memo.length - 2) / 2, 42);
  assert.equal(memo.slice(0, 22), "0xe0010000000000000000");
  assert.equal(`0x${memo.slice(22)}`, target);
});
