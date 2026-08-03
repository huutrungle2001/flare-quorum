#!/usr/bin/env node
import { loadRelayConfig, RelayConfigError } from "./config.js";
import { startHealthServer } from "./health.js";
import { LiveRelay } from "./live.js";
import { createRelayLogger } from "./logger.js";
import { planRelayActions } from "./planner.js";
import { describeDryRun, runRelayActions } from "./runner.js";

const logger = createRelayLogger();

async function runCycle(relay: LiveRelay, dryRun: boolean) {
  const snapshot = await relay.snapshot();
  const actions = planRelayActions(snapshot.index, snapshot.chainTimestamp);
  const summary = dryRun
    ? describeDryRun(actions, relay.config.actionBudget)
    : await runRelayActions({
        actions,
        budget: relay.config.actionBudget,
        adapter: relay.adapter(),
        onResult: (result) => logger.action(result),
      });
  logger.summary(summary);
  return summary;
}

async function poll(relay: LiveRelay): Promise<never> {
  await startHealthServer(
    relay,
    relay.config.healthHost,
    relay.config.healthPort,
  );
  logger.event("relay.health-listening", {
    host: relay.config.healthHost,
    port: relay.config.healthPort,
  });
  while (true) {
    try {
      await runCycle(relay, false);
    } catch {
      logger.event("relay.cycle-failed", { code: "cycle-failed" });
    }
    await new Promise((resolve) =>
      setTimeout(resolve, relay.config.pollIntervalMs),
    );
  }
}

async function main() {
  const config = loadRelayConfig(process.argv.slice(2), process.env);
  const relay = new LiveRelay(config);
  logger.event("relay.start", {
    mode: config.mode,
    actionBudget: config.actionBudget,
  });

  if (config.mode === "health") {
    const health = await relay.health();
    logger.event("relay.health", {
      status: health.status,
      chainId: health.chainId ?? "unknown",
      latestBlock: health.latestBlock ?? "unknown",
      marketCodePresent: health.marketCodePresent,
      deploymentKind: health.deploymentKind,
      deploymentVerified: health.deploymentVerified,
    });
    if (health.status === "unavailable") process.exitCode = 1;
    return;
  }
  if (config.mode === "dry-run") {
    await runCycle(relay, true);
    return;
  }
  relay.assertWritesAllowed();
  if (config.mode === "once") {
    const summary = await runCycle(relay, false);
    if (summary.results.some((result) => result.outcome === "failed")) {
      process.exitCode = 1;
    }
    return;
  }
  await poll(relay);
}

main().catch((error: unknown) => {
  logger.event("relay.fatal", {
    code:
      error instanceof RelayConfigError
        ? error.code
        : error instanceof Error &&
            error.message === "unverified-deployment-write-disabled"
          ? "unverified-deployment-write-disabled"
          : "unexpected-error",
  });
  process.exitCode = 1;
});
