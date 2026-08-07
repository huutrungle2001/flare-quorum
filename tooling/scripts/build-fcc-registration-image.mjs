import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { readFoundationManifest } from "../flare/foundations.mjs";
import {
  buildRegistrationImage,
  verifyLocalRegistrationImage,
} from "../flare/registration-image.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const evidencePath = resolve(repositoryRoot, "evidence/coston2/gate-0-registration-image.json");

try {
  const recipe = readFoundationManifest(repositoryRoot).docker.teeRegistrationReleaseRecipe;
  if (process.argv.includes("--build")) buildRegistrationImage(repositoryRoot, recipe);
  const result = verifyLocalRegistrationImage(repositoryRoot, recipe);
  const evidence = {
    schemaVersion: 1,
    gate: "0-registration-image",
    status: result.status,
    recordedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    upstreamSourceCommit: recipe.sourceCommit,
    alignedModules: {
      teeNode: `v${recipe.teeNodeModuleVersion}`,
      goFlareCommon: recipe.goFlareCommonModuleVersion,
    },
    publicIdentifiers: result.publicIdentifiers,
    assertions: result.assertions,
    notes: [
      "This image contains only the pinned official register-tee operator and uses rRap at invocation time.",
      "No deployment key, proxy key, API key, indexer credential, URL, or registration state is copied into the image or evidence.",
    ],
  };
  if (process.argv.includes("--write")) {
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(JSON.stringify({
    gate: evidence.gate,
    status: evidence.status,
    imageDigest: result.publicIdentifiers.imageDigest,
    binarySha256: result.publicIdentifiers.binarySha256,
    assertions: result.assertions,
    evidence: process.argv.includes("--write")
      ? "evidence/coston2/gate-0-registration-image.json"
      : null,
  }));
  if (evidence.status !== "PASSED") process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    gate: "0-registration-image",
    status: "FAILED",
    code: error instanceof Error ? error.message : "FCC_REGISTRATION_IMAGE_VERIFICATION_FAILED",
  }));
  process.exitCode = 1;
}
