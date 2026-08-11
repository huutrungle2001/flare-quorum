import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  artifactAbiDigest,
  evaluateV2PromotionBundle,
  inspectV2LocalReadiness,
  v2ProgressBlockers,
} from "../flare/v2-release.mjs";

const root = resolve(import.meta.dirname, "../..");
const check = process.argv.includes("--check");
const readiness = inspectV2LocalReadiness(root);
if (readiness.status !== "PASSED") {
  throw new Error(`FLARE_V2_LOCAL_READINESS_FAILED:${JSON.stringify(readiness.assertions)}`);
}

const { plan } = readiness;
const marketArtifact = JSON.parse(readFileSync(resolve(root, plan.contracts.market.artifact), "utf8"));
const receiptArtifact = JSON.parse(readFileSync(resolve(root, plan.contracts.awardReceipt.artifact), "utf8"));
const optionalJson = (path) => existsSync(resolve(root, path))
  ? JSON.parse(readFileSync(resolve(root, path), "utf8"))
  : undefined;
const progress = evaluateV2PromotionBundle({
  candidate: optionalJson(plan.artifacts.candidateManifest),
  candidateDeployment: optionalJson(plan.artifacts.candidateDeploymentEvidence),
  extension: optionalJson(plan.artifacts.extensionRegistrationEvidence),
  governance: optionalJson(plan.artifacts.governanceEvidence),
  machines: optionalJson(plan.artifacts.machineEvidence),
  success: optionalJson(plan.artifacts.successLifecycleEvidence),
  recovery: optionalJson(plan.artifacts.oneResultOutageEvidence),
  refund: optionalJson(plan.artifacts.refundLifecycleEvidence),
  v1Release: optionalJson("packages/flare-contracts/deployments/coston2.release.json"),
});
const progressBlockers = v2ProgressBlockers(progress.assertions);
const sourceDigest = (path) => createHash("sha256")
  .update(readFileSync(resolve(root, path)))
  .digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const files = new Map([
  [plan.artifacts.candidateMarketAbi, json(marketArtifact.abi)],
  [plan.artifacts.candidateAwardReceiptAbi, json(receiptArtifact.abi)],
]);
const manifest = {
  schemaVersion: 1,
  kind: "flarequorum-v2-local-bindings",
  network: "flare-coston2",
  chainId: 114,
  status: "LOCAL_CANDIDATE",
  consumerSelectable: false,
  liveDeploymentIncluded: false,
  contracts: {
    FlareQuorumMarketV2: {
      source: plan.contracts.market.source,
      sourceSha256: sourceDigest(plan.contracts.market.source),
      abi: plan.artifacts.candidateMarketAbi,
      abiSha256: artifactAbiDigest(marketArtifact.abi),
    },
    FlareQuorumAwardReceiptV2: {
      source: plan.contracts.awardReceipt.source,
      sourceSha256: sourceDigest(plan.contracts.awardReceipt.source),
      abi: plan.artifacts.candidateAwardReceiptAbi,
      abiSha256: artifactAbiDigest(receiptArtifact.abi),
    },
  },
  promotionRequirements: plan.promotionRequirements,
  blockers: progressBlockers,
};
files.set(plan.artifacts.candidateBindingsManifest, json(manifest));

if (check) {
  for (const [relativePath, expected] of files) {
    const path = resolve(root, relativePath);
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected) {
      throw new Error(`FLARE_V2_CANDIDATE_BINDING_STALE:${relativePath}`);
    }
  }
  console.log(JSON.stringify({ status: "PASSED", scope: "V2 local candidate bindings", files: [...files.keys()] }, null, 2));
  process.exit(0);
}

for (const [relativePath, contents] of files) {
  const path = resolve(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const evidencePath = resolve(root, plan.artifacts.localReadinessEvidence);
const evidence = {
  schemaVersion: 1,
  gate: "FLARE_V2_LOCAL_RELEASE_READINESS",
  status: progressBlockers.length === 0 ? "READY" : "PARTIAL",
  scope: "local release readiness and committed live V2 progress; no consumer switch",
  recordedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  network: { name: "flare-coston2", chainId: 114 },
  publicIdentifiers: {
    ...readiness.publicFacts,
    liveProgressAssertions: progress.assertions,
  },
  assertions: readiness.assertions,
  blockers: manifest.blockers,
  notes: [
    "This readiness command sends no Coston2 transaction; live progress is derived only from committed sanitized artifacts.",
    "Candidate ABIs are intentionally excluded from the public @flarequorum/flare-bindings exports until promotion.",
    "The verified V1 release remains the only consumer-selectable Coston2 release.",
  ],
};
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, json(evidence));

console.log(JSON.stringify({
  status: evidence.status,
  scope: evidence.scope,
  bindings: [...files.keys()],
  evidence: plan.artifacts.localReadinessEvidence,
  blockers: evidence.blockers,
}, null, 2));
