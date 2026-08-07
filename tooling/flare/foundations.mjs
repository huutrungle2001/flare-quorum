import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const registryAbi = parseAbi([
  "function getContractAddressByName(string) view returns (address)",
]);
const managerAbi = parseAbi([
  "function nextPublicExtensionId() view returns (uint256)",
  "function getTeeMachineStatus(address) view returns (uint8)",
]);
const assetManagerAbi = parseAbi([
  "function fAsset() view returns (address)",
  "function directMintingPaymentAddress() view returns (string)",
  "function getDirectMintingFeeBIPS() view returns (uint256)",
  "function getDirectMintingMinimumFeeUBA() view returns (uint256)",
]);
const fdcHubAbi = parseAbi([
  "function fdcRequestFeeConfigurations() view returns (address)",
]);
const fdcVerificationAbi = parseAbi([
  "function fdcProtocolId() view returns (uint8)",
]);
const flareSystemsManagerAbi = parseAbi([
  "function firstVotingRoundStartTs() view returns (uint64)",
  "function votingEpochDurationSeconds() view returns (uint64)",
]);
const erc20MetadataAbi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const ftsoAbi = parseAbi([
  "function getFeedById(bytes21) returns (uint256 value, int8 decimals, uint64 timestamp)",
  "function getSupportedFeedIds() view returns (bytes21[])",
]);

function command(program, args) {
  const result = spawnSync(program, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: result.status === 0 ? result.stdout.trim() : "",
  };
}

export function parseVersion(value) {
  const match = String(value).match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:\s|$)/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

export function versionAtLeast(value, minimum) {
  const actual = parseVersion(value);
  const required = parseVersion(minimum);
  if (!actual || !required) return false;
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) {
      return actual[index] > required[index];
    }
  }
  return true;
}

export function isStableProxyUrl(value, forbiddenSuffix) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      !url.hostname.endsWith(forbiddenSuffix) &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1" &&
      !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash
    );
  } catch {
    return false;
  }
}

export function gateStatus(assertions) {
  return Object.values(assertions).every(Boolean) ? "PASSED" : "IN_PROGRESS";
}

function isSha256Digest(value) {
  return /^sha256:[0-9a-f]{64}$/.test(value ?? "");
}

export function verifyTeeProxyReleaseRecipe(source, recipe) {
  if (!recipe || typeof source !== "string") return false;
  const sourceDigest = `sha256:${recipe.sourceSha256}`;
  const requiredFragments = [
    `# syntax=${recipe.dockerfileFrontend}`,
    `FROM --platform=${recipe.platform} ${recipe.builderImage} AS builder`,
    `ADD --checksum=${sourceDigest}`,
    recipe.sourceUrl,
    `Revision=${recipe.sourceCommit}`,
    `FROM --platform=${recipe.platform} ${recipe.runtimeImage}`,
    "go mod verify",
    "-buildvcs=false",
    "USER 65532:65532",
    'ENTRYPOINT ["/app/tee-proxy"]',
  ];
  return (
    /^[0-9a-f]{40}$/.test(recipe.sourceCommit ?? "") &&
    /^[0-9a-f]{64}$/.test(recipe.sourceSha256 ?? "") &&
    isSha256Digest(recipe.builderImage?.split("@")[1]) &&
    isSha256Digest(recipe.runtimeImage?.split("@")[1]) &&
    isSha256Digest(recipe.dockerfileFrontend?.split("@")[1]) &&
    requiredFragments.every((fragment) => source.includes(fragment))
  );
}

