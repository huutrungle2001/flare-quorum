import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const contractsRoot = resolve(repositoryRoot, "packages/flare-contracts");
const policyPath = resolve(
  repositoryRoot,
  "tooling/flare/slither-v2-allowlist.json",
);
const policy = JSON.parse(readFileSync(policyPath, "utf8"));

if (
  policy.schemaVersion !== 1 ||
  typeof policy.slitherVersion !== "string" ||
  typeof policy.target !== "string" ||
  policy.minimumImpact !== "Medium" ||
  !Array.isArray(policy.excludedDetectors) ||
  policy.excludedDetectors.length === 0 ||
  policy.excludedDetectors.some(
    ({ name, match, rationale }) =>
      typeof name !== "string" ||
      name.length === 0 ||
      typeof match !== "string" ||
      !match.startsWith("FlareQuorumMarketV2.") ||
      typeof rationale !== "string" ||
      rationale.length < 40,
  )
) {
  throw new Error("INVALID_SLITHER_V2_ALLOWLIST");
}

const runSlither = (args, options = {}) =>
  spawnSync("python3", ["-m", "slither", ...args], {
    cwd: contractsRoot,
    encoding: "utf8",
    ...options,
  });

const version = runSlither(["--version"]);
if (version.error) throw version.error;
const reportedVersion = `${version.stdout}${version.stderr}`.trim();
if (version.status !== 0 || reportedVersion !== policy.slitherVersion) {
  throw new Error(
    `SLITHER_VERSION_MISMATCH:${reportedVersion || "NOT_AVAILABLE"}`,
  );
}

const reportDirectory = mkdtempSync(resolve(tmpdir(), "flarequorum-slither-"));
const reportPath = resolve(reportDirectory, "report.json");
let detectors;
try {
  const analysis = runSlither([
    policy.target,
    "--exclude-dependencies",
    "--exclude-low",
    "--exclude-informational",
    "--json",
    reportPath,
  ]);
  if (analysis.error) throw analysis.error;
  if (!analysis.stdout.includes("analyzed")) process.stderr.write(analysis.stdout);
  if (analysis.stderr) process.stderr.write(analysis.stderr);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  detectors = report.results?.detectors;
  if (!Array.isArray(detectors)) throw new Error("INVALID_SLITHER_JSON_REPORT");
} finally {
  rmSync(reportDirectory, { recursive: true, force: true });
}

const unexpected = detectors.filter(
  ({ check, description }) =>
    !policy.excludedDetectors.some(
      ({ name, match }) =>
        check === name &&
        typeof description === "string" &&
        description.includes(match),
    ),
);
if (unexpected.length > 0) {
  for (const finding of unexpected) {
    process.stderr.write(
      `${finding.check}:${finding.impact}:${finding.description}\n`,
    );
  }
  process.exit(1);
}

console.log(
  JSON.stringify({
    status: "PASSED",
    tool: "slither",
    version: policy.slitherVersion,
    target: `packages/flare-contracts/${policy.target}`,
    minimumImpact: policy.minimumImpact,
    allowlistedFindings: detectors.map(({ check }) => check),
  }),
);
