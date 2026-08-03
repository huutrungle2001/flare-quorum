import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const preDeploymentGateFiles = [
  "evidence/coston2/gate-0-foundations.json",
  "evidence/coston2/gate-a-fcc-result.json",
  "evidence/coston2/gate-b-private-ingress.json",
  "evidence/coston2/gate-c-tee-quorum.json",
  "evidence/coston2/gate-d-private-scoring.json",
  "evidence/coston2/gate-e-threshold-recovery.json",
];

export function assertPassedGateEvidence(records) {
  for (const [path, evidence] of Object.entries(records)) {
    if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
      throw new Error(`INVALID_GATE_EVIDENCE:${path}`);
    }
    if (evidence.status !== "PASS") throw new Error(`GATE_NOT_PASSED:${path}`);
    if (Array.isArray(evidence.blockers) && evidence.blockers.length !== 0) {
      throw new Error(`GATE_HAS_BLOCKERS:${path}`);
    }
    if (
      evidence.assertions === null
      || typeof evidence.assertions !== "object"
      || Array.isArray(evidence.assertions)
      || Object.keys(evidence.assertions).length === 0
      || !Object.values(evidence.assertions).every((value) => value === true)
    ) throw new Error(`GATE_ASSERTIONS_INCOMPLETE:${path}`);
  }
  return true;
}

export function loadPassedPreDeploymentGates(repositoryRoot) {
  const records = {};
  for (const path of preDeploymentGateFiles) {
    const absolute = resolve(repositoryRoot, path);
    if (!existsSync(absolute)) throw new Error(`GATE_EVIDENCE_MISSING:${path}`);
    records[path] = JSON.parse(readFileSync(absolute, "utf8"));
  }
  assertPassedGateEvidence(records);
  return records;
}
