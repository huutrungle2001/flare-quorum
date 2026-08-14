import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  parseAbi,
} from "viem";

import {
  evaluateAvailabilityWindow,
  readFccOperationalBaseline,
} from "../flare/fcc-operational-baseline.mjs";

const root = resolve(import.meta.dirname, "../..");
const managerAbi = parseAbi([
  "function getTeeMachineStatus(address) view returns (uint8)",
  "function getAvailabilityCheckValidity(address teeId) view returns (uint64 endTs,uint32 lastSigningPolicyId)",
  "function getSettings() view returns (uint256 availabilityCheckValidityDurationSeconds,uint256 challengeValidityDurationSeconds)",
]);
const defaultRpcUrl = "https://coston2-api.flare.network/ext/C/rpc";
const defaultWebUrl = "https://flare-quorum.vercel.app";
const defaultIngressUrl = "https://veilbid-flare-ingress-production.up.railway.app";

export function normalizeReleaseTeeIds(teeIds) {
  return teeIds.map((teeId) => getAddress(teeId));
}

export function createPacedRpcReader({
  minimumIntervalMs = 400,
  retryDelayMs = 1_200,
  now = Date.now,
  wait = (delayMs) => new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs)),
} = {}) {
  let nextRpcReadAt = 0;
  return async (read) => {
    const delayMs = Math.max(0, nextRpcReadAt - now());
    if (delayMs > 0) await wait(delayMs);
    nextRpcReadAt = now() + minimumIntervalMs;
    try {
      return await read();
    } catch {
      await wait(retryDelayMs);
      nextRpcReadAt = now() + minimumIntervalMs;
      return read();
    }
  };
}

export const offlineCommands = Object.freeze([
  ["toolchain", "pnpm", ["env:doctor"]],
  ["workspace-tests", "pnpm", ["test"]],
  ["relay-coverage", "pnpm", ["--filter", "@flarequorum/settlement-relay", "test:coverage"]],
  ["web-coverage", "pnpm", ["--filter", "@flarequorum/tender-room", "test:coverage"]],
  ["typed-lint", "pnpm", ["lint"]],
  ["release-build", "pnpm", ["build"]],
  ["v2-static-analysis", "pnpm", ["flare:slither:v2"]],
  ["generated-bindings", "pnpm", ["bindings:check"]],
  ["release-docs", "pnpm", ["docs:check"]],
  ["secret-scan", "node", ["tooling/scripts/scan-repository-secrets.mjs", "--no-write"]],
  ["evidence-schemas", "pnpm", ["evidence:validate"]],
  ["judge-package", "pnpm", ["flare:judge:check"]],
]);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runOfflineVerification() {
  const checks = [];
  for (const [name, command, args] of offlineCommands) {
    process.stderr.write(`\n[judge:verify] ${name}\n`);
    const startedAt = Date.now();
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CI: "true" },
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    checks.push({
      name,
      status: result.status === 0 ? "PASSED" : "FAILED",
      exitCode: result.status,
      durationMs: Date.now() - startedAt,
      outputSha256: digest(output),
    });
  }
  const blockers = checks
    .filter(({ status }) => status !== "PASSED")
    .map(({ name }) => `OFFLINE_${name.replaceAll("-", "_").toUpperCase()}_FAILED`);
  return {
    schemaVersion: 1,
    suite: "flarequorum-judge-offline",
    status: blockers.length === 0 ? "PASSED" : "BLOCKED",
    checks,
    blockers,
  };
}

export function safePublicOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function summarizePublicEndpoints({ web, ingress }) {
  return {
    web: { statusCode: web.statusCode ?? null },
    ingress: {
      statusCode: ingress.statusCode ?? null,
      serviceStatus: ingress.body?.status ?? null,
      tenderId: ingress.body?.tenderId ?? null,
      tenderStatus: ingress.body?.tenderStatus ?? null,
    },
  };
}

async function fetchPublic(fetchImplementation, url, format) {
  try {
    const response = await fetchImplementation(url, {
      headers: { accept: format === "json" ? "application/json" : "text/html" },
      signal: AbortSignal.timeout(15_000),
    });
    return {
      ok: response.ok,
      statusCode: response.status,
      body: format === "json" ? await response.json() : await response.text(),
    };
  } catch {
    return { ok: false, statusCode: null, body: null };
  }
}

