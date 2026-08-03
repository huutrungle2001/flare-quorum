import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from "viem";
import {
  assetManagerFAssetsAbi,
  inspectDirectMintingReceipt,
  memoInstructionsEventsAbi,
  quoteSmartAccountDirectMinting,
} from "../dist/fassets.js";

const transactionId = `0x${"11".repeat(32)}` as const;
const executor = "0x1000000000000000000000000000000000000001" as const;
const personalAccount = "0x2000000000000000000000000000000000000002" as const;
const memoData = `0xfe00${"00".repeat(8)}${"33".repeat(32)}` as const;

function log(topics: readonly Hex[], data: Hex, address: Address): Log {
  return {
    address,
    blockHash: `0x${"44".repeat(32)}`,
    blockNumber: 100n,
    data,
    logIndex: 0,
    removed: false,
    topics: [...topics],
    transactionHash: `0x${"55".repeat(32)}`,
    transactionIndex: 0,
  };
}

test("quotes enough gross XRP for the requested minted amount after fees", () => {
  const minimum = quoteSmartAccountDirectMinting(1_000_000n, 25n, 100_000n);
  assert.deepEqual(minimum, {
    requiredMintedAmountUBA: 1_000_000n,
    paymentAmountUBA: 1_100_000n,
    mintingFeeUBA: 100_000n,
  });
  const percentage = quoteSmartAccountDirectMinting(100_000_000n, 25n, 100_000n);
  assert.ok(percentage.paymentAmountUBA - percentage.mintingFeeUBA >= 100_000_000n);
  assert.ok(
    percentage.paymentAmountUBA - 1n -
      (((percentage.paymentAmountUBA - 1n) * 25n) / 10_000n) <
      100_000_000n,
  );
});

test("requires both exact mint and user-operation events before reporting success", () => {
  const assetManager = "0x3000000000000000000000000000000000000003" as const;
  const controller = "0x4000000000000000000000000000000000000004" as const;
  const mintedTopics = encodeEventTopics({
    abi: assetManagerFAssetsAbi,
    eventName: "DirectMintingExecutedToSmartAccount",
  });
  const mintedData = encodeAbiParameters(
    [
      { type: "bytes32" }, { type: "string" }, { type: "address" },
      { type: "uint256" }, { type: "uint256" }, { type: "bytes" },
    ],
    [transactionId, "rSource", executor, 1_000_000n, 100_000n, memoData],
  );
  const executedTopics = encodeEventTopics({
    abi: memoInstructionsEventsAbi,
    eventName: "UserOperationExecuted",
    args: { personalAccount },
  });
  const executedData = encodeAbiParameters([{ type: "uint256" }], [7n]);
  const logs = [
    log(mintedTopics, mintedData, assetManager),
    log(executedTopics, executedData, controller),
  ];
  assert.deepEqual(inspectDirectMintingReceipt({
    logs,
    assetManager,
    masterAccountController: controller,
    transactionId,
    executor,
    memoData,
    personalAccount,
    nonce: 7n,
  }), {
    status: "executed",
    transactionId,
    executor,
    mintedAmountUBA: 1_000_000n,
    mintingFeeUBA: 100_000n,
    memoData,
    personalAccount,
    nonce: 7n,
  });
  assert.throws(() => inspectDirectMintingReceipt({
    logs: logs.slice(0, 1),
    assetManager,
    masterAccountController: controller,
    transactionId,
    executor,
    memoData,
    personalAccount,
    nonce: 7n,
  }), /DIRECT_MINTING_EXECUTION_NOT_PROVEN/);
});

test("reports a rate-limited mint as delayed, never executed", () => {
  const topics = encodeEventTopics({
    abi: assetManagerFAssetsAbi,
    eventName: "DirectMintingDelayed",
  });
  const data = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }],
    [transactionId, 1_100_000n, 2_000n],
  );
  assert.deepEqual(inspectDirectMintingReceipt({
    logs: [log(topics, data, "0x3000000000000000000000000000000000000003")],
    assetManager: "0x3000000000000000000000000000000000000003",
    masterAccountController: "0x4000000000000000000000000000000000000004",
    transactionId,
    executor,
    memoData,
    personalAccount,
    nonce: 7n,
  }), {
    status: "delayed",
    transactionId,
    amountUBA: 1_100_000n,
    executionAllowedAt: 2_000n,
  });
});
