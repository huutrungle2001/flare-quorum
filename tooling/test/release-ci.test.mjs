import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/release-ci.yml", import.meta.url);

test("release CI installs the repository-pinned Foundry before workspace tests", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const install = workflow.indexOf("uses: foundry-rs/foundry-toolchain@v1");
  const version = workflow.indexOf("version: v1.7.1", install);
  const tests = workflow.indexOf("run: pnpm test");
  assert.ok(install > 0, "Foundry action is missing");
  assert.ok(version > install, "Foundry binary version is not pinned");
  assert.ok(tests > version, "Foundry must be installed before workspace tests");
});
