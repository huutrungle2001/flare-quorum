import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveAssertions,
  createPacedRpcReader,
  normalizeReleaseTeeIds,
  offlineCommands,
  parseArguments,
  safePublicOrigin,
  summarizePublicEndpoints,
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

test("judge verifier normalizes release TEE IDs without leaking Array.map indexes", () => {
  const teeIds = [
    "0x325E7f5DE26e2ECdaAc23d4883024850E76a0F9B",
    "0x77091a12534cdD90Ea9F4cA11003Ba645b6E8abD",
    "0xc3c454aaDb538A15B18a9Cce24E5e53cC062AFC1",
  ];
  assert.deepEqual(normalizeReleaseTeeIds(teeIds), teeIds);
});

test("judge verifier paces public RPC reads and retries once", async () => {
  let clock = 0;
  const waits = [];
  const reader = createPacedRpcReader({
    minimumIntervalMs: 400,
    retryDelayMs: 1_200,
    now: () => clock,
    wait: async (delayMs) => {
      waits.push(delayMs);
      clock += delayMs;
    },
  });
  assert.equal(await reader(async () => "first"), "first");
  assert.equal(await reader(async () => "second"), "second");
  let attempts = 0;
  assert.equal(await reader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("transient public RPC limit");
    return "retry";
  }), "retry");
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [400, 400, 1_200]);
});

test("judge verifier strips credentials, paths, and private endpoint bodies", () => {
  assert.equal(
    safePublicOrigin(["https://user", ":value@", "example.com/private?token=value"].join("")),
    "https://example.com",
  );
  assert.equal(safePublicOrigin("http://example.com"), null);
  const summary = summarizePublicEndpoints({
    web: { statusCode: 200, body: "not persisted" },
    ingress: {
      statusCode: 200,
      body: {
        status: "ok",
        tenderId: "7",
        tenderStatus: "Awarded",
        ciphertext: "forbidden",
        signature: "forbidden",
        apiKey: "forbidden",
      },
    },
  });
  assert.deepEqual(summary, {
    web: { statusCode: 200 },
    ingress: {
      statusCode: 200,
      serviceStatus: "ok",
      tenderId: "7",
      tenderStatus: "Awarded",
    },
  });
  assert.doesNotMatch(JSON.stringify(summary), /ciphertext|signature|apiKey|not persisted/);
});
