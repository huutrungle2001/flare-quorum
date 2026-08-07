import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  evaluateRegistrationImage,
  parseRegistrationImageInspection,
} from "../flare/registration-image.mjs";

const digest = `sha256:${"11".repeat(32)}`;
const binary = Buffer.alloc(64);
binary.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
binary.writeUInt16LE(62, 18);
const inspection = parseRegistrationImageInspection([{
  Descriptor: { digest, mediaType: "application/vnd.oci.image.manifest.v1+json" },
  Os: "linux",
  Architecture: "amd64",
  Config: { User: "65532:65532", Entrypoint: ["/app/register-tee"] },
}]);

test("accepts only the pinned non-root registration executable", () => {
  const recipe = {
    platform: "linux/amd64",
    releaseImageTag: "veilbid/fcc-register-tee:test",
    releaseImageDigest: digest,
    releaseBinarySha256: createHash("sha256").update(binary).digest("hex"),
  };
  const result = evaluateRegistrationImage({
    inspection,
    binary,
    binaryMode: 0o100555,
    recipe,
  });
  assert.equal(result.status, "PASSED");
  assert.ok(Object.values(result.assertions).every(Boolean));
  assert.equal(evaluateRegistrationImage({
    inspection,
    binary,
    binaryMode: 0o100755,
    recipe,
  }).status, "FAILED");
});

test("rejects malformed registration image inspection", () => {
  assert.throws(
    () => parseRegistrationImageInspection([{ Os: "linux", Architecture: "amd64" }]),
    /FCC_REGISTRATION_IMAGE_INSPECTION_INVALID/,
  );
});
