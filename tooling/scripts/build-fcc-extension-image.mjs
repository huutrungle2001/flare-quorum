import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  buildExtensionImage,
  verifyLocalExtensionImage,
} from "../flare/extension-image.mjs";
import { readFoundationManifest } from "../flare/foundations.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const evidencePath = resolve(
  repositoryRoot,
  "evidence/coston2/gate-0-extension-image.json",
);

try {
  const manifest = readFoundationManifest(repositoryRoot);
  const recipe = manifest.docker.fccExtensionReleaseRecipe;
  if (process.argv.includes("--build")) {
    buildExtensionImage(repositoryRoot, recipe);
  }
  const result = verifyLocalExtensionImage(repositoryRoot, recipe);
  const evidence = {
    schemaVersion: 1,
    gate: "0-extension-image",
    status: result.status,
    recordedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    extensionVersion: recipe.version,
    buildPolicy: {
      dockerfile: recipe.dockerfile,
      dockerfileFrontend: recipe.dockerfileFrontend,
      context: recipe.context,
      platform: recipe.platform,
      builderImage: recipe.builderImage,
      runtimeImage: recipe.runtimeImage,
      teeNodeVersion: manifest.upstreams.teeNode.tag,
      teeProxySourceCommit: manifest.upstreams.teeProxy.commit,
      teeProxyTeeNodeVersion: `v${manifest.upstreams.teeProxy.teeNodeModuleVersion}`,
      provenance: "mode=max",
      sbom: true,
    },
    publicIdentifiers: result.publicIdentifiers,
    assertions: result.assertions,
    notes: [
      "The recorded digest is the executable linux/amd64 OCI manifest, not the timestamp-bearing provenance index.",
      "MODE=0 remains the image default. Any simulated Coston2 run must explicitly set MODE=1 and be labeled simulated.",
      "No deployment key, proxy key, direct API key, indexer credential, TEE identity, or bid data is copied into the image or evidence.",
    ],
  };
  if (process.argv.includes("--write")) {
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(JSON.stringify({
    gate: evidence.gate,
    status: evidence.status,
    imageDigest: evidence.publicIdentifiers.imageDigest,
    binarySha256: evidence.publicIdentifiers.binarySha256,
    assertions: evidence.assertions,
    evidence: process.argv.includes("--write")
      ? "evidence/coston2/gate-0-extension-image.json"
      : null,
  }));
  if (evidence.status !== "PASSED") process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    gate: "0-extension-image",
    status: "FAILED",
    code: error instanceof Error
      ? error.message
      : "FCC_EXTENSION_IMAGE_VERIFICATION_FAILED",
  }));
  process.exitCode = 1;
}
