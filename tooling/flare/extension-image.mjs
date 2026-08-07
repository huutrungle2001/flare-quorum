import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const sha256DigestPattern = /^sha256:[0-9a-f]{64}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const expectedLaunchPolicy = [
  "LOG_LEVEL",
  "PROXY_URL",
  "INITIAL_OWNER",
  "EXTENSION_ID",
  "CHAIN_URL",
  "MODE",
  "CONFIG_PORT",
  "SIGN_PORT",
  "EXTENSION_PORT",
  "SEALED_STORE_DIR",
].join(",");

function exactObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value;
}

export function parseExtensionImageInspection(value) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("FCC_EXTENSION_IMAGE_INSPECTION_INVALID");
  }
  const image = exactObject(value[0], "FCC_EXTENSION_IMAGE_INSPECTION_INVALID");
  const descriptor = exactObject(
    image.Descriptor,
    "FCC_EXTENSION_IMAGE_INSPECTION_INVALID",
  );
  const config = exactObject(
    image.Config,
    "FCC_EXTENSION_IMAGE_INSPECTION_INVALID",
  );
  if (
    !sha256DigestPattern.test(descriptor.digest ?? "") ||
    descriptor.mediaType !== "application/vnd.oci.image.manifest.v1+json" ||
    image.Os !== "linux" || image.Architecture !== "amd64" ||
    typeof config.User !== "string" || !Array.isArray(config.Cmd) ||
    !Array.isArray(config.Env)
  ) throw new Error("FCC_EXTENSION_IMAGE_INSPECTION_INVALID");
  return {
    digest: descriptor.digest,
    mediaType: descriptor.mediaType,
    os: image.Os,
    architecture: image.Architecture,
    user: config.User,
    command: config.Cmd,
    environment: config.Env,
    labels: config.Labels ?? {},
    volumes: config.Volumes ?? {},
  };
}

export function inspectAmd64Elf(bytes) {
  return (
    Buffer.isBuffer(bytes) && bytes.length >= 64 &&
    bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46 &&
    bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(18) === 62
  );
}

function environmentMap(environment) {
  return Object.fromEntries(environment.map((entry) => {
    const separator = entry.indexOf("=");
    return separator < 0
      ? [entry, ""]
      : [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}

export function evaluateExtensionImage({ inspection, binary, binaryMode, recipe }) {
  const binarySha256 = createHash("sha256").update(binary).digest("hex");
  const defaults = environmentMap(inspection.environment);
  const forbiddenEmbeddedNames = [
    "FLARE_DEPLOYMENT_PRIVATE_KEY",
    "PROXY_PRIVATE_KEY",
    "FCC_DIRECT_API_KEY",
    "FCC_INDEXER_PASSWORD",
  ];
  const assertions = {
    releaseDigestMatches:
      sha256DigestPattern.test(recipe.releaseImageDigest ?? "") &&
      inspection.digest === recipe.releaseImageDigest,
    platformMatches:
      recipe.platform === "linux/amd64" &&
      inspection.os === "linux" && inspection.architecture === "amd64",
    runtimeUserMatches: inspection.user === "0:0",
    commandMatches:
      inspection.command.length === 1 &&
      inspection.command[0] === "/app/extension-tee",
    productionAttestationIsDefault: defaults.MODE === "0",
    sealedStoreIsPersistent:
      defaults.SEALED_STORE_DIR === "/var/lib/veilbid/sealed" &&
      Object.hasOwn(inspection.volumes, "/var/lib/veilbid/sealed"),
    launchPolicyIsExact:
      inspection.labels["tee.launch_policy.allow_env_override"] ===
        expectedLaunchPolicy,
    noEmbeddedRuntimeSecrets:
      forbiddenEmbeddedNames.every((name) => !Object.hasOwn(defaults, name)),
    binaryDigestMatches:
      sha256Pattern.test(recipe.releaseBinarySha256 ?? "") &&
      binarySha256 === recipe.releaseBinarySha256,
    binaryIsElf64Amd64: inspectAmd64Elf(binary),
    binaryIsExecutableReadOnly: (binaryMode & 0o777) === 0o555,
  };
  return {
    status: Object.values(assertions).every(Boolean) ? "PASSED" : "FAILED",
    assertions,
    publicIdentifiers: {
      imageTag: recipe.releaseImageTag,
      imageDigest: inspection.digest,
      imageMediaType: inspection.mediaType,
      platform: `${inspection.os}/${inspection.architecture}`,
      runtimeUser: inspection.user,
      command: inspection.command,
      binarySha256,
      binaryBytes: binary.length,
      binaryMode: (binaryMode & 0o777).toString(8).padStart(3, "0"),
      defaultMode: defaults.MODE,
      sealedStore: defaults.SEALED_STORE_DIR,
    },
  };
}

function run(program, args, options = {}) {
  return execFileSync(program, args, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function buildExtensionImage(repositoryRoot, recipe) {
  const result = spawnSync("docker", [
    "buildx", "build",
    "--platform", recipe.platform,
    "--load",
    "--provenance=mode=max",
    "--sbom=true",
    "--tag", recipe.releaseImageTag,
    "--file", recipe.dockerfile,
    recipe.context,
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("FCC_EXTENSION_IMAGE_BUILD_FAILED");
}

export function verifyLocalExtensionImage(repositoryRoot, recipe) {
  const inspection = parseExtensionImageInspection(JSON.parse(run("docker", [
    "image", "inspect", "--platform", recipe.platform, recipe.releaseImageTag,
  ], { cwd: repositoryRoot })));
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "veilbid-extension-image-"));
  const temporaryBinary = join(temporaryDirectory, "extension-tee");
  const containerName = `veilbid-extension-verify-${process.pid}-${Date.now()}`;
  let created = false;
  try {
    run("docker", ["create", "--name", containerName, recipe.releaseImageTag], {
      cwd: repositoryRoot,
    });
    created = true;
    run("docker", ["cp", `${containerName}:/app/extension-tee`, temporaryBinary], {
      cwd: repositoryRoot,
    });
    const binary = readFileSync(temporaryBinary);
    return evaluateExtensionImage({
      inspection,
      binary,
      binaryMode: statSync(temporaryBinary).mode,
      recipe,
    });
  } finally {
    if (created) {
      spawnSync("docker", ["rm", containerName], {
        cwd: repositoryRoot,
        encoding: "utf8",
      });
    }
    rmSync(resolve(temporaryDirectory), { recursive: true, force: true });
  }
}
