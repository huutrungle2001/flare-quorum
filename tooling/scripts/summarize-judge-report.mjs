import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateJudgeReport } from "../flare/judge-report.mjs";

function commitLabel(value) {
  return /^[0-9a-f]{40}$/.test(value ?? "") ? value.slice(0, 12) : "local";
}

export function renderJudgeSummary(report, sourceCommit = null, reportSha256 = null) {
  const live = report.live;
  const freshMachines = live?.machineAvailability?.filter(({ availabilityStatus }) =>
    availabilityStatus === "PASSED").length ?? 0;
  return [
    "## FlareQuorum Coston2 read-only health",
    "",
    `- Status: **${report.status}**`,
    `- Source commit: \`${commitLabel(sourceCommit)}\``,
    `- Chain ID: \`${live?.publicIdentifiers?.chainId ?? "unavailable"}\``,
    `- Checkpoint block: \`${live?.publicIdentifiers?.checkpointBlock ?? "unavailable"}\``,
    `- Market: \`${live?.publicIdentifiers?.market ?? "unavailable"}\``,
    `- Fresh release machines: \`${freshMachines}/3\``,
    `- Web HTTP: \`${live?.endpointStatus?.web?.statusCode ?? "unavailable"}\``,
    `- Ingress HTTP: \`${live?.endpointStatus?.ingress?.statusCode ?? "unavailable"}\``,
    `- Report SHA-256: \`${reportSha256 ?? "unavailable"}\``,
    "",
    "No transaction, credential, ciphertext, or bid payload was used.",
    "",
  ].join("\n");
}

function main() {
  const reportPath = process.argv[2];
  const summaryPath = process.argv[3];
  if (!reportPath) throw new Error("JUDGE_REPORT_PATH_MISSING");
  if (!summaryPath) throw new Error("JUDGE_SUMMARY_PATH_MISSING");
  const source = readFileSync(resolve(process.cwd(), reportPath), "utf8");
  const report = JSON.parse(source);
  const validation = validateJudgeReport(report);
  if (!validation.valid) throw new Error("JUDGE_REPORT_SCHEMA_INVALID");
  const reportSha256 = createHash("sha256").update(source).digest("hex");
  appendFileSync(
    resolve(process.cwd(), summaryPath),
    renderJudgeSummary(report, process.env.GITHUB_SHA, reportSha256),
    { mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    reportSha256,
    sourceCommit: commitLabel(process.env.GITHUB_SHA),
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
