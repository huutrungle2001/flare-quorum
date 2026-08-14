import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateJudgeReport } from "../flare/judge-report.mjs";

const path = process.argv[2];
if (!path) throw new Error("JUDGE_REPORT_PATH_MISSING");
const report = JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
const validation = validateJudgeReport(report);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  suite: "flarequorum-judge-report-validation",
  status: validation.valid ? "PASSED" : "BLOCKED",
  violations: validation.violations,
}, null, 2)}\n`);
if (!validation.valid) process.exitCode = 1;
