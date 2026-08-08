import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const roots = ["apps", "packages", "tooling"];
const ignoredDirectories = new Set(["artifacts", "cache", "coverage", "dist", "node_modules", "out"]);

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await discover(path));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(path);
  }
  return files;
}

const scripts = (await Promise.all(roots.map((root) => discover(join(repository, root)))))
  .flat()
  .sort();

for (const script of scripts) {
  const result = spawnSync(process.execPath, ["--check", script], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(`Syntax check failed: ${relative(repository, script)}\n`);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(`Syntax-checked ${scripts.length} JavaScript modules.\n`);
