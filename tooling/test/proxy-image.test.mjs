import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  evaluateProxyImage,
  inspectAmd64Elf,
  parseProxyImageInspection,
} from "../flare/proxy-image.mjs";

const digest = `sha256:${"11".repeat(32)}`;
const binary = Buffer.alloc(64);
binary.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
binary.writeUInt16LE(62, 18);

const inspection = parseProxyImageInspection([{
  Descriptor: {
    digest,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
  },
  Os: "linux",
  Architecture: "amd64",
  Config: { User: "65532:65532", Entrypoint: ["/app/tee-proxy"] },
}]);

test("parses only the executable linux/amd64 OCI manifest", () => {
  assert.equal(inspection.digest, digest);
  assert.equal(inspectAmd64Elf(binary), true);
  assert.throws(
    () => parseProxyImageInspection([{ ...inspection, Descriptor: { digest } }]),
    /TEE_PROXY_IMAGE_INSPECTION_INVALID/,
  );
});

test("requires exact digest, binary, non-root user, entrypoint, and read-only mode", () => {
  const binarySha256 = createHash("sha256").update(binary).digest("hex");
  const result = evaluateProxyImage({
    inspection,
    binary,
    binaryMode: 0o100555,
    recipe: {
      platform: "linux/amd64",
      releaseImageTag: "flarequorum/tee-proxy:test",
      releaseImageDigest: digest,
      releaseBinarySha256: binarySha256,
    },
  });
  assert.equal(result.status, "PASSED");
  assert.ok(Object.values(result.assertions).every(Boolean));
  assert.equal(evaluateProxyImage({
    inspection,
    binary,
    binaryMode: 0o100755,
    recipe: {
      platform: "linux/amd64",
      releaseImageTag: "flarequorum/tee-proxy:test",
      releaseImageDigest: digest,
      releaseBinarySha256: binarySha256,
    },
  }).status, "FAILED");
});
