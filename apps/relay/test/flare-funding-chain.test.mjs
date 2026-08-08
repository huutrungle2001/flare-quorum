import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import { LiveFlareFundingChain } from "../dist/flare-funding-chain.js";

const market = "0x1000000000000000000000000000000000000001";
const registry = "0x2000000000000000000000000000000000000002";
const fTestXrp = "0x3000000000000000000000000000000000000003";
const personalAccount = "0x4000000000000000000000000000000000000004";
const addresses = Object.fromEntries([
  "FdcHub",
  "FdcRequestFeeConfigurations",
  "FdcVerification",
  "FlareSystemsManager",
  "Relay",
  "AssetManagerFXRP",
  "MasterAccountController",
].map((name, index) => [name, getAddress(`0x${(index + 10).toString(16).padStart(40, "0")}`)]));

function config(overrides = {}) {
  return {
    mode: "health",
    rpcUrl: "https://coston2.example.invalid/rpc",
    xrplRpcUrl: "https://xrpl.example.invalid",
    verifierBaseUrl: "https://verifier.example.invalid",
    verifierApiKey: null,
    daLayerBaseUrl: "https://da.example.invalid",
    daLayerApiKey: null,
    contractRegistry: registry,
    marketAddress: market,
    marketDeploymentBlock: 10n,
    marketDeploymentStatus: "verified",
    expectedFTestXrp: fTestXrp,
    executorPrivateKey: null,
    xrplConfirmations: 3,
    pollIntervalMs: 1,
    pollAttempts: 1,
    ...overrides,
  };
}

function clients(overrides = {}) {
  const calls = [];
  const publicClient = {
    async getChainId() { return overrides.chainId ?? 114; },
    async getBlockNumber() { return overrides.blockNumber ?? 100n; },
    async getCode({ address }) {
      if (overrides.missingCode === address) return "0x";
      return "0x6001600055";
    },
    async readContract(args) {
      calls.push(["read", args.functionName, args.args]);
      switch (args.functionName) {
        case "getContractAddressByName": return addresses[args.args[0]];
        case "fdcRequestFeeConfigurations": return overrides.feeConfig ?? addresses.FdcRequestFeeConfigurations;
        case "fAsset": return overrides.fAsset ?? fTestXrp;
        case "directMintingPaymentAddress": return "rDirectMintVault";
        case "getDirectMintingFeeBIPS": return 25n;
        case "getDirectMintingMinimumFeeUBA": return 100_000n;
        case "getDirectMintingExecutorFeeUBA": return 2_000n;
        case "paymentToken": return fTestXrp;
        case "TEE_COUNT": return overrides.teeCount ?? 3n;
        case "RESULT_THRESHOLD": return 2;
        case "getNonce": return 7n;
        case "getPersonalAccount": return personalAccount;
        case "tenderCount": return 9n;
        case "getTender": return overrides.tender ?? {
          buyer: personalAccount,
          rulesHash: `0x${"44".repeat(32)}`,
          publicCeilingXrp: 1_000_000n,
        };
        case "getRequestFee": return 10n;
        case "firstVotingRoundStartTs": return 1_000n;
        case "votingEpochDurationSeconds": return 90n;
        case "fdcProtocolId": return 200n;
        case "isFinalized": return true;
        default: throw new Error(`unexpected read ${args.functionName}`);
      }
    },
    async simulateContract(args) {
      calls.push(["simulate", args.functionName, args.gas]);
      if (overrides.simulationError) throw overrides.simulationError;
      return {};
    },
    async waitForTransactionReceipt({ hash }) {
      calls.push(["receipt", hash]);
      return { transactionHash: hash, blockNumber: 101n, status: "success", logs: [] };
    },
    async getBlock({ blockNumber }) {
      calls.push(["block", blockNumber]);
      return { timestamp: 1_234n };
    },
  };
  const walletClient = {
    async writeContract(args) {
      calls.push(["write", args.functionName, args.gas]);
      if (overrides.writeError) throw overrides.writeError;
      return `0x${"55".repeat(32)}`;
    },
  };
  return { calls, publicClient, walletClient };
}

test("live funding chain verifies the finalized Coston2 protocol graph", async () => {
  const fake = clients();
  const chain = new LiveFlareFundingChain(config(), { publicClient: fake.publicClient });
  const network = await chain.inspectNetwork();
  assert.equal(network.chainId, 114);
  assert.equal(network.finalizedBlock, 88n);
  assert.equal(network.contracts.assetManager, addresses.AssetManagerFXRP);
  assert.equal(network.fTestXrp, fTestXrp);
  assert.equal(network.directMintingPaymentAddress, "rDirectMintVault");
  assert.equal(network.directMintingFeeBips, 25n);
  assert.match(network.marketRuntimeCodeHash, /^0x[0-9a-f]{64}$/);
  const registryReads = fake.calls.filter((call) => call[0] === "read" && call[1] === "getContractAddressByName");
  assert.equal(registryReads.length, 7);
});

