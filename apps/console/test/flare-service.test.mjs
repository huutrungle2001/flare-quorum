import assert from "node:assert/strict";
import test from "node:test";
import {
  FlarePublicOperatorService,
  resolveFlareOperatorConfig,
} from "../dist/index.js";

const market = "0x1000000000000000000000000000000000000001";
const buyer = "0x2000000000000000000000000000000000000002";
const manager = "0x3000000000000000000000000000000000000003";
const ftso = "0x4000000000000000000000000000000000000004";
const receipt = "0x5000000000000000000000000000000000000005";
const token = "0x6000000000000000000000000000000000000006";
const hash = `0x${"11".repeat(32)}`;

const tender = {
  tenderId: 1n,
  buyer,
  metadataHash: hash,
  rulesHash: hash,
  publicCeilingXrp: 1_000_000n,
  bidDeadline: 100n,
  closeBlock: 90n,
  bidCount: 2n,
  approvedVendorCount: 2,
  commonQuorumBitmap: 7,
  orderedBidRoot: hash,
  extensionId: 65_921n,
  codeVersion: hash,
  ftsoFeedId: `0x${"12".repeat(21)}`,
  ftsoValue: 250_000n,
  ftsoDecimals: 5,
  ftsoTimestamp: 95n,
  selectionStartedAt: 96n,
  selectionAttempt: 1,
  resultNonce: 2n,
  resultExpiry: 200n,
  requestId: hash,
  status: "ComputePending",
  teeIds: [manager, ftso, receipt],
  teeKeyFingerprints: [hash, hash, hash],
  winnerBidId: null,
  winner: null,
  winningAmountXrp: null,
  awardTransactionHash: null,
};

function source() {
  return {
    async snapshot() {
      return {
        chainId: 114,
        tenders: [tender],
        indexedBlock: 100n,
        finalizedBlock: 100n,
        latestBlock: 112n,
        deploymentStatus: "planned",
      };
    },
    async protocolBinding() {
      return {
        chainId: 114,
        marketAddress: market,
        deploymentStatus: "planned",
        deploymentBlock: 80n,
        finalizedBlock: 100n,
        runtimeCodeHash: hash,
        runtimeCodeSize: 18_536,
        paymentToken: token,
        teeManager: manager,
        ftso,
        teeExtensionRegistry: manager,
        awardReceipt: receipt,
        tenderCount: 1n,
        teeCount: 3n,
        resultThreshold: 2,
      };
    },
  };
}

test("Flare service returns finalized public FCC and FTSO facts only", async () => {
  const service = new FlarePublicOperatorService(source());
  const listed = await service.listTenders({ status: "ComputePending" });
  assert.equal(listed.chainId, 114);
  assert.equal(listed.indexedBlock, "100");
  assert.equal(listed.tenders[0].extensionId, "65921");
  const selection = await service.inspectSelection("1");
  assert.equal(selection.commonQuorumBitmap, 7);
  assert.equal(selection.selectionAttempt, 1);
  const serialized = JSON.stringify(selection);
  assert.doesNotMatch(serialized, /signature|ciphertext|resultData|private/i);
});

test("Flare service exposes immutable protocol bindings as JSON-safe public data", async () => {
  const service = new FlarePublicOperatorService(source());
  const binding = await service.inspectProtocolBinding();
  assert.equal(binding.marketAddress, market);
  assert.equal(binding.teeManager, manager);
  assert.equal(binding.teeCount, "3");
  assert.doesNotThrow(() => JSON.stringify(binding));
});

test("Flare service rejects malformed or absent tenders", async () => {
  const service = new FlarePublicOperatorService(source());
  await assert.rejects(() => service.getTender("0"), { code: "invalid-tender-id" });
  await assert.rejects(() => service.getTender("2"), { code: "tender-not-found" });
});

test("Flare operator config is explicit and has no Sepolia or implicit RPC fallback", () => {
  assert.throws(() => resolveFlareOperatorConfig({}), /missing-flare-operator-config/);
  const config = resolveFlareOperatorConfig({
    COSTON2_RPC_URL: "https://coston2.example.invalid/rpc",
    FLARE_MARKET_ADDRESS: market,
    FLARE_MARKET_DEPLOYMENT_BLOCK: "80",
    FLARE_DEPLOYMENT_STATUS: "planned",
  });
  assert.equal(config.rpcUrl, "https://coston2.example.invalid/rpc");
  assert.equal(config.marketAddress, market);
  assert.equal(config.deploymentBlock, 80n);
});
