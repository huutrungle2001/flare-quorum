import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createFlareIngressServer } from "../dist/flare-ingress-http.js";

const ciphertext = `0x${"11".repeat(114)}`;
const authorization = `0x${"22".repeat(65)}`;
const teeId = "0x3000000000000000000000000000000000000003";
const request = {
  schemaVersion: 1,
  market: "0x1000000000000000000000000000000000000001",
  tenderId: "7",
  vendor: "0x2000000000000000000000000000000000000002",
  teeId,
  submissionNonce: "9",
  ciphertext,
  expiresAt: "1200",
  authorization,
};

async function fixture(gateway) {
  const server = createFlareIngressServer(gateway, "https://app.example");
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server not listening");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

test("HTTP ingress publishes public machine keys and never echoes bid material", async () => {
  const calls = [];
  const app = await fixture({
    async machineKeys(tenderId) {
      calls.push({ kind: "keys", tenderId });
      return [{
        teeId,
        fingerprint: `0x${"33".repeat(32)}`,
        publicKey: { x: `0x${"44".repeat(32)}`, y: `0x${"55".repeat(32)}` },
      }];
    },
    async submit(value) {
      calls.push({ kind: "submit", value });
      return { actionId: `0x${"66".repeat(32)}`, teeId, expiresAt: 1_200n };
    },
  });
  try {
    const keys = await fetch(`${app.baseUrl}/flare/ingress/tenders/7/machines`, {
      headers: { Origin: "https://app.example" },
    });
    assert.equal(keys.status, 200);
    assert.equal(keys.headers.get("access-control-allow-origin"), "https://app.example");
    assert.equal((await keys.json()).tenderId, "7");

    const accepted = await fetch(`${app.baseUrl}/flare/ingress/bids`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://app.example" },
      body: JSON.stringify(request),
    });
    assert.equal(accepted.status, 202);
    const raw = await accepted.text();
    assert.equal(raw.includes(ciphertext), false);
    assert.equal(raw.includes(authorization), false);
    assert.deepEqual(JSON.parse(raw), {
      schemaVersion: 1,
      actionId: `0x${"66".repeat(32)}`,
      teeId,
      expiresAt: "1200",
    });
    assert.equal(calls[1].value.ciphertext, ciphertext);
  } finally {
    await app.close();
  }
});

test("HTTP ingress rejects plaintext-shaped fields, oversized input, and foreign preflight origins", async () => {
  const gateway = {
    async machineKeys() { throw new Error("not called"); },
    async submit() { throw new Error("not called"); },
  };
  const app = await fixture(gateway);
  try {
    const plaintext = await fetch(`${app.baseUrl}/flare/ingress/bids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, priceMicros: "100" }),
    });
    assert.equal(plaintext.status, 400);
    assert.deepEqual(await plaintext.json(), { error: "INVALID_BID_INGRESS_REQUEST" });

    const oversized = await fetch(`${app.baseUrl}/flare/ingress/bids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(600 * 1024 + 1),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "REQUEST_TOO_LARGE" });

    const preflight = await fetch(`${app.baseUrl}/flare/ingress/bids`, {
      method: "OPTIONS",
      headers: { Origin: "https://foreign.example" },
    });
    assert.equal(preflight.status, 403);
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);
  } finally {
    await app.close();
  }
});

test("HTTP ingress sanitizes unexpected downstream errors", async () => {
  const app = await fixture({
    async machineKeys() { throw new Error("sensitive upstream detail"); },
    async submit() { throw new Error("not called"); },
  });
  try {
    const response = await fetch(`${app.baseUrl}/flare/ingress/tenders/7/machines`);
    assert.equal(response.status, 503);
    const raw = await response.text();
    assert.equal(raw.includes("sensitive upstream detail"), false);
    assert.deepEqual(JSON.parse(raw), { error: "FLARE_INGRESS_UNAVAILABLE" });
  } finally {
    await app.close();
  }
});

test("HTTP ingress applies a bounded per-peer request rate", async () => {
  let calls = 0;
  const app = await fixture({
    async machineKeys() {
      calls += 1;
      return [];
    },
    async submit() { throw new Error("not called"); },
  });
  try {
    for (let index = 0; index < 120; index += 1) {
      const response = await fetch(`${app.baseUrl}/flare/ingress/tenders/7/machines`);
      assert.equal(response.status, 200);
      await response.body?.cancel();
    }
    const limited = await fetch(`${app.baseUrl}/flare/ingress/tenders/7/machines`);
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { error: "RATE_LIMITED" });
    assert.equal(calls, 120);
  } finally {
    await app.close();
  }
});
