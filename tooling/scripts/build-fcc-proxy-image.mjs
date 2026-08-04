import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { readFoundationManifest } from "../flare/foundations.mjs";
import {
  buildProxyImage,
  verifyLocalProxyImage,
} from "../flare/proxy-image.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const evidencePath = resolve(
  repositoryRoot,
  "evidence/coston2/gate-0-proxy-image.json",
);

try {
  const manifest = readFoundationManifest(repositoryRoot);
  const recipe = manifest.docker.teeProxyReleaseRecipe;
  if (process.argv.includes("--build")) buildProxyImage(repositoryRoot, recipe);
  const result = verifyLocalProxyImage(repositoryRoot, recipe);
  const evidence = {
    schemaVersion: 1,
    gate: "0-proxy-image",
    status: result.status,
    recordedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    upstreamSourceCommit: recipe.sourceCommit,
    buildPolicy: {
      dockerfile: recipe.dockerfile,
      dockerfileFrontend: recipe.dockerfileFrontend,
      platform: recipe.platform,
      builderImage: recipe.builderImage,
      runtimeImage: recipe.runtimeImage,
      provenance: "mode=max",
      sbom: true,
    },
    publicIdentifiers: result.publicIdentifiers,
    assertions: result.assertions,
    notes: [
      "The recorded digest is the executable linux/amd64 OCI manifest, not the timestamp-bearing provenance index.",
      "No runtime configuration, private key, direct API key, or indexer credential is copied into the image or evidence.",
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
      ? "evidence/coston2/gate-0-proxy-image.json"
      : null,
  }));
  if (evidence.status !== "PASSED") process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    gate: "0-proxy-image",
    status: "FAILED",
    code: error instanceof Error ? error.message : "TEE_PROXY_IMAGE_VERIFICATION_FAILED",
  }));
  process.exitCode = 1;
}
