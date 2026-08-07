import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { evaluateCloudflaredInstallation } from "../flare/cloudflared.mjs";

test("accepts only the pinned owner-executable cloudflared binary", () => {
  const bytes = Buffer.from("cloudflared-test-binary");
  const recipe = {
    version: "2026.5.2",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source: "https://example.invalid/cloudflared",
  };
  const result = evaluateCloudflaredInstallation({
    bytes,
    mode: 0o100500,
    versionOutput: "cloudflared version 2026.5.2 (built test)",
    recipe,
  });
  assert.equal(result.status, "PASSED");
  assert.equal(evaluateCloudflaredInstallation({
    bytes,
    mode: 0o100755,
    versionOutput: "cloudflared version 2026.5.2 (built test)",
    recipe,
  }).status, "FAILED");
});
