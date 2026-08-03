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
      url.hostname !== "127.0.0.1"
    );
  } catch {
    return false;
  }
}

export function gateStatus(assertions) {
  return Object.values(assertions).every(Boolean) ? "PASSED" : "IN_PROGRESS";
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
  ]);

  const nodeCheck = command("node", ["--version"]);
  const pnpmCheck = command("corepack", ["pnpm", "--version"]);
  const goCheck = command("go", ["version"]);
  const forgeCheck = command("forge", ["--version"]);
  const dockerCheck = command("docker", ["version", "--format", "{{.Server.Version}}"]);
  const privateKey = normalizePrivateKey(environment.FLARE_DEPLOYMENT_PRIVATE_KEY);
  const deploymentKeyMatchesDeclaredWallet = privateKey
    ? privateKeyToAccount(privateKey).address === declaredDeployer
    : false;

  const stableProxyUrl = environment[
    manifest.externalRequirements.stableProxyEnvironmentVariable
  ];
  const stableProxyConfigured = isStableProxyUrl(
    stableProxyUrl,
    manifest.externalRequirements.forbiddenProxyHostnameSuffix,
  );
  let stableProxyReachable = false;
  if (stableProxyConfigured) {
    try {
      const response = await fetchImplementation(
        `${stableProxyUrl.replace(/\/$/, "")}/info`,
        { headers: { accept: "application/json" } },
      );
      stableProxyReachable = response.ok;
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
    xrpUsdFeedIsLive:
      feedValue > 0n &&
      feedDecimals >= 0 &&
      supportedFeedIds.some(
        (feedId) => feedId.toLowerCase() === manifest.xrpUsdFeed.id.toLowerCase(),
      ) &&
      BigInt(block.timestamp) >= BigInt(feedTimestamp) &&
      BigInt(block.timestamp) - BigInt(feedTimestamp) <= 300n,
    dockerDaemonAvailable: dockerCheck.ok,
    teeProxyImagesDigestPinned: manifest.docker.teeProxyUpstreamDockerfilePinned,
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
  addBlocker(blockers, assertions.teeProxyImagesDigestPinned, "TEE_PROXY_IMAGE_DIGESTS_UNPINNED");
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
      selectedUpstreamCommits: Object.fromEntries(
        Object.entries(manifest.upstreams).map(([name, source]) => [
          name,
          source.commit,
        ]),
      ),
      sourceChecks,
      configuredMachineCount: machineIds.length,
      productionMachineCount,
    },
    assertions,
    blockers,
    notes: [
      "The official scaffold main branch is reference-only until its stale tee-node and tee-proxy pins are upgraded in the VeilBid extension.",
      "No RPC URL, deployment key, indexer credential, proxy response, or machine secret is recorded.",
      "Simulated TEE mode is the declared Coston2 judging target; it is not hardware-backed confidentiality.",
    ],
  };
}
