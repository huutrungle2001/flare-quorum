import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveAssertions,
  offlineCommands,
  parseArguments,
} from "../scripts/verify-judge-release.mjs";

const release = {
  chainId: 114,
  contracts: {
    FlareQuorumMarketV2: {
      address: "0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC",
      runtimeHash: `0x${"1".repeat(64)}`,
    },
  },
};
const passingInput = {
  release,
  chainId: 114,
  runtimeHash: release.contracts.FlareQuorumMarketV2.runtimeHash,
  deploymentReceipt: {
    status: "success",
    contractAddress: release.contracts.FlareQuorumMarketV2.address,
  },
  machines: [1, 2, 3].map(() => ({ status: 2, availability: { status: "PASSED" } })),
  web: { ok: true, containsBrand: true },
  ingress: {
    ok: true,
    body: { status: "ok", schemaVersion: 1, chainId: 114, machineBindingsValid: true },
  },
};

test("judge live verifier requires every public release binding", () => {
  assert.ok(Object.values(buildLiveAssertions(passingInput)).every(Boolean));
  const stale = structuredClone(passingInput);
  stale.machines[1].availability.status = "FAILED";
  assert.equal(buildLiveAssertions(stale).allReleaseMachinesFresh, false);
});

test("judge offline verifier includes release gates without live writes", () => {
  const flattened = JSON.stringify(offlineCommands);
  for (const gate of ["env:doctor", "test", "lint", "build", "flare:slither:v2", "bindings:check", "evidence:validate", "flare:judge:check"]) {
    assert.ok(flattened.includes(gate), `Missing offline gate ${gate}`);
  }
  assert.ok(flattened.includes("--no-write"));
  assert.doesNotMatch(flattened, /--execute|:deploy|:refresh|:success/);
});

test("judge verifier defaults to the complete suite and supports isolated modes", () => {
  assert.deepEqual(parseArguments([]), { runOffline: true, runLive: true, output: null });
  assert.deepEqual(parseArguments(["--offline"]), { runOffline: true, runLive: false, output: null });
  assert.deepEqual(parseArguments(["--live"]), { runOffline: false, runLive: true, output: null });
  assert.throws(() => parseArguments(["--output"]), /JUDGE_VERIFY_OUTPUT_PATH_MISSING/);
});
