import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function read(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function trackedMarkdown() {
  const result = spawnSync("git", ["ls-files", "*.md"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, "Unable to list tracked Markdown files");
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .filter((file) => existsSync(resolve(repositoryRoot, file)));
}

const requiredFiles = [
  "README.md",
  "PLAN.md",
  "SECURITY.md",
  "docs/original/README.md",
  "docs/original/hackathon-brief.md",
  "docs/hackathon-brief.md",
  "docs/fcc-coston2-operations.md",
  "docs/user-guide.md",
  "docs/deployment.md",
  "docs/product-plan.md",
  "docs/feasibility-plan.md",
  "docs/architecture.md",
  "docs/architecture-decisions.md",
  "docs/contract-spec.md",
  "docs/threat-model.md",
  "docs/verification.md",
  "packages/contracts/deployments/sepolia.release.json",
  "packages/chain-bindings/generated/addresses/sepolia.release.json",
];

for (const file of requiredFiles) {
  assert.equal(existsSync(resolve(repositoryRoot, file)), true, `Missing ${file}`);
}

const manifest = JSON.parse(
  read("packages/contracts/deployments/sepolia.release.json"),
);
const generated = JSON.parse(
  read("packages/chain-bindings/generated/addresses/sepolia.release.json"),
);
const readme = read("README.md");

assert.equal(manifest.kind, "release");
assert.equal(manifest.chainId, 11_155_111);
assert.equal(manifest.verified, true);
assert.deepEqual(generated.contracts, manifest.contracts);

assert.match(readme, /Flare Testnet Coston2 \(`114`\)/);
assert.match(readme, /Primary bounty:\*\* Confidential Compute Apps/);
assert.match(readme, /Phase 0 feasibility validation is complete/i);
assert.match(readme, /pre-hackathon baseline/i);
assert.match(readme, /sepolia\.release\.json/);
assert.match(readme, /Why the new work is meaningful/i);
assert.match(
  readme,
  /multi-criteria offers to three\s+registered simulated FCC machines/i,
);
assert.match(readme, /2-of-3/i);
assert.match(readme, /PLAN\.md/);
assert.match(readme, /docs\/original\/README\.md/);
assert.match(readme, /docs\/hackathon-brief\.md/);
assert.match(readme, /docs\/fcc-coston2-operations\.md/);

const plannedFlareManifest = resolve(
  repositoryRoot,
  "packages/flare-contracts/deployments/coston2.release.json",
);
if (existsSync(plannedFlareManifest)) {
  const flareManifest = JSON.parse(readFileSync(plannedFlareManifest, "utf8"));
  assert.equal(flareManifest.chainId, 114);
  assert.equal(flareManifest.network, "flare-coston2");
  if (flareManifest.verified) {
    for (const [name, contract] of Object.entries(flareManifest.contracts)) {
      assert.match(
        readme,
        new RegExp(contract.address, "i"),
        `README is missing verified Coston2 ${name} address`,
      );
    }
  }
}

const forbidden = [
  /\[DEMO_VIDEO_URL\]/,
  /Waiting for approval/,
  /docs\/demo-and-submission\.md/,
  /settlement-relay\.yml/,
];

const markdownFiles = trackedMarkdown();
for (const file of markdownFiles) {
  const content = read(file);
  for (const pattern of forbidden) {
    assert.doesNotMatch(content, pattern, `${file} contains ${pattern}`);
  }

  for (const match of content.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const cleanTarget = target
      .split("#")[0]
      .replace(/^</, "")
      .replace(/>$/, "");
    if (!cleanTarget) continue;
    const targetPath = resolve(repositoryRoot, dirname(file), cleanTarget);
    assert.equal(
      existsSync(targetPath),
      true,
      `${file} links to missing ${target}`,
    );
  }
}

console.log(
  JSON.stringify({
    status: "ok",
    targetChainId: 114,
    flareReleasePresent: existsSync(plannedFlareManifest),
    historicalBaseline: {
      chainId: manifest.chainId,
      verified: manifest.verified,
      canonicalContracts: Object.keys(manifest.contracts).length,
    },
    markdownFiles: markdownFiles.length,
  }),
);
