import assert from "node:assert/strict";
import test from "node:test";
import {
  flareHealthHost,
  flareHealthPort,
  startFlareHealthServer,
} from "../dist/flare-health-server.js";

test("Flare health server exposes liveness and sanitized chain health", async () => {
  const server = await startFlareHealthServer(
    { health: async () => ({ status: "ok", chainId: 114, latestBlock: "123", marketCodePresent: true, deploymentStatus: "verified" }) },
    "127.0.0.1",
    0,
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const live = await fetch(`${base}/live`);
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: "ok", service: "veilbid-flare-relay" });
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).chainId, 114);
  const missing = await fetch(`${base}/missing`);
  assert.equal(missing.status, 404);
  const method = await fetch(`${base}/live`, { method: "POST" });
  assert.equal(method.status, 405);
  await new Promise((resolve) => server.close(resolve));
});

test("Flare health config uses hosted env without exposing secrets", () => {
  assert.equal(flareHealthHost({ FLARE_HEALTH_HOST: "0.0.0.0" }), "0.0.0.0");
  assert.equal(flareHealthHost({ FINALIZER_HEALTH_HOST: "0.0.0.0" }), "0.0.0.0");
  assert.equal(flareHealthPort({ FLARE_HEALTH_PORT: "9000" }), 9000);
  assert.equal(flareHealthPort({ PORT: "9001" }), 9001);
  assert.equal(flareHealthPort({ FLARE_HEALTH_PORT: "not-a-port" }), 8787);
});
