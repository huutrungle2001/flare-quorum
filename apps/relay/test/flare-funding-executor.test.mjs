import assert from "node:assert/strict";
import test from "node:test";
import {
  assetManagerFAssetsAbi,
  buildMintAndFundPlan,
  calculateFlareRulesHash,
  memoInstructionsEventsAbi,
  testXrpSourceId,
  xrpPaymentAttestationType,
  xrpPaymentResponseParameter,
} from "@veilbid/flare-bindings";
import {
  encodeAbiParameters,
  encodeEventTopics,
} from "viem";
import { FlareFundingExecutor } from "../dist/flare-funding-executor.js";

const market = "0x1000000000000000000000000000000000000001";
const personalAccount = "0x2000000000000000000000000000000000000002";
const executorAddress = "0x3000000000000000000000000000000000000003";
const assetManager = "0x4000000000000000000000000000000000000004";
const controller = "0x5000000000000000000000000000000000000005";
const fTestXrp = "0x0b6A3645c240605887a5532109323A3E12273dc7";
const transactionId = `0x${"11".repeat(32)}`;

const job = {
  version: 1,
  xrplTransactionId: transactionId,
  personalAccount,
  nonce: 7n,
  walletId: 0,
  executorFeeUBA: 0n,
  terms: {
    metadataHash: `0x${"22".repeat(32)}`,
    scoringPolicy: {
      schemaVersion: 1,
      ceilingXrpMicros: 1_000_000n,
      bidDeadline: 2_000_000_000n,
      allowXrp: true,
      allowUsd: true,
      ftsoFeedId: "0x015852502f55534400000000000000000000000000",
      maxDeliveryDays: 30,
      minWarrantyDays: 12,
      maxWarrantyDays: 36,
      priceWeightBps: 6_000,
      deliveryWeightBps: 2_500,
      warrantyWeightBps: 1_500,
      requiredCredentials: [],
    },
    approvedVendors: ["0x6000000000000000000000000000000000000006"],
    extensionId: 65_922n,
    codeVersion: `0x${"44".repeat(32)}`,
    teeIds: [
      "0x7000000000000000000000000000000000000007",
      "0x8000000000000000000000000000000000000008",
      "0x9000000000000000000000000000000000000009",
    ],
    teeKeyFingerprints: [
      `0x${"55".repeat(32)}`,
      `0x${"66".repeat(32)}`,
      `0x${"77".repeat(32)}`,
    ],
  },
};
const rulesHash = calculateFlareRulesHash(job.terms.scoringPolicy);

const config = {
  mode: "execute",
  rpcUrl: "https://coston2.example.invalid/rpc",
  xrplRpcUrl: "https://xrpl.example.invalid",
  verifierBaseUrl: "https://verifier.example.invalid",
  verifierApiKey: "local-only",
  daLayerBaseUrl: "https://da.example.invalid",
  daLayerApiKey: null,
  contractRegistry: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
  marketAddress: market,
  marketDeploymentBlock: 10n,
  marketDeploymentStatus: "verified",
  expectedFTestXrp: fTestXrp,
  executorPrivateKey: `0x${"88".repeat(32)}`,
  xrplConfirmations: 3,
  pollIntervalMs: 1,
  pollAttempts: 1,
};

const network = {
  chainId: 114,
  blockNumber: 1_000n,
  finalizedBlock: 988n,
  contracts: {
    fdcHub: "0xA00000000000000000000000000000000000000A",
    fdcRequestFeeConfigurations: "0xB00000000000000000000000000000000000000B",
    fdcVerification: "0xC00000000000000000000000000000000000000C",
    flareSystemsManager: "0xD00000000000000000000000000000000000000D",
    relay: "0xE00000000000000000000000000000000000000E",
    assetManager,
    masterAccountController: controller,
  },
  fTestXrp,
  directMintingPaymentAddress: "rCoreVault",
  directMintingFeeBips: 25n,
  directMintingMinimumFeeUBA: 100_000n,
  marketRuntimeCodeHash: `0x${"99".repeat(32)}`,
};

function log(topics, data, address, index) {
  return {
    address,
    blockHash: `0x${"aa".repeat(32)}`,
    blockNumber: 200n,
    data,
    logIndex: index,
    removed: false,
    topics,
    transactionHash: `0x${"bb".repeat(32)}`,
    transactionIndex: 0,
  };
}

