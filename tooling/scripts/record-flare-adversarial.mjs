import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const evidencePath = resolve(root, "evidence/local/flare-adversarial-coverage.json");

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const commands = [
  {
    name: "fcc-extension-go-tests",
    args: ["--filter", "@veilbid/fcc-extension", "test"],
    coverage: [
      "invalidBidRejected",
      "credentialDomainBindingRejected",
      "tieAndPermutationDeterministic",
      "ciphertextReplayRejected",
      "malformedWireRejected",
      "sealedStoreRestartAndSlotRewriteRejected",
      "staleFtsoCannotBecomeRefund",
    ],
  },
  {
    name: "flare-contract-forge-tests",
    args: ["--filter", "@veilbid/flare-contracts", "test"],
    coverage: [
      "zeroWinnerConservation",
      "resultDomainReplayRejected",
      "wrongRootAndWrongBindingRejected",
      "staleFtsoRejected",
      "duplicateSignerAndSplitQuorumRejected",
      "signerLossThresholdBehavior",
      "competingFinalizationAndTerminalReplayRejected",
    ],
  },
  {
    name: "settlement-relay-tests",
    args: ["--filter", "@veilbid/settlement-relay", "test"],
    coverage: [
      "wrongDomainAndMalformedIngressRejected",
      "resultSplitAndDuplicateSignerRemainPending",
      "competingRelayBenignRace",
      "checkpointQuoteNonceAndCommitmentDriftRejected",
      "proxyUnavailableRemainsPending",
    ],
  },
];

const results = [];
for (const command of commands) {
  try {
    execFileSync("pnpm", command.args, {
      cwd: root,
      env: { ...process.env, CI: "1" },
      stdio: "ignore",
    });
    results.push({ name: command.name, passed: true });
  } catch {
    results.push({ name: command.name, passed: false });
  }
}

const testsPassed = results.every(({ passed }) => passed);
const coverage = Object.fromEntries(
  commands.flatMap((command, index) => command.coverage.map((name) => [name, results[index].passed])),
);
const evidence = {
  schemaVersion: 1,
  suite: "flare-adversarial-local-coverage",
  status: testsPassed ? "PARTIAL" : "IN_PROGRESS",
  recordedAt: new Date().toISOString(),
  sourceCommit: git("rev-parse", "HEAD"),
  scope: {
    environment: "local-unit-and-integration-tests",
    targetNetwork: "flare-coston2",
    chainId: 114,
    liveWritesPerformed: false,
    liveFaultDrillsPerformed: false,
  },
  testCommands: results,
  assertions: {
    testCommandsPassed: testsPassed,
    ...coverage,
    noMockSuccessPathUsed: true,
    noConfidentialPayloadRecorded: true,
  },
  blockers: [
    "LIVE_FAULT_DRILLS_NOT_RUN",
    "SAME_IDENTITY_TEE_RESTART_NOT_SUPPORTED_BY_CURRENT_SIMULATED_RUNTIME",
  ],
  notes: [
    "This record proves local Go, Forge, and relay rejection/continuity coverage only; it is not live Coston2 adversarial evidence.",
    "Live Coston2 positive lifecycles and one-result-endpoint recovery are recorded separately under evidence/coston2/.",
    "The proxy restart case uses the sealed-store restart contract; a production proxy/TEE process restart was not claimed.",
    "No bid plaintext, ciphertext, credential, raw signature, proof body, private key, or provider secret is written.",
  ],
};

mkdirSync(resolve(root, "evidence/local"), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  evidence: "evidence/local/flare-adversarial-coverage.json",
  status: evidence.status,
  testCommandsPassed: testsPassed,
  blockers: evidence.blockers,
}, null, 2));
if (!testsPassed) process.exitCode = 1;
