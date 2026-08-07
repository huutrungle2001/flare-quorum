import { createHash } from "node:crypto";

export function evaluateCloudflaredInstallation({ bytes, mode, versionOutput, recipe }) {
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  const assertions = {
    binaryDigestMatches: actualSha256 === recipe.sha256,
    binaryIsOwnerExecutableOnly: (mode & 0o777) === 0o500,
    versionMatches: versionOutput.startsWith(`cloudflared version ${recipe.version} `),
  };
  return {
    status: Object.values(assertions).every(Boolean) ? "PASSED" : "FAILED",
    assertions,
    publicIdentifiers: {
      version: recipe.version,
      sha256: actualSha256,
      mode: (mode & 0o777).toString(8).padStart(3, "0"),
      source: recipe.source,
    },
  };
}
