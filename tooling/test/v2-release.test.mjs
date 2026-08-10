import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  evaluateV2PromotionBundle,
  inspectV2LocalReadiness,
  readV2ReleasePlan,
  validateV2ReleasePlan,
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
      assertions: { fccWinnerSelected: true, escrowConserved: true },
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
  assert.equal(evaluateV2PromotionBundle(bundle).status, "READY");

  bundle.refund.assertions.fullEscrowReturned = false;
  assert.equal(evaluateV2PromotionBundle(bundle).status, "BLOCKED");
});

test("rejects reuse of a verified V1 machine identity", () => {
  const bundle = passingBundle();
  bundle.machines.publicIdentifiers.machines[0].teeId = bundle.v1Release.fcc.teeIds[0];
  const result = evaluateV2PromotionBundle(bundle);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.assertions.threeFreshMachines, false);
});