function successLogs(memoData) {
  const minted = log(
    encodeEventTopics({
      abi: assetManagerFAssetsAbi,
      eventName: "DirectMintingExecutedToSmartAccount",
    }),
    encodeAbiParameters(
      [
        { type: "bytes32" }, { type: "string" }, { type: "address" },
        { type: "uint256" }, { type: "uint256" }, { type: "bytes" },
      ],
      [transactionId, "rSource", executorAddress, 1_000_000n, 100_000n, memoData],
    ),
    assetManager,
    0,
  );
  const executed = log(
    encodeEventTopics({
      abi: memoInstructionsEventsAbi,
      eventName: "UserOperationExecuted",
      args: { personalAccount },
    }),
    encodeAbiParameters([{ type: "uint256" }], [7n]),
    controller,
    1,
  );
  const tenderAbi = [{
    type: "event",
    name: "TenderCreated",
    anonymous: false,
    inputs: [
      { name: "tenderId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "rulesHash", type: "bytes32", indexed: true },
      { name: "ceiling", type: "uint256", indexed: false },
    ],
  }];
  const tender = log(
    encodeEventTopics({
      abi: tenderAbi,
      eventName: "TenderCreated",
      args: { tenderId: 9n, buyer: personalAccount, rulesHash },
    }),
    encodeAbiParameters([{ type: "uint256" }], [1_000_000n]),
    market,
    2,
  );
  return [minted, executed, tender];
}

function delayedLogs(executionAllowedAt) {
  return [log(
    encodeEventTopics({
      abi: assetManagerFAssetsAbi,
      eventName: "DirectMintingDelayed",
    }),
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }],
      [transactionId, 1_000_000n, executionAllowedAt],
    ),
    assetManager,
    0,
  )];
}

test("executes one real-shape XRPL → FDC → FAssets → Smart Account funding lifecycle", async () => {
  const plan = buildMintAndFundPlan({
    personalAccount,
    nonce: 7n,
    fTestXrp,
    market,
    terms: job.terms,
    walletId: 0,
    executorFee: 0n,
  });
  const response = {
    attestationType: xrpPaymentAttestationType,
    sourceId: testXrpSourceId,
    votingRound: 1n,
    lowestUsedTimestamp: 1_000n,
    requestBody: { transactionId, proofOwner: executorAddress },
    responseBody: {
      blockNumber: 100n,
      blockTimestamp: 1_100n,
      sourceAddress: "rSource",
      sourceAddressHash: `0x${"cc".repeat(32)}`,
      receivingAddressHash: `0x${"dd".repeat(32)}`,
      intendedReceivingAddressHash: `0x${"00".repeat(32)}`,
      spentAmount: 1_100_000n,
      intendedSpentAmount: 1_100_000n,
      receivedAmount: 1_100_000n,
      intendedReceivedAmount: 1_100_000n,
      hasMemoData: true,
      firstMemoData: plan.memoData,
      hasDestinationTag: false,
      destinationTag: 0n,
      status: 0,
    },
  };
  const responseHex = encodeAbiParameters([xrpPaymentResponseParameter], [response]);
  const calls = [];
  const fetchImplementation = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.method ?? new URL(String(_url)).pathname);
    if (body.method === "tx") {
      return Response.json({ result: { validated: true, ledger_index: 100 } });
    }
    if (body.method === "ledger") {
      return Response.json({ result: { ledger_index: 102 } });
    }
    if (String(_url).includes("prepareRequest")) {
      return Response.json({ status: "VALID", abiEncodedRequest: "0x1234" });
    }
    return Response.json({
      response_hex: responseHex,
      proof: [`0x${"ee".repeat(32)}`],
    });
  };
  const chainCalls = [];
  const chain = {
    executorAddress,
    inspectNetwork: async () => network,
    getSmartAccountNonce: async () => 7n,
    getPersonalAccount: async (_controller, xrplOwner) => {
      assert.equal(xrplOwner, "rSource");
      return personalAccount;
    },
    getRequestFee: async () => 10n,
    submitAttestationRequest: async (_hub, request, fee) => {
      chainCalls.push(["request", request, fee]);
      return {
        transactionHash: `0x${"f1".repeat(32)}`,
        blockNumber: 50n,
        status: "success",
        logs: [],
      };
    },
    getBlockTimestamp: async () => 1_120n,
    getFdcTiming: async () => ({
      firstVotingRoundStartTimestamp: 1_000n,
      votingEpochDurationSeconds: 90n,
    }),
    getFdcProtocolId: async () => 200n,
    isFdcFinalized: async (_relay, protocol, round) => {
      assert.equal(protocol, 200n);
      assert.equal(round, 1n);
      return true;
    },
    executeDirectMinting: async (_assetManager, _proof, data, value) => {
      chainCalls.push(["mint", data, value]);
      return {
        transactionHash: `0x${"f2".repeat(32)}`,
        blockNumber: 200n,
        status: "success",
        logs: successLogs(plan.memoData),
      };
    },
  };
  const result = await new FlareFundingExecutor(config, chain, {
    fetchImplementation,
    sleep: async () => {},
  }).execute(job);
  assert.equal(result.outcome, "executed");
  assert.equal(result.tenderId, 9n);
  assert.equal(result.fdcVotingRound, 1n);
  assert.equal(result.userOperationCommitment, plan.userOperationCommitment);
  assert.deepEqual(calls, [
    "tx",
    "ledger",
    "/verifier/xrp/XRPPayment/prepareRequest",
    "/api/v1/fdc/proof-by-request-round-raw",
  ]);
  assert.deepEqual(chainCalls, [
    ["request", "0x1234", 10n],
    ["mint", plan.userOperationData, 0n],
  ]);
});

