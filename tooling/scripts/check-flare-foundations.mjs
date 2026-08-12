import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { inspectFoundations } from "../flare/foundations.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const outputPath = resolve(
  repositoryRoot,
  "evidence/coston2/gate-0-foundations.json",
);
const writeEvidence = process.argv.includes("--write");
const requireComplete = process.argv.includes("--require-complete");
const requiredFoundationAssertions = [
  "chainIdMatches",
  "deploymentKeyMatchesDeclaredWallet",
  "deployerHasMinimumGas",
  "allDiscoveredContractsHaveCode",
  "pinnedSourceHashesMatch",
  "nodeVersionPinned",
  "pnpmVersionPinned",
  "goVersionPinned",
  "foundryVersionPinned",
  "teeNodeMinimumSatisfied",
  "fccRuntimeVersionsAligned",
  "fccExtensionBuildInputsPinned",
  "fccExtensionReleaseImageDigestRecorded",
  "fccExtensionReleaseImageVerified",
  "teeProxyBuildInputsPinned",
  "dockerDaemonAvailable",
  "teeProxyReleaseImageDigestRecorded",
  "teeProxyReleaseImageVerified",
  "managerInterfaceResponds",
  "operationalManagerMatches",
  "currentScaffoldPinsRecorded",
  "registryDiscoveryMatches",
  "fTestXrpBindingMatches",
  "fdcProtocolBindingsLive",
  "fAssetsDirectMintingBindingsLive",
  "xrpUsdFeedIsLive",
  "stableProxyInstructionRouteReady",
  "threeFreshAvailabilityChecks",
];

try {
  const evidence = await inspectFoundations({ repositoryRoot });
  if (writeEvidence) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(
    JSON.stringify({
      gate: evidence.gate,
      status: evidence.status,
      blockNumber: evidence.network.blockNumber,
      assertions: evidence.assertions,
      blockers: evidence.blockers,
      evidence: writeEvidence
        ? "evidence/coston2/gate-0-foundations.json"
        : null,
    }),
  );
  if (
    requiredFoundationAssertions.some((name) => !evidence.assertions[name])
  ) {
    process.exitCode = 1;
  }
  if (requireComplete && evidence.status !== "PASSED") process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      gate: "0",
      status: "FAILED",
      code: error instanceof Error ? error.message : "FOUNDATION_CHECK_FAILED",
    }),
  );
  process.exitCode = 1;
}
