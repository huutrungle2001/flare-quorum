#!/usr/bin/env node
import { loadFlareRelayConfig, FlareRelayConfigError, type FlareRelayMode } from "./flare-config.js";
import { FlareLiveRelay } from "./flare-live.js";
import { FccSelectionPendingError, FlareLifecycleRelay } from "./flare-lifecycle.js";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item);
}

function mode(value: string | undefined): FlareRelayMode {
  if (value === "health" || value === "dry-run" || value === "once" || value === "poll") return value;
  throw new Error("invalid-flare-relay-mode");
}

async function cycle(relay: FlareLifecycleRelay, dryRun: boolean): Promise<void> {
  const snapshot = await relay.snapshot();
  const actions = snapshot.actions.slice(0, relay.config.actionBudget);
  if (dryRun) {
    process.stdout.write(`${safeJson({
      chainId: 114,
      latestBlock: snapshot.latestBlock,
      chainTimestamp: snapshot.chainTimestamp,
      discovered: snapshot.actions.length,
      actions,
      outcome: "dry-run",
    })}\n`);
    return;
  }
  for (const action of actions) {
    try {
      const outcome = await relay.execute(action);
      process.stdout.write(`${safeJson({ tenderId: action.tenderId, action: action.kind, outcome: typeof outcome === "string" ? outcome : "submitted" })}\n`);
    } catch (error) {
      if (error instanceof FccSelectionPendingError) {
        process.stdout.write(`${safeJson({ tenderId: action.tenderId, action: action.kind, outcome: "proof-pending" })}\n`);
        continue;
      }
      process.stdout.write(`${safeJson({ tenderId: action.tenderId, action: action.kind, outcome: "failed" })}\n`);
      process.exitCode = 1;
    }
  }
}

async function main(): Promise<void> {
  const selectedMode = mode(process.argv[2]);
  const config = loadFlareRelayConfig(selectedMode, process.env);
  if (selectedMode === "health") {
    const health = await new FlareLiveRelay(config).health();
    process.stdout.write(`${safeJson(health)}\n`);
    if (health.status === "unavailable") process.exitCode = 1;
    return;
  }
  const relay = new FlareLifecycleRelay(config);
  if (selectedMode === "dry-run") {
    await cycle(relay, true);
    return;
  }
  if (selectedMode === "once") {
    await cycle(relay, false);
    return;
  }
  while (true) {
    try {
      await cycle(relay, false);
    } catch {
      process.stdout.write(`${safeJson({ outcome: "cycle-unavailable" })}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
}

main().catch((error: unknown) => {
  process.stdout.write(`${safeJson({
    outcome: "config-error",
    code: error instanceof FlareRelayConfigError ? error.code : "unexpected-error",
  })}\n`);
  process.exitCode = 1;
});
