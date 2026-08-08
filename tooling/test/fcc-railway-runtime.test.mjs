import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const railwayRoot = resolve(root, "apps/fcc-extension/railway");

test("Railway FCC image preserves the approved binary inputs", async () => {
  const [dockerfile, manifestSource, extensionConfig] = await Promise.all([
    readFile(resolve(railwayRoot, "Dockerfile"), "utf8"),
    readFile(resolve(root, "tooling/flare/coston2-foundations.json"), "utf8"),
    readFile(resolve(root, "apps/fcc-extension/internal/config/config.go"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  const proxy = manifest.docker.teeProxyReleaseRecipe;
  const extension = manifest.docker.fccExtensionReleaseRecipe;

  assert.match(dockerfile, new RegExp(proxy.sourceCommit));
  assert.match(dockerfile, new RegExp(proxy.sourceSha256));
  assert.match(dockerfile, /go build -mod=readonly -trimpath -buildvcs=false/);
  assert.match(dockerfile, /go build -trimpath -ldflags="-buildid= -s -w"/);
  assert.match(dockerfile, new RegExp(extension.builderImage.split("@")[1]));
  assert.match(dockerfile, new RegExp(manifest.docker.redisImage.split("@")[1]));
  assert.match(
    extensionConfig,
    new RegExp(`\\bVersion\\s*=\\s*"${manifest.docker.fccExtensionReleaseRecipe.version.replaceAll(".", "\\.")}"`),
  );
  assert.doesNotMatch(dockerfile, /huutrungle2001\/Veilbid(?:\.git)?["'\s]/);
});

test("Railway FCC runtime renders secrets only at startup", async () => {
  const entrypoint = await readFile(resolve(railwayRoot, "entrypoint.sh"), "utf8");
  for (const variable of [
    "FCC_INDEXER_PASSWORD",
    "PROXY_PRIVATE_KEY",
    "FCC_DIRECT_API_KEY",
  ]) {
    assert.match(entrypoint, new RegExp(variable));
  }
  assert.match(entrypoint, /chmod 0600 "\$config_path"/);
  assert.match(entrypoint, /api_key_variable = "FCC_DIRECT_API_KEY"/);
  assert.doesNotMatch(entrypoint, /FLARE_DEPLOYMENT_PRIVATE_KEY/);
  assert.doesNotMatch(entrypoint, /set -x|env\s|printenv/);
});

test("Railway FCC deployment uses its own Dockerfile and info healthcheck", async () => {
  const config = JSON.parse(
    await readFile(resolve(railwayRoot, "railway.json"), "utf8"),
  );
  assert.equal(config.build.builder, "DOCKERFILE");
  assert.equal(
    config.build.dockerfilePath,
    "apps/fcc-extension/railway/Dockerfile",
  );
  assert.equal(config.deploy.healthcheckPath, "/info");
  assert.equal(config.deploy.restartPolicyType, "ALWAYS");
  assert.equal("startCommand" in config.deploy, false);
});
