import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

export function parseRegistrationImageInspection(value) {
  const image = Array.isArray(value) && value.length === 1 ? value[0] : null;
  if (
    !image || !digestPattern.test(image.Descriptor?.digest ?? "") ||
    image.Descriptor?.mediaType !== "application/vnd.oci.image.manifest.v1+json" ||
    image.Os !== "linux" || image.Architecture !== "amd64" ||
    typeof image.Config?.User !== "string" || !Array.isArray(image.Config?.Entrypoint)
  ) throw new Error("FCC_REGISTRATION_IMAGE_INSPECTION_INVALID");
  return {
    digest: image.Descriptor.digest,
    mediaType: image.Descriptor.mediaType,
    os: image.Os,
    architecture: image.Architecture,
    user: image.Config.User,
    entrypoint: image.Config.Entrypoint,
  };
}

function isAmd64Elf(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length >= 64 &&
    bytes.subarray(0, 6).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1])) &&
    bytes.readUInt16LE(18) === 62;
}

export function evaluateRegistrationImage({ inspection, binary, binaryMode, recipe }) {
  const binarySha256 = createHash("sha256").update(binary).digest("hex");
  const assertions = {
    releaseDigestMatches:
      digestPattern.test(recipe.releaseImageDigest ?? "") &&
      inspection.digest === recipe.releaseImageDigest,
    platformMatches:
      recipe.platform === "linux/amd64" && inspection.os === "linux" &&
      inspection.architecture === "amd64",
    runtimeUserMatches: inspection.user === "65532:65532",
    entrypointMatches:
      inspection.entrypoint.length === 1 &&
      inspection.entrypoint[0] === "/app/register-tee",
    binaryDigestMatches:
      sha256Pattern.test(recipe.releaseBinarySha256 ?? "") &&
      binarySha256 === recipe.releaseBinarySha256,
    binaryIsElf64Amd64: isAmd64Elf(binary),
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
      entrypoint: inspection.entrypoint,
      binarySha256,
      binaryBytes: binary.length,
      binaryMode: (binaryMode & 0o777).toString(8).padStart(3, "0"),
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

export function buildRegistrationImage(repositoryRoot, recipe) {
  const result = spawnSync("docker", [
    "buildx", "build", "--platform", recipe.platform, "--load",
    "--provenance=mode=max", "--sbom=true", "--tag", recipe.releaseImageTag,
    "--file", recipe.dockerfile, ".",
  ], { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) throw new Error("FCC_REGISTRATION_IMAGE_BUILD_FAILED");
}

export function verifyLocalRegistrationImage(repositoryRoot, recipe) {
  const inspection = parseRegistrationImageInspection(JSON.parse(run("docker", [
    "image", "inspect", "--platform", recipe.platform, recipe.releaseImageTag,
  ], { cwd: repositoryRoot })));
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "veilbid-register-image-"));
  const temporaryBinary = join(temporaryDirectory, "register-tee");
  const containerName = `veilbid-register-verify-${process.pid}-${Date.now()}`;
  let created = false;
  try {
    run("docker", ["create", "--name", containerName, recipe.releaseImageTag], {
      cwd: repositoryRoot,
    });
    created = true;
    run("docker", ["cp", `${containerName}:/app/register-tee`, temporaryBinary], {
      cwd: repositoryRoot,
    });
    return evaluateRegistrationImage({
      inspection,
      binary: readFileSync(temporaryBinary),
      binaryMode: statSync(temporaryBinary).mode,
      recipe,
    });
  } finally {
    if (created) spawnSync("docker", ["rm", containerName], { cwd: repositoryRoot });
    rmSync(resolve(temporaryDirectory), { recursive: true, force: true });
  }
}