test("emits a public checkpoint and resumes without a second FDC request or nonce", async () => {
  const plan = buildMintAndFundPlan({
    personalAccount,
    nonce: 7n,
    fTestXrp,
    market,
    terms: job.terms,
    walletId: 0,
    executorFee: 0n,
  });
  const response = {
    attestationType: xrpPaymentAttestationType,
    sourceId: testXrpSourceId,
    votingRound: 1n,
    lowestUsedTimestamp: 1_000n,
    requestBody: { transactionId, proofOwner: executorAddress },
    responseBody: {
      blockNumber: 100n,
      blockTimestamp: 1_100n,
      sourceAddress: "rSource",
      sourceAddressHash: `0x${"cc".repeat(32)}`,
      receivingAddressHash: `0x${"dd".repeat(32)}`,
      intendedReceivingAddressHash: `0x${"00".repeat(32)}`,
      spentAmount: 1_100_000n,
      intendedSpentAmount: 1_100_000n,
      receivedAmount: 1_100_000n,
      intendedReceivedAmount: 1_100_000n,
      hasMemoData: true,
      firstMemoData: plan.memoData,
      hasDestinationTag: false,
      destinationTag: 0n,
      status: 0,
    },
  };
  const responseHex = encodeAbiParameters([xrpPaymentResponseParameter], [response]);
  const calls = [];
  const fetchImplementation = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.method ?? new URL(String(_url)).pathname);
    if (body.method === "tx") return Response.json({ result: { validated: true, ledger_index: 100 } });
    if (body.method === "ledger") return Response.json({ result: { ledger_index: 102 } });
    if (String(_url).includes("prepareRequest")) {
      return Response.json({ status: "VALID", abiEncodedRequest: "0x1234" });
    }
    return Response.json({ response_hex: responseHex, proof: [`0x${"ee".repeat(32)}`] });
  };
  let currentTimestamp = 1_120n;
  let mintAttempt = 0;
  const chainCalls = [];
  const chain = {
    executorAddress,
    inspectNetwork: async () => network,
    getSmartAccountNonce: async () => 7n,
    getPersonalAccount: async (_controller, xrplOwner) => {
      assert.equal(xrplOwner, "rSource");
      return personalAccount;
    },
    getRequestFee: async () => 10n,
    submitAttestationRequest: async (_hub, request, fee) => {
      chainCalls.push(["request", request, fee]);
      return {
        transactionHash: `0x${"f1".repeat(32)}`,
        blockNumber: 50n,
        status: "success",
        logs: [],
      };
    },
    getBlockTimestamp: async () => currentTimestamp,
    getFdcTiming: async () => ({
      firstVotingRoundStartTimestamp: 1_000n,
      votingEpochDurationSeconds: 90n,
    }),
    getFdcProtocolId: async () => 200n,
    isFdcFinalized: async () => true,
    executeDirectMinting: async (_assetManager, _proof, data, value) => {
      mintAttempt += 1;
      chainCalls.push(["mint", data, value]);
      return {
        transactionHash: `0x${(mintAttempt === 1 ? "f2" : "f3").repeat(32)}`,
        blockNumber: mintAttempt === 1 ? 200n : 201n,
        status: "success",
        logs: mintAttempt === 1 ? delayedLogs(2_000n) : successLogs(plan.memoData),
      };
    },
  };
  const executor = new FlareFundingExecutor(config, chain, {
    fetchImplementation,
    sleep: async () => {},
  });
  const delayed = await executor.execute(job);
  assert.equal(delayed.outcome, "delayed");
  assert.equal(delayed.checkpoint.fdcVotingRound, 1n);
  assert.equal(delayed.checkpoint.paymentAmountUBA, 1_100_000n);
  currentTimestamp = 2_001n;
  const resumed = await executor.resume(delayed.checkpoint);
  assert.equal(resumed.outcome, "executed");
  assert.equal(resumed.tenderId, 9n);
  assert.deepEqual(chainCalls.map(([kind]) => kind), ["request", "mint", "mint"]);
  assert.deepEqual(calls, [
    "tx", "ledger", "/verifier/xrp/XRPPayment/prepareRequest",
    "/api/v1/fdc/proof-by-request-round-raw", "tx", "ledger",
    "/api/v1/fdc/proof-by-request-round-raw",
  ]);
});
