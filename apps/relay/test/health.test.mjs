import assert from "node:assert/strict";
import test from "node:test";
import { startHealthServer } from "../dist/health.js";

test("health endpoint exposes public liveness only", async (context) => {
  const server = await startHealthServer(
    {
      async health() {
        return {
          status: "degraded",
          chainId: 11155111,
          latestBlock: "123",
          marketCodePresent: true,
          deploymentKind: "test-e2e",
          deploymentVerified: false,
        };
      },
    },
    "127.0.0.1",
    0,
  );
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/health`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    status: "degraded",
    chainId: 11155111,
    latestBlock: "123",
    marketCodePresent: true,
    deploymentKind: "test-e2e",
    deploymentVerified: false,
  });

  const liveResponse = await fetch(
    `http://127.0.0.1:${address.port}/live`,
  );
  assert.equal(liveResponse.status, 200);
  assert.deepEqual(await liveResponse.json(), { status: "ok" });
});
