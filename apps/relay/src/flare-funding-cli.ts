#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  FlareFundingConfigError,
  loadFlareFundingConfig,
  type FlareFundingMode,
} from "./flare-funding-config.js";
import { LiveFlareFundingChain } from "./flare-funding-chain.js";
import { FlareFundingExecutor } from "./flare-funding-executor.js";
import { parseFlareFundingJob } from "./flare-funding-job.js";

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item);
}

function mode(value: string | undefined): FlareFundingMode {
  if (value === "health" || value === "execute") return value;
  throw new FlareFundingConfigError("invalid-flare-funding-mode");
}

function input(): unknown {
  const raw = readFileSync(0, "utf8");
  if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) {
    throw new Error("FLARE_FUNDING_JOB_TOO_LARGE");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("MALFORMED_FLARE_FUNDING_JOB_JSON");
  }
}

function errorCode(error: unknown): string {
  if (error instanceof FlareFundingConfigError) return error.code;
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  return "FLARE_FUNDING_OPERATION_FAILED";
}

async function main(): Promise<void> {
  const selectedMode = mode(process.argv[2]);
  const config = loadFlareFundingConfig(selectedMode, process.env);
  const executor = new FlareFundingExecutor(
    config,
    new LiveFlareFundingChain(config),
  );
  if (selectedMode === "health") {
    process.stdout.write(`${json(await executor.health())}\n`);
    return;
  }
  const outcome = await executor.execute(parseFlareFundingJob(input()));
  process.stdout.write(`${json(outcome)}\n`);
  if (outcome.outcome === "delayed") process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stdout.write(`${json({
    outcome: "failed",
    code: errorCode(error),
  })}\n`);
  process.exitCode = 1;
});
