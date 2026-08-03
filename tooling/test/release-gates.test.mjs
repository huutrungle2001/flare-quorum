import assert from "node:assert/strict";
import test from "node:test";
import { assertPassedGateEvidence } from "../flare/release-gates.mjs";

const passed = { status: "PASS", assertions: { live: true, bound: true }, blockers: [] };

test("requires every live pre-deployment assertion and an empty blocker list", () => {
  assert.equal(assertPassedGateEvidence({ gateA: passed, gateE: passed }), true);
  assert.throws(
    () => assertPassedGateEvidence({ gateA: { ...passed, status: "IN_PROGRESS" } }),
    /GATE_NOT_PASSED/,
  );
  assert.throws(
    () => assertPassedGateEvidence({ gateA: { ...passed, assertions: { live: true, bound: false } } }),
    /GATE_ASSERTIONS_INCOMPLETE/,
  );
  assert.throws(
    () => assertPassedGateEvidence({ gateA: { ...passed, blockers: ["NO_TEE"] } }),
    /GATE_HAS_BLOCKERS/,
  );
});
