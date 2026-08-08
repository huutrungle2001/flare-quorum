import assert from "node:assert/strict";
import test from "node:test";
import { lifecyclePathBlocker } from "../flare/market-lifecycle-guards.mjs";

test("read-only market preflight remains rerunnable after evidence exists", () => {
  assert.equal(
    lifecyclePathBlocker({ execute: false, evidenceExists: true, stateExists: true }),
    null,
  );
});

test("executing a market lifecycle reserves an existing evidence path", () => {
  assert.equal(
    lifecyclePathBlocker({ execute: true, evidenceExists: true, stateExists: false }),
    "FCC_MARKET_LIFECYCLE_EVIDENCE_EXISTS",
  );
});

test("executing a market lifecycle reserves an existing state path", () => {
  assert.equal(
    lifecyclePathBlocker({ execute: true, evidenceExists: false, stateExists: true }),
    "FCC_MARKET_LIFECYCLE_STATE_EXISTS",
  );
});