export function verifyTeeRegistrationReleaseRecipe(source, recipe) {
  if (!recipe || typeof source !== "string") return false;
  const requiredFragments = [
    `# syntax=${recipe.dockerfileFrontend}`,
    `FROM --platform=${recipe.platform} ${recipe.builderImage} AS builder`,
    `ADD --checksum=sha256:${recipe.sourceSha256}`,
    recipe.sourceUrl,
    `go mod edit -require=github.com/flare-foundation/tee-node@v${recipe.teeNodeModuleVersion}`,
    `go mod edit -require=github.com/flare-foundation/go-flare-common@${recipe.goFlareCommonModuleVersion}`,
    "go get ./cmd/register-tee",
    "go mod verify",
    "go build -mod=readonly -trimpath -buildvcs=false",
    `FROM --platform=${recipe.platform} ${recipe.runtimeImage}`,
    "COPY --chmod=0555 --chown=65532:65532 --from=builder /out/register-tee /app/register-tee",
    "USER 65532:65532",
    'ENTRYPOINT ["/app/register-tee"]',
  ];
  return (
    /^[0-9a-f]{40}$/.test(recipe.sourceCommit ?? "") &&
    /^[0-9a-f]{64}$/.test(recipe.sourceSha256 ?? "") &&
    versionAtLeast(recipe.teeNodeModuleVersion, "0.0.22") &&
    requiredFragments.every((fragment) => source.includes(fragment))
  );
}

export function verifyFccExtensionReleaseRecipe(source, recipe) {
  if (!recipe || typeof source !== "string") return false;
  const requiredFragments = [
    `# syntax=${recipe.dockerfileFrontend}`,
    `FROM ${recipe.builderImage} AS builder`,
    `FROM ${recipe.runtimeImage}`,
    "go mod download && go mod verify",
    'GOFLAGS="-buildvcs=false"',
    "go build -trimpath",
    "COPY --chmod=555 --chown=0:0 --from=builder /app/extension-tee /app/extension-tee",
    "ENV MODE=0",
    "CHAIN_ID=114",
    "SEALED_STORE_DIR=/var/lib/veilbid/sealed",
    "USER 0:0",
    'VOLUME ["/var/lib/veilbid/sealed"]',
    'CMD ["/app/extension-tee"]',
  ];
  return (
    recipe.context === "apps/fcc-extension" &&
    /^\d+\.\d+\.\d+$/.test(recipe.version ?? "") &&
    isSha256Digest(recipe.builderImage?.split("@")[1]) &&
    isSha256Digest(recipe.runtimeImage?.split("@")[1]) &&
    isSha256Digest(recipe.dockerfileFrontend?.split("@")[1]) &&
    requiredFragments.every((fragment) => source.includes(fragment))
  );
}

export function verifyFccRuntimeAlignment(extensionGoMod, teeNode, teeProxy) {
  if (
    typeof extensionGoMod !== "string" || !teeNode || !teeProxy ||
    typeof teeNode.tag !== "string" ||
    typeof teeProxy.teeNodeModuleVersion !== "string"
  ) return false;
  const selectedVersion = teeNode.tag.replace(/^v/, "");
  const moduleMatch = extensionGoMod.match(
    /^\s*(?:require\s+)?github\.com\/flare-foundation\/tee-node\s+v([^\s]+)\s*$/mu,
  );
  return (
    moduleMatch?.[1] === selectedVersion &&
    teeProxy.teeNodeModuleVersion === selectedVersion &&
    versionAtLeast(selectedVersion, teeNode.minimumOrganizerVersion)
  );
}

export function normalizePrivateKey(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

export async function verifyPinnedSources(sourceFiles, fetchImplementation = fetch) {
  const checks = await Promise.all(
    sourceFiles.map(async ({ id, url, sha256 }) => {
      const response = await fetchImplementation(url, {
        headers: { accept: "application/octet-stream" },
      });
      if (!response.ok) return { id, matches: false };
      const bytes = Buffer.from(await response.arrayBuffer());
      const actual = createHash("sha256").update(bytes).digest("hex");
      return { id, matches: actual === sha256 };
    }),
  );
  return checks;
}

export function readFoundationManifest(repositoryRoot) {
  return JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "tooling/flare/coston2-foundations.json"),
      "utf8",
    ),
  );
}

function addBlocker(blockers, assertion, code) {
  if (!assertion) blockers.push(code);
}

