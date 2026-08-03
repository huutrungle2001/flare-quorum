import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyActionReadiness,
  loadRelayConfig,
  RelayConfigError,
} from "../dist/index.js";

test("read-only modes do not require a signer", () => {
  const config = loadRelayConfig(["dry-run"], {
    SEPOLIA_RPC_URL: "https://rpc.example",
  });
  assert.equal(config.signerPrivateKey, null);
  assert.equal(config.actionBudget, 3);
});

test("write modes require a dedicated finalizer key", () => {
  assert.throws(
    () =>
      loadRelayConfig(["once"], {
        SEPOLIA_RPC_URL: "https://rpc.example",
      }),
    (error) =>
      error instanceof RelayConfigError &&
      error.code === "missing-finalizer-private-key",
  );
});

test("configuration bounds the shared action budget", () => {
  assert.throws(
    () =>
      loadRelayConfig(["dry-run"], {
        SEPOLIA_RPC_URL: "https://rpc.example",
        FINALIZER_ACTION_BUDGET: "26",
      }),
    (error) =>
      error instanceof RelayConfigError &&
      error.code === "invalid-action-budget",
  );
});

test("Render PORT is used when an explicit health port is absent", () => {
  const config = loadRelayConfig(["dry-run"], {
    SEPOLIA_RPC_URL: "https://rpc.example",
    PORT: "10000",
  });
  assert.equal(config.healthPort, 10000);
});

test("canonical readiness classifies stale actions without trusting the index", () => {
  assert.equal(
    classifyActionReadiness(
      { kind: "confirm-funding", tenderId: 1n },
      0,
      false,
    ),
    "actionable",
  );
  assert.equal(
    classifyActionReadiness(
      { kind: "confirm-funding", tenderId: 1n },
      1,
      false,
    ),
    "resolved",
  );
  assert.equal(
    classifyActionReadiness({ kind: "close", tenderId: 1n }, 1, true),
    "actionable",
  );
  assert.equal(
    classifyActionReadiness({ kind: "close", tenderId: 1n }, 2, false),
    "resolved",
  );
  assert.equal(
    classifyActionReadiness({ kind: "finalize", tenderId: 1n }, 2, false),
    "actionable",
  );
  assert.equal(
    classifyActionReadiness({ kind: "finalize", tenderId: 1n }, 3, false),
    "resolved",
  );
});