test("live funding chain fails closed on chain, finality, code, and protocol drift", async () => {
  for (const [configuration, clientOverrides, code] of [
    [config(), { chainId: 1 }, "WRONG_FLARE_FUNDING_CHAIN"],
    [config({ marketDeploymentBlock: 99n }), {}, "FLARE_MARKET_DEPLOYMENT_NOT_FINALIZED"],
    [config(), { missingCode: market }, "FLARE_FUNDING_CONTRACT_CODE_MISSING"],
    [config(), { teeCount: 2n }, "FLARE_FUNDING_PROTOCOL_BINDING_MISMATCH"],
  ]) {
    const fake = clients(clientOverrides);
    await assert.rejects(
      new LiveFlareFundingChain(configuration, { publicClient: fake.publicClient }).inspectNetwork(),
      new RegExp(code),
    );
  }
});

test("live funding chain reads only public Smart Account, market, FDC, and Relay facts", async () => {
  const fake = clients();
  const chain = new LiveFlareFundingChain(config(), { publicClient: fake.publicClient });
  assert.equal(await chain.getSmartAccountNonce(addresses.MasterAccountController, personalAccount), 7n);
  assert.equal(await chain.getPersonalAccount(addresses.MasterAccountController, "rOwner"), personalAccount);
  assert.equal(await chain.getMarketTenderCount(market), 9n);
  assert.deepEqual(await chain.getMarketTender(market, 9n), {
    buyer: personalAccount,
    rulesHash: `0x${"44".repeat(32)}`,
    publicCeilingXrp: 1_000_000n,
  });
  assert.equal(await chain.getRequestFee(addresses.FdcHub, "0x1234"), 10n);
  assert.equal(await chain.getBlockTimestamp(90n), 1_234n);
  assert.deepEqual(await chain.getFdcTiming(addresses.FlareSystemsManager), {
    firstVotingRoundStartTimestamp: 1_000n,
    votingEpochDurationSeconds: 90n,
  });
  assert.equal(await chain.getFdcProtocolId(addresses.FdcVerification), 200n);
  assert.equal(await chain.isFdcFinalized(addresses.Relay, 200n, 8n), true);
});

test("live funding chain rejects malformed tender state and disabled writes", async () => {
  const malformed = clients({ tender: { buyer: personalAccount, rulesHash: null, publicCeilingXrp: 1n } });
  const readOnly = new LiveFlareFundingChain(config(), { publicClient: malformed.publicClient });
  await assert.rejects(readOnly.getMarketTender(market, 1n), /FLARE_MARKET_TENDER_STATE_INVALID/);
  await assert.rejects(readOnly.submitAttestationRequest(addresses.FdcHub, "0x1234", 10n), /FLARE_FUNDING_WRITE_DISABLED/);
  await assert.rejects(readOnly.executeDirectMinting(addresses.AssetManagerFXRP, {}, "0x1234", 0n), /FLARE_FUNDING_WRITE_DISABLED/);
});

test("live funding chain submits bounded writes and sanitizes direct-mint failures", async () => {
  const fake = clients();
  const chain = new LiveFlareFundingChain(config({
    mode: "execute",
    executorPrivateKey: `0x${"88".repeat(32)}`,
  }), { publicClient: fake.publicClient, walletClient: fake.walletClient });
  const attestation = await chain.submitAttestationRequest(addresses.FdcHub, "0x1234", 10n);
  assert.equal(attestation.status, "success");
  const mint = await chain.executeDirectMinting(addresses.AssetManagerFXRP, {}, "0x1234", 0n);
  assert.equal(mint.transactionHash, `0x${"55".repeat(32)}`);
  const mintCalls = fake.calls.filter((call) => call[1] === "executeDirectMintingWithData");
  assert.deepEqual(mintCalls.map((call) => call[2]), [3_000_000n, 3_000_000n]);

  const failed = clients({ simulationError: new Error("execution reverted: InvalidTender private-upstream-detail") });
  const failingChain = new LiveFlareFundingChain(config({
    mode: "execute",
    executorPrivateKey: `0x${"88".repeat(32)}`,
  }), { publicClient: failed.publicClient, walletClient: failed.walletClient });
  await assert.rejects(
    failingChain.executeDirectMinting(addresses.AssetManagerFXRP, {}, "0x1234", 0n),
    (error) => error instanceof Error && error.message === "DIRECT_MINT_INVALIDTENDER" && !error.message.includes("private"),
  );
});
