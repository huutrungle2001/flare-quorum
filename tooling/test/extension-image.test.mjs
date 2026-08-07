import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  evaluateExtensionImage,
  inspectAmd64Elf,
  parseExtensionImageInspection,
} from "../flare/extension-image.mjs";

const digest = `sha256:${"11".repeat(32)}`;
const binary = Buffer.alloc(64);
binary.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
binary.writeUInt16LE(62, 18);
const launchPolicy = [
  "LOG_LEVEL", "PROXY_URL", "INITIAL_OWNER", "EXTENSION_ID", "CHAIN_ID", "CHAIN_URL",
  "GOVERNANCE_SIGNERS", "GOVERNANCE_THRESHOLD",
  "MODE", "CONFIG_PORT", "SIGN_PORT", "EXTENSION_PORT", "SEALED_STORE_DIR",
].join(",");

const inspection = parseExtensionImageInspection([{
  Descriptor: {
    digest,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
  },
  Os: "linux",
  Architecture: "amd64",
  Config: {
    User: "0:0",
    Cmd: ["/app/extension-tee"],
    Env: ["MODE=0", "CHAIN_ID=114", "SEALED_STORE_DIR=/var/lib/veilbid/sealed"],
    Labels: { "tee.launch_policy.allow_env_override": launchPolicy },
    Volumes: { "/var/lib/veilbid/sealed": {} },
  },
}]);

test("parses only the executable linux/amd64 extension manifest", () => {
  assert.equal(inspection.digest, digest);
  assert.equal(inspectAmd64Elf(binary), true);
  assert.throws(
    () => parseExtensionImageInspection([{
      ...inspection,
      Descriptor: { digest },
    }]),
    /FCC_EXTENSION_IMAGE_INSPECTION_INVALID/,
  );
});

test("requires exact image, binary, safe defaults, volume, and launch policy", () => {
  const binarySha256 = createHash("sha256").update(binary).digest("hex");
  const recipe = {
    platform: "linux/amd64",
    releaseImageTag: "veilbid/fcc-extension:test",
    releaseImageDigest: digest,
    releaseBinarySha256: binarySha256,
  };
  const result = evaluateExtensionImage({
    inspection,
    binary,
    binaryMode: 0o100555,
    recipe,
  });
  assert.equal(result.status, "PASSED");
  assert.ok(Object.values(result.assertions).every(Boolean));
  assert.equal(evaluateExtensionImage({
    inspection: { ...inspection, environment: [
      ...inspection.environment,
      "FLARE_DEPLOYMENT_PRIVATE_KEY=forbidden",
    ] },
    binary,
    binaryMode: 0o100555,
    recipe,
  }).status, "FAILED");
});
