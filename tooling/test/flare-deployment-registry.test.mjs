import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("market deployment paths fail closed on live FtsoV2 registry drift", () => {
  for (const path of [
    "tooling/scripts/deploy-flare-market-candidate.mjs",
    "tooling/scripts/deploy-flare-market.mjs",
  ]) {
    const script = source(path);
    const registryCheck = script.indexOf("resolveRegistryBindings({");
    const deployment = script.indexOf("walletClient.deployContract({");
    assert.ok(registryCheck >= 0, `${path} must resolve the live registry`);
    assert.ok(deployment > registryCheck, `${path} must check before deploying`);
    assert.match(script, /FTSOV2_REGISTRY_BINDING_DRIFT/);
  }
});

test("release promotion rechecks FtsoV2 before creating release facts", () => {
  const path = "tooling/scripts/promote-flare-market-release.mjs";
  const script = source(path);
  const registryCheck = script.indexOf("resolveRegistryBindings({");
  const release = script.indexOf("const release = {");
  assert.ok(registryCheck >= 0, `${path} must resolve the live registry`);
  assert.ok(release > registryCheck, `${path} must check before promotion`);
  assert.match(script, /FTSOV2_REGISTRY_BINDING_DRIFT/);
});
