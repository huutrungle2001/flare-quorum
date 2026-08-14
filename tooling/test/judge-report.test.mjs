import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateJudgeReport } from "../flare/judge-report.mjs";

const schema = JSON.parse(readFileSync(
  new URL("../flare/judge-verification.schema.json", import.meta.url),
  "utf8",
));
const passing = {
  schemaVersion: 1,
  suite: "flarequorum-judge-verification",
  status: "PASSED",
  recordedAt: "2026-08-14T00:00:00.000Z",
  offline: null,
  live: {
    schemaVersion: 1,
    suite: "flarequorum-judge-live-read-only",
    status: "PASSED",
    recordedAt: "2026-08-14T00:00:00.000Z",
    publicIdentifiers: { chainId: 114 },
    assertions: { threeReleaseMachinesChecked: true },
    machineAvailability: [{}, {}, {}],
    endpointStatus: {},
    deployment: {},
    runtimeHash: `0x${"1".repeat(64)}`,
    blockers: [],
    notes: [],
  },
  blockers: [],
};

test("judge report schema fixes the public top-level contract", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "schemaVersion", "suite", "status", "recordedAt", "offline", "live", "blockers",
  ]);
});

test("judge report validator accepts a complete sanitized live report", () => {
  assert.deepEqual(validateJudgeReport(passing), { valid: true, violations: [] });
});

test("judge report validator rejects inconsistent or confidential output", () => {
  const unsafe = structuredClone(passing);
  unsafe.live.machineAvailability.pop();
  unsafe.live.endpointStatus.body = { ciphertext: "forbidden" };
  const validation = validateJudgeReport(unsafe);
  assert.equal(validation.valid, false);
  assert.ok(validation.violations.some((entry) => entry.includes("incomplete machine set")));
  assert.ok(validation.violations.some((entry) => entry.includes("forbidden report field")));
});