export async function inspectFoundations({
  repositoryRoot,
  environment = process.env,
  fetchImplementation = fetch,
}) {
  const manifest = readFoundationManifest(repositoryRoot);
  const fccExtensionRecipe = manifest.docker.fccExtensionReleaseRecipe;
  const fccExtensionDockerfile = readFileSync(
    resolve(repositoryRoot, fccExtensionRecipe.dockerfile),
    "utf8",
  );
  const fccExtensionBuildInputsPinned = verifyFccExtensionReleaseRecipe(
    fccExtensionDockerfile,
    fccExtensionRecipe,
  );
  const fccExtensionGoMod = readFileSync(
    resolve(repositoryRoot, "apps/fcc-extension/go.mod"),
    "utf8",
  );
  const fccRuntimeVersionsAligned = verifyFccRuntimeAlignment(
    fccExtensionGoMod,
    manifest.upstreams.teeNode,
    manifest.upstreams.teeProxy,
  );
  const teeProxyRecipe = manifest.docker.teeProxyReleaseRecipe;
  const teeProxyDockerfile = readFileSync(
    resolve(repositoryRoot, teeProxyRecipe.dockerfile),
    "utf8",
  );
  const teeProxyBuildInputsPinned = verifyTeeProxyReleaseRecipe(
    teeProxyDockerfile,
    teeProxyRecipe,
  );
  const teeRegistrationRecipe = manifest.docker.teeRegistrationReleaseRecipe;
  const teeRegistrationDockerfile = readFileSync(
    resolve(repositoryRoot, teeRegistrationRecipe.dockerfile),
    "utf8",
  );
  const teeRegistrationBuildInputsPinned = verifyTeeRegistrationReleaseRecipe(
    teeRegistrationDockerfile,
    teeRegistrationRecipe,
  );
  const rpcUrl = environment[manifest.network.rpcEnvironmentVariable];
  if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");

  const client = createPublicClient({
    transport: http(rpcUrl, { retryCount: 2, timeout: 20_000 }),
  });
  const declaredDeployer = getAddress(manifest.network.declaredDeployer);
  const blockNumber = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber });
  const [chainId, deployerBalance, sourceChecks] = await Promise.all([
    client.getChainId(),
    client.getBalance({ address: declaredDeployer, blockNumber }),
    verifyPinnedSources(manifest.sourceFiles, fetchImplementation),
  ]);

  const codeSizes = {};
  for (const [name, address] of Object.entries(manifest.contracts)) {
    const bytecode = await client.getBytecode({
      address: getAddress(address),
      blockNumber,
    });
    codeSizes[name] = bytecode ? (bytecode.length - 2) / 2 : 0;
  }

  const registryResults = {};
  for (const [name, expected] of Object.entries(manifest.registryNames)) {
    registryResults[name] = await client.readContract({
      address: getAddress(manifest.contracts.flareContractRegistry),
      abi: registryAbi,
      functionName: "getContractAddressByName",
      args: [name],
      blockNumber,
    });
    registryResults[name] = getAddress(registryResults[name]);
    if (registryResults[name] !== getAddress(expected)) {
      registryResults[name] = `${registryResults[name]}:MISMATCH`;
    }
  }

  const [
    nextPublicExtensionId,
    fAsset,
    fTestXrpSymbol,
    fTestXrpName,
    fTestXrpDecimals,
    feed,
    supportedFeedIds,
    fdcFeeConfig,
    fdcProtocolId,
    firstVotingRoundStartTs,
    votingEpochDurationSeconds,
    directMintingPaymentAddress,
    directMintingFeeBIPS,
    directMintingMinimumFeeUBA,
  ] = await Promise.all([
    client.readContract({
      address: getAddress(manifest.contracts.flareTeeManager),
      abi: managerAbi,
      functionName: "nextPublicExtensionId",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.assetManagerFXRP),
      abi: assetManagerAbi,
      functionName: "fAsset",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.fTestXRP),
      abi: erc20MetadataAbi,
      functionName: "symbol",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.fTestXRP),
      abi: erc20MetadataAbi,
      functionName: "name",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.fTestXRP),
      abi: erc20MetadataAbi,
      functionName: "decimals",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.ftsoV2),
      abi: ftsoAbi,
      functionName: "getFeedById",
      args: [manifest.xrpUsdFeed.id],
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.ftsoV2),
      abi: ftsoAbi,
      functionName: "getSupportedFeedIds",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.fdcHub),
      abi: fdcHubAbi,
      functionName: "fdcRequestFeeConfigurations",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.fdcVerification),
      abi: fdcVerificationAbi,
      functionName: "fdcProtocolId",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.flareSystemsManager),
      abi: flareSystemsManagerAbi,
      functionName: "firstVotingRoundStartTs",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.flareSystemsManager),
      abi: flareSystemsManagerAbi,
      functionName: "votingEpochDurationSeconds",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.assetManagerFXRP),
      abi: assetManagerAbi,
      functionName: "directMintingPaymentAddress",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.assetManagerFXRP),
      abi: assetManagerAbi,
      functionName: "getDirectMintingFeeBIPS",
      blockNumber,
    }),
    client.readContract({
      address: getAddress(manifest.contracts.assetManagerFXRP),
      abi: assetManagerAbi,
      functionName: "getDirectMintingMinimumFeeUBA",
      blockNumber,
    }),
  ]);

  const nodeCheck = command("node", ["--version"]);
  const pnpmCheck = command("corepack", ["pnpm", "--version"]);
  const goCheck = command("go", ["version"]);
  const forgeCheck = command("forge", ["--version"]);
  const dockerCheck = command("docker", ["version", "--format", "{{.Server.Version}}"]);
  const fccExtensionImageCheck = command("docker", [
    "image",
    "inspect",
    "--platform",
    fccExtensionRecipe.platform,
    fccExtensionRecipe.releaseImageTag ?? "",
    "--format",
    "{{.Descriptor.digest}}",
  ]);
  const teeProxyImageCheck = command("docker", [
    "image",
    "inspect",
    "--platform",
    teeProxyRecipe.platform,
    teeProxyRecipe.releaseImageTag ?? "",
    "--format",
    "{{.Descriptor.digest}}",
  ]);
  const teeRegistrationImageCheck = command("docker", [
    "image",
    "inspect",
    "--platform",
    teeRegistrationRecipe.platform,
    teeRegistrationRecipe.releaseImageTag ?? "",
    "--format",
    "{{.Descriptor.digest}}",
  ]);
  const privateKey = normalizePrivateKey(environment.FLARE_DEPLOYMENT_PRIVATE_KEY);
  const deploymentKeyMatchesDeclaredWallet = privateKey
    ? privateKeyToAccount(privateKey).address === declaredDeployer
    : false;

  const stableProxyUrls = String(environment[
    manifest.externalRequirements.stableProxyEnvironmentVariable
  ] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const stableProxyConfigured =
    stableProxyUrls.length === manifest.externalRequirements.requiredMachineCount &&
    new Set(stableProxyUrls).size === manifest.externalRequirements.requiredMachineCount &&
    stableProxyUrls.every((url) => isStableProxyUrl(
      url,
      manifest.externalRequirements.forbiddenProxyHostnameSuffix,
    ));
  let stableProxyReachable = false;
  if (stableProxyConfigured) {
    try {
      const responses = await Promise.all(stableProxyUrls.map((url) =>
        fetchImplementation(`${url.replace(/\/$/, "")}/info`, {
          headers: { accept: "application/json" },
        })
      ));
      stableProxyReachable = responses.every((response) => response.ok);
    } catch {
      stableProxyReachable = false;
    }
  }

  const machineIds = String(
    environment[manifest.externalRequirements.machineIdsEnvironmentVariable] ?? "",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  let productionMachineCount = 0;
  for (const machineId of machineIds) {
    try {
      const status = await client.readContract({
        address: getAddress(manifest.contracts.flareTeeManager),
        abi: managerAbi,
        functionName: "getTeeMachineStatus",
        args: [getAddress(machineId)],
        blockNumber,
      });
      if (status === manifest.externalRequirements.requiredMachineStatus) {
        productionMachineCount += 1;
      }
    } catch {
      // An invalid or unregistered public machine identifier is simply not ready.
    }
  }

  const indexerConfigured = manifest.externalRequirements.indexerEnvironmentVariables.every(
    (name) => Boolean(environment[name]),
  );
  const registryDiscoveryMatches = Object.values(registryResults).every(
    (value) => !value.endsWith(":MISMATCH"),
  );
  const [feedValue, feedDecimals, feedTimestamp] = feed;
  const assertions = {
    chainIdMatches: chainId === manifest.network.chainId,
    deploymentKeyMatchesDeclaredWallet,
    deployerHasMinimumGas:
      deployerBalance >= BigInt(manifest.network.minimumGasBalanceWei),
    allDiscoveredContractsHaveCode: Object.values(codeSizes).every(
      (size) => size > 0,
    ),
    pinnedSourceHashesMatch: sourceChecks.every(({ matches }) => matches),
    nodeVersionPinned:
      nodeCheck.ok && nodeCheck.output === `v${manifest.toolchains.node.version}`,
    pnpmVersionPinned:
      pnpmCheck.ok && pnpmCheck.output === manifest.toolchains.pnpm.version,
    goVersionPinned:
      goCheck.ok && goCheck.output.includes(`go${manifest.toolchains.go.version}`),
    foundryVersionPinned:
      forgeCheck.ok &&
      forgeCheck.output.includes(`Version: ${manifest.toolchains.foundry.version}`) &&
      forgeCheck.output.includes(manifest.toolchains.foundry.commit),
    teeNodeMinimumSatisfied: versionAtLeast(
      manifest.upstreams.teeNode.tag,
      manifest.upstreams.teeNode.minimumOrganizerVersion,
    ),
    managerInterfaceResponds: nextPublicExtensionId >= 65_536n,
    registryDiscoveryMatches,
    fTestXrpBindingMatches:
      getAddress(fAsset) === getAddress(manifest.contracts.fTestXRP) &&
      fTestXrpSymbol === "FTestXRP" &&
      fTestXrpName === "FXRP" &&
      fTestXrpDecimals === 6,
    fdcProtocolBindingsLive:
      getAddress(fdcFeeConfig) ===
        getAddress(manifest.contracts.fdcRequestFeeConfigurations) &&
      fdcProtocolId === 200 &&
      firstVotingRoundStartTs > 0n &&
      votingEpochDurationSeconds > 0n,
    fAssetsDirectMintingBindingsLive:
      directMintingPaymentAddress.trim().length > 0 &&
      directMintingFeeBIPS > 0n &&
      directMintingFeeBIPS < 10_000n &&
      directMintingMinimumFeeUBA > 0n,
    xrpUsdFeedIsLive:
      feedValue > 0n &&
      feedDecimals >= 0 &&
      supportedFeedIds.some(
        (feedId) => feedId.toLowerCase() === manifest.xrpUsdFeed.id.toLowerCase(),
      ) &&
      BigInt(block.timestamp) >= BigInt(feedTimestamp) &&
      BigInt(block.timestamp) - BigInt(feedTimestamp) <= 300n,
    dockerDaemonAvailable: dockerCheck.ok,
    fccRuntimeVersionsAligned,
    fccExtensionBuildInputsPinned,
    fccExtensionReleaseImageDigestRecorded: isSha256Digest(
      fccExtensionRecipe.releaseImageDigest,
    ),
    fccExtensionReleaseImageVerified:
      dockerCheck.ok && fccExtensionImageCheck.ok &&
      fccExtensionImageCheck.output === fccExtensionRecipe.releaseImageDigest,
    teeProxyBuildInputsPinned,
    teeProxyReleaseImageDigestRecorded: isSha256Digest(
      teeProxyRecipe.releaseImageDigest,
    ),
    teeProxyReleaseImageVerified:
      dockerCheck.ok && teeProxyImageCheck.ok &&
      teeProxyImageCheck.output === teeProxyRecipe.releaseImageDigest,
    teeRegistrationBuildInputsPinned,
    teeRegistrationReleaseImageDigestRecorded: isSha256Digest(
      teeRegistrationRecipe.releaseImageDigest,
    ),
    teeRegistrationReleaseImageVerified:
      dockerCheck.ok && teeRegistrationImageCheck.ok &&
      teeRegistrationImageCheck.output === teeRegistrationRecipe.releaseImageDigest,
    stableProxyConfigured,
    stableProxyReachable,
    indexerConfigured,
    threeProductionMachinesRegistered:
      machineIds.length === manifest.externalRequirements.requiredMachineCount &&
      productionMachineCount === manifest.externalRequirements.requiredMachineCount,
  };

  const blockers = [];
  addBlocker(blockers, assertions.deploymentKeyMatchesDeclaredWallet, "DEPLOYMENT_KEY_NOT_READY");
  addBlocker(blockers, assertions.dockerDaemonAvailable, "DOCKER_DAEMON_UNAVAILABLE");
  addBlocker(
    blockers,
    assertions.fccRuntimeVersionsAligned,
    "FCC_NODE_PROXY_WIRE_VERSION_MISMATCH",
  );
  addBlocker(
    blockers,
    assertions.fccExtensionBuildInputsPinned,
    "FCC_EXTENSION_BUILD_INPUTS_UNPINNED",
  );
  addBlocker(
    blockers,
    assertions.fccExtensionReleaseImageDigestRecorded,
    "FCC_EXTENSION_RELEASE_IMAGE_DIGEST_MISSING",
  );
  addBlocker(
    blockers,
    assertions.fccExtensionReleaseImageVerified,
    "FCC_EXTENSION_RELEASE_IMAGE_NOT_VERIFIED",
  );
  addBlocker(
    blockers,
    assertions.teeProxyBuildInputsPinned,
    "TEE_PROXY_BUILD_INPUTS_UNPINNED",
  );
  addBlocker(
    blockers,
    assertions.teeProxyReleaseImageDigestRecorded,
    "TEE_PROXY_RELEASE_IMAGE_DIGEST_MISSING",
  );
  addBlocker(
    blockers,
    assertions.teeProxyReleaseImageVerified,
    "TEE_PROXY_RELEASE_IMAGE_NOT_VERIFIED",
  );
  addBlocker(
    blockers,
    assertions.teeRegistrationBuildInputsPinned,
    "TEE_REGISTRATION_BUILD_INPUTS_UNPINNED",
  );
  addBlocker(
    blockers,
    assertions.teeRegistrationReleaseImageDigestRecorded,
    "TEE_REGISTRATION_RELEASE_IMAGE_DIGEST_MISSING",
  );
  addBlocker(
    blockers,
    assertions.teeRegistrationReleaseImageVerified,
    "TEE_REGISTRATION_RELEASE_IMAGE_NOT_VERIFIED",
  );
  addBlocker(blockers, assertions.stableProxyConfigured, "STABLE_PROXY_NOT_CONFIGURED");
  addBlocker(blockers, assertions.stableProxyReachable, "STABLE_PROXY_NOT_REACHABLE");
  addBlocker(blockers, assertions.indexerConfigured, "FCC_INDEXER_NOT_CONFIGURED");
  addBlocker(
    blockers,
    assertions.threeProductionMachinesRegistered,
    "THREE_PRODUCTION_MACHINES_NOT_VERIFIED",
  );

  return {
    schemaVersion: 1,
    gate: "0",
    status: gateStatus(assertions),
    recordedAt: new Date().toISOString(),
    sourceCommit: command("git", ["-C", repositoryRoot, "rev-parse", "HEAD"]).output,
    network: {
      name: manifest.network.name,
      chainId,
      blockNumber: blockNumber.toString(),
      blockTimestamp: Number(block.timestamp),
    },
    publicIdentifiers: {
      deployer: declaredDeployer,
      deployerGasBalanceWei: deployerBalance.toString(),
      contracts: manifest.contracts,
      contractCodeSizes: codeSizes,
      nextPublicExtensionId: nextPublicExtensionId.toString(),
      xrpUsdFeed: {
        id: manifest.xrpUsdFeed.id,
        value: feedValue.toString(),
        decimals: Number(feedDecimals),
        timestamp: Number(feedTimestamp),
      },
      fTestXRP: {
        address: manifest.contracts.fTestXRP,
        symbol: fTestXrpSymbol,
        name: fTestXrpName,
        decimals: fTestXrpDecimals,
      },
      fdc: {
        hub: manifest.contracts.fdcHub,
        requestFeeConfigurations: getAddress(fdcFeeConfig),
        verification: manifest.contracts.fdcVerification,
        protocolId: Number(fdcProtocolId),
        firstVotingRoundStartTs: Number(firstVotingRoundStartTs),
        votingEpochDurationSeconds: Number(votingEpochDurationSeconds),
      },
      fAssetsDirectMinting: {
        assetManager: manifest.contracts.assetManagerFXRP,
        paymentAddress: directMintingPaymentAddress,
        feeBIPS: directMintingFeeBIPS.toString(),
        minimumFeeUBA: directMintingMinimumFeeUBA.toString(),
      },
      selectedUpstreamCommits: Object.fromEntries(
        Object.entries(manifest.upstreams).map(([name, source]) => [
          name,
          source.commit,
        ]),
      ),
      sourceChecks,
      fccRuntimeCompatibility: {
        extensionTeeNodeVersion: manifest.upstreams.teeNode.tag,
        teeProxySourceCommit: manifest.upstreams.teeProxy.commit,
        teeProxyTeeNodeVersion: `v${manifest.upstreams.teeProxy.teeNodeModuleVersion}`,
      },
      fccExtensionReleaseRecipe: {
        dockerfile: fccExtensionRecipe.dockerfile,
        context: fccExtensionRecipe.context,
        platform: fccExtensionRecipe.platform,
        version: fccExtensionRecipe.version,
        builderImage: fccExtensionRecipe.builderImage,
        runtimeImage: fccExtensionRecipe.runtimeImage,
        releaseImageTag: fccExtensionRecipe.releaseImageTag,
        releaseImageDigest: fccExtensionRecipe.releaseImageDigest,
        releaseBinarySha256: fccExtensionRecipe.releaseBinarySha256,
      },
      teeProxyReleaseRecipe: {
        dockerfile: teeProxyRecipe.dockerfile,
        platform: teeProxyRecipe.platform,
        sourceCommit: teeProxyRecipe.sourceCommit,
        sourceSha256: teeProxyRecipe.sourceSha256,
        builderImage: teeProxyRecipe.builderImage,
        runtimeImage: teeProxyRecipe.runtimeImage,
        releaseImageTag: teeProxyRecipe.releaseImageTag,
        releaseImageDigest: teeProxyRecipe.releaseImageDigest,
        releaseBinarySha256: teeProxyRecipe.releaseBinarySha256,
      },
      teeRegistrationReleaseRecipe: {
        dockerfile: teeRegistrationRecipe.dockerfile,
        platform: teeRegistrationRecipe.platform,
        sourceCommit: teeRegistrationRecipe.sourceCommit,
        sourceSha256: teeRegistrationRecipe.sourceSha256,
        teeNodeModuleVersion: teeRegistrationRecipe.teeNodeModuleVersion,
        goFlareCommonModuleVersion: teeRegistrationRecipe.goFlareCommonModuleVersion,
        builderImage: teeRegistrationRecipe.builderImage,
        runtimeImage: teeRegistrationRecipe.runtimeImage,
        releaseImageTag: teeRegistrationRecipe.releaseImageTag,
        releaseImageDigest: teeRegistrationRecipe.releaseImageDigest,
        releaseBinarySha256: teeRegistrationRecipe.releaseBinarySha256,
      },
      configuredMachineCount: machineIds.length,
      productionMachineCount,
    },
    assertions,
    blockers,
    notes: [
      "The official scaffold main branch is reference-only; VeilBid pins the organizer-directed tee-node module and tee-proxy release recipe independently.",
      "The VeilBid extension build inputs and executable linux/amd64 image digest are pinned and locally verifiable without recording runtime secrets.",
      "The tee-proxy build inputs and executable linux/amd64 image digest are pinned and verified against the local Docker content store.",
      "The official register-tee operator is checksum-pinned, aligned to the selected FCC wire/ABI modules, and verified as a separate non-root image.",
      "No RPC URL, deployment key, indexer credential, proxy response, or machine secret is recorded.",
      "Simulated TEE mode is the declared Coston2 judging target; it is not hardware-backed confidentiality.",
    ],
  };
}