export function buildLiveAssertions({
  release,
  chainId,
  runtimeHash,
  deploymentReceipt,
  machines,
  web,
  ingress,
}) {
  const market = getAddress(release.contracts.FlareQuorumMarketV2.address);
  return {
    chainIdMatches: chainId === release.chainId,
    marketRuntimeHashMatches: runtimeHash === release.contracts.FlareQuorumMarketV2.runtimeHash,
    deploymentTransactionSucceeded:
      deploymentReceipt?.status === "success" &&
      deploymentReceipt?.contractAddress === market,
    threeReleaseMachinesChecked: machines.length === 3,
    allReleaseMachinesProduction: machines.length === 3 && machines.every(({ status }) => status === 2),
    allReleaseMachinesFresh: machines.length === 3 && machines.every(({ availability }) =>
      availability?.status === "PASSED"),
    hostedWebHealthy: web.ok === true && web.containsBrand === true,
    hostedIngressHealthy:
      ingress.ok === true &&
      ingress.body?.status === "ok" &&
      ingress.body?.schemaVersion === 1 &&
      ingress.body?.chainId === release.chainId &&
      ingress.body?.machineBindingsValid === true,
  };
}

export async function runLiveVerification({
  environment = process.env,
  fetchImplementation = fetch,
  client: suppliedClient,
} = {}) {
  const release = JSON.parse(readFileSync(
    resolve(root, "packages/flare-contracts/deployments/coston2.release.json"),
    "utf8",
  ));
  const operationalBaseline = readFccOperationalBaseline(root);
  const rpcUrl = environment.COSTON2_RPC_URL?.trim() ||
    environment.VITE_COSTON2_RPC_URL?.trim() || defaultRpcUrl;
  const webUrl = environment.FLARE_JUDGE_WEB_URL?.trim() || defaultWebUrl;
  const ingressUrl = environment.FLARE_JUDGE_INGRESS_URL?.trim() || defaultIngressUrl;
  const client = suppliedClient ?? createPublicClient({ transport: http(rpcUrl) });
  const publicRpcRead = createPacedRpcReader();
  const publicIdentifiers = {
    network: release.network,
    chainId: release.chainId,
    market: getAddress(release.contracts.FlareQuorumMarketV2.address),
    deploymentTransaction: release.contracts.FlareQuorumMarketV2.deploymentTransaction,
    teeManager: getAddress(release.fcc.manager),
    teeIds: normalizeReleaseTeeIds(release.fcc.teeIds),
    webOrigin: safePublicOrigin(webUrl),
    ingressOrigin: safePublicOrigin(ingressUrl),
    rpcSource: rpcUrl === defaultRpcUrl ? "official-coston2" : "environment",
  };
  let chainId = null;
  let runtimeHash = null;
  let deploymentReceipt = null;
  let machines = [];
  let checkpointBlock = null;
  const collectionBlockers = [];

  try {
    // Keep public RPC reads sequential so the official rate-limited endpoint can
    // reproduce this report without a paid provider or hidden credential.
    const resolvedChainId = await publicRpcRead(() => client.getChainId());
    const block = await publicRpcRead(() => client.getBlock());
    const bytecode = await publicRpcRead(() => client.getBytecode({
      address: publicIdentifiers.market,
      blockNumber: block.number,
    }));
    const receipt = await publicRpcRead(() => client.getTransactionReceipt({
      hash: publicIdentifiers.deploymentTransaction,
    }));
    const managerSettings = await publicRpcRead(() => client.readContract({
      address: publicIdentifiers.teeManager,
      abi: managerAbi,
      functionName: "getSettings",
      blockNumber: block.number,
    }));
    chainId = resolvedChainId;
    runtimeHash = bytecode && bytecode !== "0x" ? keccak256(bytecode) : null;
    deploymentReceipt = {
      status: receipt.status,
      contractAddress: receipt.contractAddress ? getAddress(receipt.contractAddress) : null,
      blockNumber: Number(receipt.blockNumber),
    };
    checkpointBlock = Number(block.number);
    const [availabilityCheckValidityDurationSeconds] = managerSettings;
    for (const teeId of publicIdentifiers.teeIds) {
      const status = await publicRpcRead(() => client.readContract({
        address: publicIdentifiers.teeManager,
        abi: managerAbi,
        functionName: "getTeeMachineStatus",
        args: [teeId],
        blockNumber: block.number,
      }));
      const validity = await publicRpcRead(() => client.readContract({
        address: publicIdentifiers.teeManager,
        abi: managerAbi,
        functionName: "getAvailabilityCheckValidity",
        args: [teeId],
        blockNumber: block.number,
      }));
      const [endTs, lastSigningPolicyId] = validity;
      machines.push({
        teeId,
        status,
        availability: evaluateAvailabilityWindow({
          endTs,
          validityDurationSeconds: availabilityCheckValidityDurationSeconds,
          checkpointTimestamp: block.timestamp,
          maxCheckAgeSeconds: operationalBaseline.availability.maxCheckAgeSeconds,
          lastSigningPolicyId,
        }),
      });
    }
  } catch {
    collectionBlockers.push("LIVE_COSTON2_RPC_CHECK_FAILED");
  }

  const [webResponse, ingressResponse] = await Promise.all([
    fetchPublic(fetchImplementation, webUrl, "text"),
    fetchPublic(fetchImplementation, `${ingressUrl.replace(/\/$/, "")}/health`, "json"),
  ]);
  const web = {
    ok: webResponse.ok,
    statusCode: webResponse.statusCode,
    containsBrand: typeof webResponse.body === "string" && webResponse.body.includes("FlareQuorum"),
  };
  const ingress = {
    ok: ingressResponse.ok,
    statusCode: ingressResponse.statusCode,
    body: ingressResponse.body,
  };
  const assertions = buildLiveAssertions({
    release,
    chainId,
    runtimeHash,
    deploymentReceipt,
    machines,
    web,
    ingress,
  });
  const blockers = [
    ...collectionBlockers,
    ...Object.entries(assertions)
      .filter(([, passed]) => !passed)
      .map(([name]) => `LIVE_${name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}_FAILED`),
  ];
  return {
    schemaVersion: 1,
    suite: "flarequorum-judge-live-read-only",
    status: blockers.length === 0 ? "PASSED" : "BLOCKED",
    recordedAt: new Date().toISOString(),
    publicIdentifiers: { ...publicIdentifiers, checkpointBlock },
    assertions,
    machineAvailability: machines.map(({ teeId, status, availability }) => ({
      teeId,
      status,
      availabilityStatus: availability.status,
      checkedAtTimestamp: availability.checkedAtTimestamp,
      ageSeconds: availability.ageSeconds,
      endTimestamp: availability.endTimestamp,
    })),
    endpointStatus: summarizePublicEndpoints({ web, ingress }),
    deployment: deploymentReceipt,
    runtimeHash,
    blockers: [...new Set(blockers)],
    notes: [
      "This suite is read-only: it sends no transaction, creates no tender, and reads no credential or bid payload.",
      "Endpoint bodies are evaluated in memory and are not persisted in the report.",
    ],
  };
}

export function parseArguments(argumentsList) {
  const offline = argumentsList.includes("--offline");
  const live = argumentsList.includes("--live");
  const outputIndex = argumentsList.indexOf("--output");
  if (outputIndex !== -1 && !argumentsList[outputIndex + 1]) {
    throw new Error("JUDGE_VERIFY_OUTPUT_PATH_MISSING");
  }
  return {
    runOffline: offline || (!offline && !live),
    runLive: live || (!offline && !live),
    output: outputIndex === -1 ? null : resolve(process.cwd(), argumentsList[outputIndex + 1]),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const offline = options.runOffline ? runOfflineVerification() : null;
  const live = options.runLive ? await runLiveVerification() : null;
  const blockers = [
    ...(offline?.blockers ?? []),
    ...(live?.blockers ?? []),
  ];
  const report = {
    schemaVersion: 1,
    suite: "flarequorum-judge-verification",
    status: blockers.length === 0 ? "PASSED" : "BLOCKED",
    recordedAt: new Date().toISOString(),
    offline,
    live,
    blockers,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, serialized, { mode: 0o600 });
  }
  process.stdout.write(serialized);
  if (blockers.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
