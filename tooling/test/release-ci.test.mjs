import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/release-ci.yml", import.meta.url);
const foundationsUrl = new URL("../flare/coston2-foundations.json", import.meta.url);
const slitherPolicyUrl = new URL("../flare/slither-v2-allowlist.json", import.meta.url);
const packageUrl = new URL("../../package.json", import.meta.url);
const nodeVersionUrl = new URL("../../.nvmrc", import.meta.url);
const goModuleUrl = new URL("../../apps/fcc-extension/go.mod", import.meta.url);
const devcontainerUrl = new URL("../../.devcontainer/Dockerfile", import.meta.url);
const toolingTestUrl = new URL("./", import.meta.url);

test("release CI installs the repository-pinned Foundry before workspace tests", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const install = workflow.indexOf("uses: foundry-rs/foundry-toolchain@908c540300062bd5a7e473851cdb4282204cee09 # v1");
  const version = workflow.indexOf("version: v1.7.1", install);
  const doctor = workflow.indexOf("run: pnpm env:doctor", version);
  const tests = workflow.indexOf("run: pnpm test");
  assert.ok(install > 0, "Foundry action is missing");
  assert.ok(version > install, "Foundry binary version is not pinned");
  assert.ok(doctor > version, "Declared toolchain must be verified after installation");
  assert.ok(tests > version, "Foundry must be installed before workspace tests");
});

test("release CI actions are immutable commit pins", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const actionReferences = [...workflow.matchAll(/^\s*uses:\s+[^@\s]+@([^\s]+)(?:\s+#.*)?$/gm)];
  assert.ok(actionReferences.length >= 5, "Expected all release actions to be enumerated");
  for (const [, reference] of actionReferences) {
    assert.match(reference, /^[0-9a-f]{40}$/, `${reference} is not an immutable action commit`);
  }
});

test("release CI and devcontainer use the canonical Coston2 toolchain pins", async () => {
  const [workflow, foundationsText, slitherPolicyText, packageText, nodeVersion, goModule, dockerfile] =
    await Promise.all([
      readFile(workflowUrl, "utf8"),
      readFile(foundationsUrl, "utf8"),
      readFile(slitherPolicyUrl, "utf8"),
      readFile(packageUrl, "utf8"),
      readFile(nodeVersionUrl, "utf8"),
      readFile(goModuleUrl, "utf8"),
      readFile(devcontainerUrl, "utf8"),
    ]);
  const foundations = JSON.parse(foundationsText);
  const slitherPolicy = JSON.parse(slitherPolicyText);
  const packageManifest = JSON.parse(packageText);
  const { node, pnpm, go, foundry } = foundations.toolchains;

  assert.equal(nodeVersion.trim(), node.version);
  assert.equal(packageManifest.packageManager, `pnpm@${pnpm.version}`);
  assert.match(goModule, new RegExp(`^go ${go.version.replaceAll(".", "\\.")}$`, "m"));
  for (const fragment of [
    `node-version: ${node.version}`,
    `version: ${pnpm.version}`,
    `go-version: ${go.version}`,
    `version: v${foundry.version}`,
    `slither-analyzer==${slitherPolicy.slitherVersion}`,
  ]) assert.ok(workflow.includes(fragment), `Release CI is missing ${fragment}`);
  for (const fragment of [
    `NODE_VERSION=${node.version}`,
    `NODE_SHA256=${node.sha256}`,
    `PNPM_VERSION=${pnpm.version}`,
    `GO_VERSION=${go.version}`,
    `GO_SHA256=${go.sha256}`,
    `FOUNDRY_VERSION=${foundry.version}`,
    `FOUNDRY_SHA256=${foundry.sha256}`,
    `SLITHER_VERSION=${slitherPolicy.slitherVersion}`,
  ]) assert.ok(dockerfile.includes(fragment), `Devcontainer is missing ${fragment}`);
});

test("tooling unit tests do not depend on undeclared system binaries", async () => {
  const files = (await readdir(toolingTestUrl, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"));
  const forbiddenImport = /from\s+["']node:child_process["']/;
  for (const file of files) {
    const source = await readFile(new URL(file.name, toolingTestUrl), "utf8");
    assert.doesNotMatch(source, forbiddenImport, `${file.name} must stay pure Node.js`);
  }
});
