import assert from "node:assert/strict";
import test from "node:test";
import {
  ProofPendingError,
  describeDryRun,
  runRelayActions,
} from "../dist/index.js";

const transactionHash = `0x${"33".repeat(32)}`;

test("dry-run applies one shared action budget without an adapter", () => {
  const summary = describeDryRun(
    [
      { kind: "finalize", tenderId: 1n },
      { kind: "close", tenderId: 2n },
      { kind: "close", tenderId: 3n },
    ],
    2,
  );
  assert.equal(summary.processed, 2);
  assert.equal(summary.remaining, 1);
  assert.deepEqual(
    summary.results.map(({ tenderId, outcome }) => [tenderId, outcome]),
    [
      ["1", "dry-run"],
      ["2", "dry-run"],
    ],
  );
});

test("runner executes sequentially and never exceeds the shared budget", async () => {
  let active = 0;
  let maximumActive = 0;
  const executed = [];
  const actions = [
    { kind: "finalize", tenderId: 1n },
    { kind: "close", tenderId: 2n },
    { kind: "close", tenderId: 3n },
  ];
  const summary = await runRelayActions({
    actions,
    budget: 2,
    adapter: {
      async inspect() {
        return "actionable";
      },
      async execute(action) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        executed.push(action.tenderId);
        await Promise.resolve();
        active -= 1;
        return transactionHash;
      },
    },
  });
  assert.equal(maximumActive, 1);
  assert.deepEqual(executed, [1n, 2n]);
  assert.equal(summary.remaining, 1);
});

test("runner treats a stale competing write as a benign race", async () => {
  let inspections = 0;
  const summary = await runRelayActions({
    actions: [{ kind: "close", tenderId: 9n }],
    budget: 1,
    adapter: {
      async inspect() {
        inspections += 1;
        return inspections === 1 ? "actionable" : "resolved";
      },
      async execute() {
        throw new Error("untrusted RPC error with transaction input");
      },
    },
  });
  assert.deepEqual(summary.results, [
    { action: "close", tenderId: "9", outcome: "race-resolved" },
  ]);
});

test("runner emits allowlisted proof-pending output without raw errors", async () => {
  const emitted = [];
  const summary = await runRelayActions({
    actions: [{ kind: "finalize", tenderId: 4n }],
    budget: 1,
    adapter: {
      async inspect() {
        return "actionable";
      },
      async execute() {
        throw new ProofPendingError();
      },
    },
    onResult(result) {
      emitted.push(JSON.stringify(result));
    },
  });
  assert.deepEqual(summary.results, [
    {
      action: "finalize",
      tenderId: "4",
      outcome: "deferred",
      reason: "proof-pending",
    },
  ]);
  assert.equal(emitted.join(" ").includes("handle"), false);
  assert.equal(emitted.join(" ").includes("proof"), true);
});

test("runner sanitizes an inspection failure and continues sequentially", async () => {
  const visited = [];
  const summary = await runRelayActions({
    actions: [
      { kind: "close", tenderId: 1n },
      { kind: "close", tenderId: 2n },
    ],
    budget: 2,
    adapter: {
      async inspect(action) {
        visited.push(`inspect:${action.tenderId}`);
        if (action.tenderId === 1n) throw new Error("raw RPC response");
        return "actionable";
      },
      async execute(action) {
        visited.push(`execute:${action.tenderId}`);
        return transactionHash;
      },
    },
  });
  assert.deepEqual(visited, ["inspect:1", "inspect:2", "execute:2"]);
  assert.deepEqual(summary.results[0], {
    action: "close",
    tenderId: "1",
    outcome: "failed",
    reason: "action-failed",
  });
});
