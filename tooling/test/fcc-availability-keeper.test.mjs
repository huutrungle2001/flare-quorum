import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositoryRoot = new URL("../..", import.meta.url);

function text(path) {
  return readFileSync(new URL(path, repositoryRoot), "utf8");
}

test("FCC availability keeper is a bounded non-overlapping Railway cron", () => {
  const configuration = JSON.parse(text("apps/fcc-availability-keeper/railway.json"));
  assert.equal(configuration.build.builder, "DOCKERFILE");
  assert.equal(
    configuration.build.dockerfilePath,
    "apps/fcc-availability-keeper/Dockerfile",
  );
  assert.equal(configuration.deploy.cronSchedule, "17 * * * *");
  assert.equal(configuration.deploy.restartPolicyType, "NEVER");
  assert.equal(
    configuration.deploy.startCommand,
    "node tooling/scripts/register-fcc-machines.mjs --execute",
  );
  assert.equal("healthcheckPath" in configuration.deploy, false);
});

test("FCC availability keeper embeds only the checksum-pinned operator binary", () => {
  const dockerfile = text("apps/fcc-availability-keeper/Dockerfile");
  assert.match(dockerfile, /fce-extension-scaffold\/tar\.gz\/e3f587949069780084e2ced8a53c9419ed05c250/);
  assert.match(dockerfile, /71ccae716c373a3584e8de49aa44e962ade34b489b45836ec6922a70c464d206/);
  assert.match(dockerfile, /FCC_REGISTRATION_BINARY_PATH=\/usr\/local\/bin\/register-tee/);
  assert.match(dockerfile, /FCC_REFRESH_MACHINE_AVAILABILITY=true/);
  assert.match(dockerfile, /USER node/);
  assert.doesNotMatch(dockerfile, /FLARE_DEPLOYMENT_PRIVATE_KEY|FCC_DIRECT_API_KEY/);

  const dockerignore = text(".dockerignore");
  assert.match(dockerignore, /^\.env\.\*$/m);
  assert.match(dockerignore, /^\.local$/m);
  assert.match(dockerignore, /^node_modules$/m);
});

test("repository keeper command fixes the four-hour anti-spam threshold", () => {
  const packageManifest = JSON.parse(text("package.json"));
  assert.match(
    packageManifest.scripts["flare:v2:availability:keep"],
    /FCC_AVAILABILITY_REFRESH_AFTER_SECONDS=14400/,
  );
  assert.match(
    packageManifest.scripts["flare:v2:availability:keep"],
    /register-fcc-machines\.mjs --execute$/,
  );
});
