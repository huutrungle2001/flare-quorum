import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const foundations = JSON.parse(readFileSync(
  resolve(root, "tooling/flare/coston2-foundations.json"),
  "utf8",
));
const slitherPolicy = JSON.parse(readFileSync(
  resolve(root, "tooling/flare/slither-v2-allowlist.json"),
  "utf8",
));
const expected = {
  node: foundations.toolchains.node.version,
  pnpm: foundations.toolchains.pnpm.version,
  go: foundations.toolchains.go.version,
  foundry: foundations.toolchains.foundry.version,
  slither: slitherPolicy.slitherVersion,
};

function probe(command, args, matches) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  return {
    available: result.status === 0,
    matches: result.status === 0 && matches(output),
    output: output.split("\n")[0] ?? "",
  };
}

const tools = {
  node: {
    available: true,
    matches: process.version === `v${expected.node}`,
    output: process.version,
  },
  pnpm: probe("pnpm", ["--version"], (output) =>
    output.split(/\r?\n/, 1)[0] === expected.pnpm),
  go: probe("go", ["version"], (output) => output.includes(`go${expected.go}`)),
  foundry: probe("forge", ["--version"], (output) =>
    output.includes(`Version: ${expected.foundry}`)),
  slither: probe("slither", ["--version"], (output) =>
    output.includes(expected.slither)),
};
const blockers = Object.entries(tools).flatMap(([name, result]) => {
  if (!result.available) return [`TOOLCHAIN_${name.toUpperCase()}_UNAVAILABLE`];
  if (!result.matches) return [`TOOLCHAIN_${name.toUpperCase()}_VERSION_MISMATCH`];
  return [];
});
const report = {
  schemaVersion: 1,
  suite: "flarequorum-release-toolchain",
  status: blockers.length === 0 ? "PASSED" : "BLOCKED",
  expected,
  tools,
  blockers,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (blockers.length > 0) process.exitCode = 1;
