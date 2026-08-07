import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { evaluateCloudflaredInstallation } from "../flare/cloudflared.mjs";
import { readFoundationManifest } from "../flare/foundations.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");

try {
  const recipe = readFoundationManifest(repositoryRoot).toolchains.cloudflared;
  const directory = resolve(repositoryRoot, `.local/toolchains/cloudflared-${recipe.version}`);
  const binaryPath = resolve(directory, "cloudflared");
  if (process.argv.includes("--install")) {
    const response = await fetch(recipe.source, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error("CLOUDFLARED_DOWNLOAD_FAILED");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== recipe.sha256) {
      throw new Error("CLOUDFLARED_DOWNLOAD_DIGEST_MISMATCH");
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(binaryPath, bytes, { mode: 0o500 });
    chmodSync(binaryPath, 0o500);
  }
  if (!existsSync(binaryPath)) throw new Error("CLOUDFLARED_NOT_INSTALLED");
  const bytes = readFileSync(binaryPath);
  const versionOutput = execFileSync(binaryPath, ["--version"], { encoding: "utf8" }).trim();
  const result = evaluateCloudflaredInstallation({
    bytes,
    mode: statSync(binaryPath).mode,
    versionOutput,
    recipe,
  });
  const authenticated = existsSync(resolve(homedir(), ".cloudflared/cert.pem"));
  const output = {
    status: result.status,
    assertions: result.assertions,
    publicIdentifiers: result.publicIdentifiers,
    authenticated,
    blockers: authenticated ? [] : ["CLOUDFLARED_BROWSER_LOGIN_REQUIRED"],
  };
  console.log(JSON.stringify(output));
  if (result.status !== "PASSED") process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    status: "FAILED",
    code: error instanceof Error ? error.message : "CLOUDFLARED_CHECK_FAILED",
  }));
  process.exitCode = 1;
}
