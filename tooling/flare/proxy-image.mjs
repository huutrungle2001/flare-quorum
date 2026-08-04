import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const sha256DigestPattern = /^sha256:[0-9a-f]{64}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

function exactObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value;
}

export function parseProxyImageInspection(value) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("TEE_PROXY_IMAGE_INSPECTION_INVALID");
  }
  const image = exactObject(value[0], "TEE_PROXY_IMAGE_INSPECTION_INVALID");
  const descriptor = exactObject(
    image.Descriptor,
    "TEE_PROXY_IMAGE_INSPECTION_INVALID",
  );
  const config = exactObject(image.Config, "TEE_PROXY_IMAGE_INSPECTION_INVALID");
  if (
    !sha256DigestPattern.test(descriptor.digest ?? "") ||
    descriptor.mediaType !== "application/vnd.oci.image.manifest.v1+json" ||
    image.Os !== "linux" || image.Architecture !== "amd64" ||
    typeof config.User !== "string" || !Array.isArray(config.Entrypoint)
  ) throw new Error("TEE_PROXY_IMAGE_INSPECTION_INVALID");
  return {
    digest: descriptor.digest,
    mediaType: descriptor.mediaType,
    os: image.Os,
    architecture: image.Architecture,
    user: config.User,
    entrypoint: config.Entrypoint,
  };
}

export function inspectAmd64Elf(bytes) {
  return (
    Buffer.isBuffer(bytes) && bytes.length >= 64 &&
    bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46 &&
    bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(18) === 62
  );
}

export function evaluateProxyImage({ inspection, binary, binaryMode, recipe }) {
  const binarySha256 = createHash("sha256").update(binary).digest("hex");
  const assertions = {
    releaseDigestMatches:
      sha256DigestPattern.test(recipe.releaseImageDigest ?? "") &&
      inspection.digest === recipe.releaseImageDigest,
    platformMatches:
      recipe.platform === "linux/amd64" &&
      inspection.os === "linux" && inspection.architecture === "amd64",
    runtimeUserMatches: inspection.user === "65532:65532",
    entrypointMatches:
      inspection.entrypoint.length === 1 &&
      inspection.entrypoint[0] === "/app/tee-proxy",
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

export function buildProxyImage(repositoryRoot, recipe) {
  const result = spawnSync("docker", [
    "buildx", "build",
    "--platform", recipe.platform,
    "--load",
    "--provenance=mode=max",
    "--sbom=true",
    "--tag", recipe.releaseImageTag,
    "--file", recipe.dockerfile,
    ".",
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("TEE_PROXY_IMAGE_BUILD_FAILED");
}

export function verifyLocalProxyImage(repositoryRoot, recipe) {
  const inspection = parseProxyImageInspection(JSON.parse(run("docker", [
    "image", "inspect", "--platform", recipe.platform, recipe.releaseImageTag,
  ], { cwd: repositoryRoot })));
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "veilbid-proxy-image-"));
  const temporaryBinary = join(temporaryDirectory, "tee-proxy");
  const containerName = `veilbid-proxy-verify-${process.pid}-${Date.now()}`;
  let created = false;
  try {
    run("docker", ["create", "--name", containerName, recipe.releaseImageTag], {
      cwd: repositoryRoot,
    });
    created = true;
    run("docker", ["cp", `${containerName}:/app/tee-proxy`, temporaryBinary], {
      cwd: repositoryRoot,
    });
    const binary = readFileSync(temporaryBinary);
    return evaluateProxyImage({
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
