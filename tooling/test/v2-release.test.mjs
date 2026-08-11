import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  evaluateV2PromotionBundle,
  inspectV2LocalReadiness,
  readV2ReleasePlan,
  validateV2ReleasePlan,
  v2ProgressBlockers,
} from "../flare/v2-release.mjs";

const root = resolve(import.meta.dirname, "../..");
const address = (byte) => `0x${byte.repeat(40)}`;
const hash = (byte) => `0x${byte.repeat(64)}`;

test("keeps the V2 release plan in a separate, complete namespace", () => {
  const plan = readV2ReleasePlan(root);
  assert.equal(validateV2ReleasePlan(plan), true);
  assert.ok(Object.values(plan.artifacts).every((path) => path.includes("v2") || path.includes("V2")));
  assert.equal(plan.runtimeEnvironment.extensionId, "FCC_V2_EXTENSION_ID");
  assert.equal(plan.promotionRequirements.consumerSwitchRequiresPromotion, true);
});

test("passes local V2 source, artifact, refund, and V1 preservation checks", () => {
  const result = inspectV2LocalReadiness(root);
  assert.equal(result.status, "PASSED");
  assert.ok(result.publicFacts.runtimeSizeBytes <= 24_576);
  assert.equal(result.assertions.boundedUndispatchedRefundPresent, true);
  assert.equal(result.assertions.verifiedV1ReleasePreserved, true);
});

function passingBundle() {
  const market = address("1");
  const machineIds = [address("2"), address("3"), address("4")];
  return {
    candidate: {
      kind: "flarequorum-v2-candidate",
      verified: false,
      contracts: {
        FlareQuorumMarketV2: { address: market, runtimeHash: hash("a") },
        FlareQuorumAwardReceiptV2: { address: address("5") },
      },
    },
    extension: {
      publicIdentifiers: { extensionId: "70001", sender: market },
    },
    candidateDeployment: {
      status: "IN_PROGRESS",
      assertions: { runtimeLogicMatchesArtifact: true },
    },
    governance: {
      status: "PASSED",
      assertions: { latestHashMatches: true },
    },
    machines: {
      status: "PASSED",
      publicIdentifiers: { machines: machineIds.map((teeId) => ({ teeId })) },
      assertions: { exactActiveMachineSet: true },
      blockers: [],
    },
    success: {
      status: "PASSED",
      publicIdentifiers: {
        vendors: [address("9"), address("a"), address("b")],
        plaintextCommitments: [hash("1"), hash("2"), hash("3")],
        bidTransactions: [hash("4"), hash("5"), hash("6")],
      },
      ingressBenchmarks: { vendorCount: 3 },
      assertions: {
        fccWinnerSelected: true,
        escrowConserved: true,
        threeEncryptedBidsAcceptedByDistinctTees: true,
      },
      blockers: [],
    },
    recovery: {
      gate: "FLARE_V2_SUCCESS_RECOVERY",
      status: "PASSED",
      publicIdentifiers: {
        teeIds: machineIds,
        selectionResultCollectionOutageMachineIndex: 3,
        selectionSignerIds: machineIds.slice(0, 2),
      },
      ingressBenchmarks: { vendorCount: 3 },
      assertions: { oneSelectionResultUnavailableStillFinalized: true },
      blockers: [],
    },
    refund: {
      status: "PASSED",
      assertions: {
        selectionNeverDispatched: true,
        fullEscrowReturned: true,
        noAwardMinted: true,
        refundReasonUndispatchedTimeout: true,
      },
      blockers: [],
    },
    v1Release: {
      fcc: { extensionId: "66011", teeIds: [address("6"), address("7"), address("8")] },
    },
  };
}

test("promotes only a fresh V2 extension with three fresh machines and both lifecycles", () => {
  const bundle = passingBundle();
  const ready = evaluateV2PromotionBundle(bundle);
  assert.equal(ready.status, "READY");
  assert.deepEqual(v2ProgressBlockers(ready.assertions), []);

  bundle.refund.assertions.fullEscrowReturned = false;
  const blocked = evaluateV2PromotionBundle(bundle);
  assert.equal(blocked.status, "BLOCKED");
  assert.deepEqual(v2ProgressBlockers(blocked.assertions), [
    "V2_REFUND_LIFECYCLE_NOT_VERIFIED",
  ]);
});

test("rejects reuse of a verified V1 machine identity", () => {
  const bundle = passingBundle();
  bundle.machines.publicIdentifiers.machines[0].teeId = bundle.v1Release.fcc.teeIds[0];
  const result = evaluateV2PromotionBundle(bundle);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.assertions.threeFreshMachines, false);
});

test("rejects a V2 success lifecycle that does not compare three vendors", () => {
  const bundle = passingBundle();
  bundle.success.ingressBenchmarks.vendorCount = 1;
  bundle.success.publicIdentifiers.vendors = [bundle.success.publicIdentifiers.vendors[0]];
  bundle.success.publicIdentifiers.plaintextCommitments = [bundle.success.publicIdentifiers.plaintextCommitments[0]];
  bundle.success.publicIdentifiers.bidTransactions = [bundle.success.publicIdentifiers.bidTransactions[0]];
  const result = evaluateV2PromotionBundle(bundle);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.assertions.successLifecyclePassed, true);
  assert.equal(result.assertions.threeVendorComparisonRecorded, false);
  assert.deepEqual(v2ProgressBlockers(result.assertions), [
    "V2_SUCCESS_LIFECYCLE_NOT_VERIFIED",
  ]);
});

test("rejects outage evidence that counts the unavailable result endpoint", () => {
  const bundle = passingBundle();
  bundle.recovery.publicIdentifiers.selectionSignerIds = [
    bundle.recovery.publicIdentifiers.teeIds[0],
    bundle.recovery.publicIdentifiers.teeIds[2],
  ];
  const result = evaluateV2PromotionBundle(bundle);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.assertions.oneResultOutageRecoveryPassed, false);
  assert.deepEqual(v2ProgressBlockers(result.assertions), [
    "V2_ONE_RESULT_OUTAGE_RECOVERY_NOT_VERIFIED",
  ]);
});
