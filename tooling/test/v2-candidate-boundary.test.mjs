import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("exports promoted V2 bindings without exposing a candidate namespace", () => {
  const packageManifest = JSON.parse(read("packages/flare-bindings/package.json"));
  const publicIndex = read("packages/flare-bindings/src/index.ts");
  assert.equal(Object.keys(packageManifest.exports).some((key) => key.includes("candidate")), false);
  assert.match(publicIndex, /FlareQuorumMarketV2/);
  assert.doesNotMatch(publicIndex, /candidates\/v2/);
});

test("candidate binding manifest is explicitly address-free and unselectable", () => {
  const manifestText = read("packages/flare-bindings/candidates/v2/manifest.json");
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.status, "LOCAL_CANDIDATE");
  assert.equal(manifest.consumerSelectable, false);
  assert.equal(manifest.liveDeploymentIncluded, false);
  assert.doesNotMatch(manifestText, /0x[0-9a-fA-F]{40}/);
});

test("web, relay, and console source do not import the staging candidate namespace", () => {
  for (const path of ["apps/web/src", "apps/relay/src", "apps/console/src"]) {
    const output = search(path);
    assert.equal(output, "", `${path} must consume only the promoted package API`);
  }
});

function search(relativePath) {
  try {
    return execFileSync("rg", ["-n", "candidates/v2|coston2\\.v2", relativePath], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch (error) {
    if (error.status === 1) return "";
    throw error;
  }
}
