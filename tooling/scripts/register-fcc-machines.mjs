import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  getAddress,
  hexToString,
  http,
  parseAbi,
  parseAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  evaluateRegisteredMachine,
  evaluateActiveMachineSet,
  inspectMachineRegistrationEndpoints,
  machineRegistrationEnvironment,
  machineEvidenceRelativePath,
  registrationAddresses,
  requiredMachineRouteUpdate,
  registeredMachineExtensionId,
  registeredMachineReadinessBlockers,
  isTeeNotFoundError,
} from "../flare/fcc-machine-registration.mjs";
import {
  availabilityRefreshAfterSeconds,
  availabilityRefreshDue,
  evaluateAvailabilityWindow,
  readFccOperationalBaseline,
} from "../flare/fcc-operational-baseline.mjs";
import { normalizePrivateKey, readFoundationManifest } from "../flare/foundations.mjs";
import { setLocalEnvironmentValues } from "../flare/local-fcc-secrets.mjs";

const managerAbi = parseAbi([
  "error TeeNotFound()",
  "function getTeeMachineStatus(address) view returns (uint8)",
  "function getExtensionId(address) view returns (uint256)",
  "function getPublicKey(address) view returns ((bytes32 x,bytes32 y))",
  "function getTeeMachine(address) view returns ((address teeId,address teeProxyId,string url))",
  "function getTeeMachineWithAttestationData(address) view returns ((address teeId,address initialTeeId,string url,bytes32 codeHash,bytes32 platform))",
  "function getActiveTeeMachines(uint256 extensionId) view returns (address[] teeIds,string[] urls)",
  "function getAvailabilityCheckValidity(address teeId) view returns (uint64 endTs,uint32 lastSigningPolicyId)",
  "function getSettings() view returns (uint256 availabilityCheckValidityDurationSeconds,uint256 challengeValidityDurationSeconds)",
  "function updateTeeMachineSettings(address teeId,address teeProxyId,string url)",
  "function confirmAvailability(((bytes signingPolicySignatures,(uint8 v,bytes32 r,bytes32 s)[] teeSignatures,(uint8 v,bytes32 r,bytes32 s)[] cosignerSignatures) signatures,(bytes32 attestationType,bytes32 sourceId,uint16 thresholdBIPS,address proofOwner,address[] cosigners,uint64 cosignersThreshold,uint64 timestamp) header,(address teeId,address teeProxyId,string url,bytes32 challenge,bytes32 instructionId) requestBody,(uint8 status,uint64 teeTimestamp,bytes32 codeHash,bytes32 platform,uint32 initialSigningPolicyId,uint32 lastSigningPolicyId,(bytes systemState,bytes32 systemStateVersion,bytes state,bytes32 stateVersion) state) responseBody) proof)",
]);
const availabilityHeaderParameters = parseAbiParameters(
  "(bytes32 attestationType,bytes32 sourceId,uint16 thresholdBIPS,address proofOwner,address[] cosigners,uint64 cosignersThreshold,uint64 timestamp)",
);
const availabilityRequestParameters = parseAbiParameters(
  "(address teeId,address teeProxyId,string url,bytes32 challenge,bytes32 instructionId)",
);
const availabilityResponseParameters = parseAbiParameters(
  "(uint8 status,uint64 teeTimestamp,bytes32 codeHash,bytes32 platform,uint32 initialSigningPolicyId,uint32 lastSigningPolicyId,(bytes systemState,bytes32 systemStateVersion,bytes state,bytes32 stateVersion) state)",
);
const repositoryRoot = resolve(import.meta.dirname, "../..");
const operationalBaseline = readFccOperationalBaseline(repositoryRoot);
const v2 = process.env.FCC_RELEASE_PROFILE?.trim().toLowerCase() === "v2";
const availabilityRefresh = v2 && process.env.FCC_REFRESH_MACHINE_AVAILABILITY?.trim() === "true";
const rollingMachineNumber = Number(process.env.FCC_ROLLING_MACHINE_INDEX ?? "0");
const rollingMachineIndex = rollingMachineNumber - 1;
const rolling = v2 && Number.isInteger(rollingMachineIndex) &&
  rollingMachineIndex >= 0 && rollingMachineIndex < operationalBaseline.machines.requiredCount;
const environmentPath = resolve(repositoryRoot, ".env.local");
const runtimeDirectory = resolve(repositoryRoot, ".local/fcc/registration");
const binaryDirectory = resolve(repositoryRoot, ".local/fcc/bin");
const evidenceRelativePath = machineEvidenceRelativePath(process.env);
if (evidenceRelativePath.startsWith("/") || evidenceRelativePath.split("/").includes("..")) {
  throw new Error("FCC_MACHINE_EVIDENCE_PATH_INVALID");
}
const evidencePath = resolve(repositoryRoot, evidenceRelativePath);
const evidenceDisplayPath = evidenceRelativePath;

function secureRpcUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    ) && !url.username && !url.password && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function writeRegistrationAddresses(path, manifest) {
  const addresses = registrationAddresses(manifest);
  writeFileSync(path, `${JSON.stringify(addresses, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function extractRegistrationBinary(recipe) {
  mkdirSync(binaryDirectory, { recursive: true, mode: 0o700 });
  chmodSync(binaryDirectory, 0o700);
  const binaryPath = resolve(binaryDirectory, "register-tee");
  const containerName = `flare-quorum-register-extract-${process.pid}-${Date.now()}`;
  let created = false;
  try {
    execFileSync("docker", ["create", "--name", containerName, recipe.releaseImageTag], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
    created = true;
    execFileSync("docker", ["cp", `${containerName}:/app/register-tee`, binaryPath], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  } finally {
    if (created) spawnSync("docker", ["rm", containerName], { cwd: repositoryRoot });
  }
  chmodSync(binaryPath, 0o500);
  const digest = createHash("sha256").update(readFileSync(binaryPath)).digest("hex");
  if (digest !== recipe.releaseBinarySha256 || (statSync(binaryPath).mode & 0o777) !== 0o500) {
    throw new Error("FCC_REGISTRATION_BINARY_VERIFICATION_FAILED");
  }
  return binaryPath;
}

function registrationBinary(recipe) {
  const configured = process.env.FCC_REGISTRATION_BINARY_PATH?.trim();
  if (!configured) return extractRegistrationBinary(recipe);
  if (!configured.startsWith("/") || !existsSync(configured)) {
    throw new Error("FCC_REGISTRATION_BINARY_PATH_INVALID");
  }
  const digest = createHash("sha256").update(readFileSync(configured)).digest("hex");
  if (digest !== recipe.releaseBinarySha256) {
    throw new Error("FCC_REGISTRATION_BINARY_VERIFICATION_FAILED");
  }
  return configured;
}

function sourceCommit() {
  const configured = (
    process.env.FLAREQUORUM_SOURCE_COMMIT ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    ""
  ).trim();
  if (/^[0-9a-f]{40}$/i.test(configured)) return configured.toLowerCase();
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function publicPreflight(result, extraBlockers, activeSet, registeredVerification) {
  const blockers = [...extraBlockers, ...result.blockers];
  return {
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    mode: "simulated-coston2",
    command: availabilityRefresh ? "Ra-confirm-or-Rap-promote" : "rRap",
    machineCount: result.machines.length,
    activeMachineCount: activeSet?.activeMachineCount ?? null,
    activeSetAssertions: activeSet?.assertions ?? null,
    registeredMachineStatus: registeredVerification?.status ?? null,
    machines: result.machines.map((machine) => ({
      machine: machine.machine,
      teeId: machine.teeId,
      publicUrl: machine.publicUrl,
      publicKeyFingerprintSha256: machine.publicKeyFingerprintSha256,
      instructionRouteReady: machine.instructionRouteReady,
      availability: registeredVerification?.machines.find(
        ({ teeId }) => teeId.toLowerCase() === machine.teeId.toLowerCase(),
      )?.availability ?? null,
    })),
    blockers,
  };
}

async function reconcileMachineRoute({ client, walletClient, account, manager, machine }) {
  let record;
  try {
    record = await client.readContract({
      address: manager,
      abi: managerAbi,
      functionName: "getTeeMachine",
      args: [machine.teeId],
    });
  } catch (error) {
    if (isTeeNotFoundError(error)) return;
    throw error;
  }
  const update = requiredMachineRouteUpdate(record, machine);
  if (!update) return;
  const transactionHash = await walletClient.writeContract({
    account,
    address: manager,
    abi: managerAbi,
    functionName: "updateTeeMachineSettings",
    args: [update.teeId, update.teeProxyId, update.url],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") throw new Error("FCC_MACHINE_ROUTE_UPDATE_REVERTED");
  const verified = await client.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "getTeeMachine",
    args: [machine.teeId],
    blockNumber: receipt.blockNumber,
  });
  if (verified.url !== update.url || getAddress(verified.teeProxyId) !== update.teeProxyId) {
    throw new Error("FCC_MACHINE_ROUTE_UPDATE_VERIFICATION_FAILED");
  }
  console.log(JSON.stringify({
    event: "FCC_MACHINE_ROUTE_UPDATED",
    machine: machine.machine,
    teeId: update.teeId,
    url: update.url,
    transactionHash,
    blockNumber: receipt.blockNumber.toString(),
  }));
}

async function machineStatus({ client, manager, machine }) {
  try {
    return Number(await client.readContract({
      address: manager,
      abi: managerAbi,
      functionName: "getTeeMachineStatus",
      args: [machine.teeId],
    }));
  } catch (error) {
    if (isTeeNotFoundError(error)) return 0;
    throw error;
  }
}

async function currentMachineAvailability({ client, manager, machine }) {
  const blockNumber = await client.getBlockNumber();
  const [block, settings, validity] = await Promise.all([
    client.getBlock({ blockNumber }),
    client.readContract({
      address: manager,
      abi: managerAbi,
      functionName: "getSettings",
      blockNumber,
    }),
    client.readContract({
      address: manager,
      abi: managerAbi,
      functionName: "getAvailabilityCheckValidity",
      args: [machine.teeId],
      blockNumber,
    }),
  ]);
  return evaluateAvailabilityWindow({
    endTs: validity[0],
    validityDurationSeconds: settings[0],
    checkpointTimestamp: block.timestamp,
    maxCheckAgeSeconds: operationalBaseline.availability.maxCheckAgeSeconds,
    lastSigningPolicyId: validity[1],
  });
}

function archiveRegistrationState(statePath) {
  if (!existsSync(statePath)) return null;
  const archivedPath = `${statePath}.before-availability-refresh-${Date.now()}`;
  renameSync(statePath, archivedPath);
  return archivedPath;
}

function availabilityInstructionId(output) {
  const matches = [...output.matchAll(/availability check sent, instructionId: ([0-9a-f]{64})/gi)];
  if (matches.length !== 1) throw new Error("FCC_AVAILABILITY_INSTRUCTION_ID_UNAVAILABLE");
  return `0x${matches[0][1]}`;
}

async function fetchAvailabilityProof(normalProxyUrl, instructionId) {
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    response = await fetch(new URL(`action/result/${instructionId}`, normalProxyUrl), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) break;
    if (![202, 404].includes(response.status)) {
      throw new Error("FCC_AVAILABILITY_PROOF_PROXY_REJECTED");
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  if (!response?.ok) throw new Error("FCC_AVAILABILITY_PROOF_TIMEOUT");
  const action = await response.json();
  if (action?.result?.status !== 1 || !/^0x[0-9a-f]+$/i.test(action?.result?.data ?? "")) {
    throw new Error("FCC_AVAILABILITY_PROOF_INVALID");
  }
  let encoded;
  try {
    encoded = JSON.parse(hexToString(action.result.data));
  } catch {
    throw new Error("FCC_AVAILABILITY_PROOF_INVALID");
  }
  const requiredHex = [
    encoded.responseHeader,
    encoded.requestBody,
    encoded.responseBody,
    encoded.dataProviderSignatures,
  ];
  if (!requiredHex.every((value) => /^0x[0-9a-f]+$/i.test(value ?? ""))) {
    throw new Error("FCC_AVAILABILITY_PROOF_INVALID");
  }
  return {
    signatures: {
      signingPolicySignatures: encoded.dataProviderSignatures,
      teeSignatures: [],
      cosignerSignatures: [],
    },
    header: decodeAbiParameters(availabilityHeaderParameters, encoded.responseHeader)[0],
    requestBody: decodeAbiParameters(availabilityRequestParameters, encoded.requestBody)[0],
    responseBody: decodeAbiParameters(availabilityResponseParameters, encoded.responseBody)[0],
  };
}

async function confirmMachineAvailability({
  client,
  walletClient,
  account,
  manager,
  machine,
  normalProxyUrl,
  instructionId,
}) {
  const proof = await fetchAvailabilityProof(normalProxyUrl, instructionId);
  if (
    getAddress(proof.requestBody.teeId) !== getAddress(machine.teeId) ||
    proof.requestBody.url !== machine.publicUrl ||
    String(proof.responseBody.codeHash).toLowerCase() !== machine.codeHash ||
    String(proof.responseBody.platform).toLowerCase() !== machine.platform ||
    Number(proof.responseBody.status) !== 1 ||
    getAddress(proof.header.proofOwner) !== getAddress(account.address)
  ) {
    throw new Error(`FCC_MACHINE_${machine.machine}_AVAILABILITY_PROOF_BINDING_MISMATCH`);
  }
  const transactionHash = await walletClient.writeContract({
    account,
    address: manager,
    abi: managerAbi,
    functionName: "confirmAvailability",
    args: [proof],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") {
    throw new Error(`FCC_MACHINE_${machine.machine}_AVAILABILITY_CONFIRM_REVERTED`);
  }
  console.log(JSON.stringify({
    event: "FCC_MACHINE_AVAILABILITY_CONFIRMED",
    machine: machine.machine,
    teeId: machine.teeId,
    transactionHash,
    blockNumber: receipt.blockNumber.toString(),
  }));
}

async function verifyOnchainMachines({ client, manager, extensionId, endpointResult }) {
  const blockNumber = await client.getBlockNumber();
  const [block, settings, activeMachines] = await Promise.all([
    client.getBlock({ blockNumber }),
    client.readContract({
      address: manager,
      abi: managerAbi,
      functionName: "getSettings",
      blockNumber,
    }),
    client.readContract({
      address: manager,
      abi: managerAbi,
      functionName: "getActiveTeeMachines",
      args: [extensionId],
      blockNumber,
    }),
  ]);
  const [availabilityCheckValidityDurationSeconds] = settings;
  const [activeIds, activeUrls] = activeMachines;
  const activeSet = evaluateActiveMachineSet(
    activeIds,
    activeUrls,
    endpointResult.machines,
  );
  const machines = [];
  for (const machine of endpointResult.machines) {
    const [status, registeredExtensionId, record, publicKey, availabilityValidity] = await Promise.all([
      client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [machine.teeId], blockNumber }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getExtensionId", args: [machine.teeId], blockNumber }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineWithAttestationData", args: [machine.teeId], blockNumber }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getPublicKey", args: [machine.teeId], blockNumber }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getAvailabilityCheckValidity", args: [machine.teeId], blockNumber }),
    ]);
    const [endTs, lastSigningPolicyId] = availabilityValidity;
    const availability = evaluateAvailabilityWindow({
      endTs,
      validityDurationSeconds: availabilityCheckValidityDurationSeconds,
      checkpointTimestamp: block.timestamp,
      maxCheckAgeSeconds: operationalBaseline.availability.maxCheckAgeSeconds,
      lastSigningPolicyId,
    });
    machines.push(evaluateRegisteredMachine({
      machine,
      status,
      registeredExtensionId,
      record,
      publicKey,
      expectedExtensionId: extensionId,
      availability,
    }));
  }
  return {
    blockNumber,
    blockTimestamp: Number(block.timestamp),
    status: activeSet.status === "PASSED" &&
      machines.every(({ assertions }) => Object.values(assertions).every(Boolean))
      ? "PASSED"
      : "FAILED",
    machines,
    activeSet,
  };
}

async function verifyOnchainMachinesWithRetry(configuration) {
  let verification;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    verification = await verifyOnchainMachines(configuration);
    if (verification.status === "PASSED") return verification;
    if (attempt < 4) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_500));
    }
  }
  return verification;
}

try {
  const manifest = readFoundationManifest(repositoryRoot);
  const codeVersionEvidence = JSON.parse(readFileSync(
    resolve(repositoryRoot, "evidence/coston2/fcc-code-version.json"),
    "utf8",
  ));
  const extensionIdHex = registeredMachineExtensionId(process.env);
  const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
  const deploymentKey = normalizePrivateKey(process.env.FLARE_DEPLOYMENT_PRIVATE_KEY);
  const refreshAfterSeconds = availabilityRefresh
    ? availabilityRefreshAfterSeconds(
        process.env,
        operationalBaseline.availability.maxCheckAgeSeconds,
      )
    : null;
  const extraBlockers = [];
  let releaseSourceCommit;
  try {
    releaseSourceCommit = sourceCommit();
  } catch {
    extraBlockers.push("SOURCE_COMMIT_NOT_CONFIGURED");
  }
  if (!/^0x[0-9a-f]{64}$/i.test(extensionIdHex ?? "")) {
    extraBlockers.push("FCC_EXTENSION_ID_NOT_CONFIGURED");
  }
  if (!secureRpcUrl(rpcUrl)) extraBlockers.push("COSTON2_RPC_URL_INVALID");
  let deploymentAccount;
  let deploymentKeyMatches = false;
  try {
    deploymentAccount = deploymentKey ? privateKeyToAccount(deploymentKey) : undefined;
    deploymentKeyMatches = deploymentAccount?.address === getAddress(manifest.network.declaredDeployer);
  } catch {
    deploymentKeyMatches = false;
  }
  if (!deploymentKeyMatches) extraBlockers.push("DEPLOYMENT_KEY_NOT_READY");

  const expected = {
    extensionId: extensionIdHex ?? `0x${"00".repeat(32)}`,
    initialOwner: manifest.network.declaredDeployer,
    codeHash: codeVersionEvidence.publicIdentifiers.codeHash,
    platform: codeVersionEvidence.publicIdentifiers.platform,
  };
  const endpointConfiguration = machineRegistrationEnvironment(process.env);
  const endpointResult = await inspectMachineRegistrationEndpoints({
    ...endpointConfiguration,
    expected,
    forbiddenHostnameSuffix: manifest.externalRequirements.forbiddenProxyHostnameSuffix,
  });
  if (v2 && endpointResult.machines.length > 0) {
    const v1Release = JSON.parse(readFileSync(resolve(
      repositoryRoot,
      "packages/flare-contracts/deployments/coston2.v1.release.json",
    ), "utf8"));
    const v1MachineIds = new Set(
      (v1Release.fcc?.teeIds ?? []).map((teeId) => teeId.toLowerCase()),
    );
    if (endpointResult.machines.some(({ teeId }) => v1MachineIds.has(teeId.toLowerCase()))) {
      extraBlockers.push("V2_MACHINE_IDENTITY_REUSES_V1");
    }
  }
  let activeSet;
  let registeredVerification;
  if (
    secureRpcUrl(rpcUrl) &&
    /^0x[0-9a-f]{64}$/i.test(extensionIdHex ?? "")
  ) {
    try {
      const readClient = createPublicClient({
        transport: http(rpcUrl, { retryCount: 2, timeout: 20_000 }),
      });
      const [activeIds, activeUrls] = await readClient.readContract({
        address: getAddress(manifest.contracts.flareTeeManager),
        abi: managerAbi,
        functionName: "getActiveTeeMachines",
        args: [BigInt(extensionIdHex)],
      });
      activeSet = evaluateActiveMachineSet(
        activeIds,
        activeUrls,
        endpointResult.machines,
        {
          requireComplete: v2 && !availabilityRefresh && !rolling &&
            !process.argv.includes("--execute"),
        },
      );
      if (activeSet.status !== "PASSED") {
        extraBlockers.push("FCC_ACTIVE_MACHINE_SET_CONFLICT");
      } else if (activeSet.activeMachineCount === operationalBaseline.machines.requiredCount) {
        registeredVerification = await verifyOnchainMachines({
          client: readClient,
          manager: getAddress(manifest.contracts.flareTeeManager),
          extensionId: BigInt(extensionIdHex),
          endpointResult,
        });
        extraBlockers.push(...registeredMachineReadinessBlockers(
          registeredVerification,
          { allowAvailabilityRefresh: availabilityRefresh },
        ));
      }
    } catch {
      extraBlockers.push("FCC_ACTIVE_MACHINE_SET_UNAVAILABLE");
    }
  }
  const preflight = publicPreflight(
    endpointResult,
    extraBlockers,
    activeSet,
    registeredVerification,
  );
  if (!process.argv.includes("--execute") || preflight.status !== "READY") {
    console.log(JSON.stringify(preflight, null, 2));
    if (preflight.status !== "READY") process.exitCode = 1;
  } else {
    if (v2 && !availabilityRefresh && execFileSync("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim()) {
      throw new Error("FCC_MARKET_V2_MACHINES_REQUIRE_CLEAN_WORKTREE");
    }
    if (v2 && !availabilityRefresh && existsSync(evidencePath)) {
      throw new Error("FCC_MARKET_V2_MACHINE_EVIDENCE_ALREADY_EXISTS");
    }
    mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
    chmodSync(runtimeDirectory, 0o700);
    const addressesPath = resolve(runtimeDirectory, "coston2-addresses.json");
    writeRegistrationAddresses(addressesPath, manifest);
    const binaryPath = registrationBinary(manifest.docker.teeRegistrationReleaseRecipe);
    const manager = getAddress(manifest.contracts.flareTeeManager);
    const client = createPublicClient({ transport: http(rpcUrl, { retryCount: 2, timeout: 20_000 }) });
    const walletClient = createWalletClient({
      account: deploymentAccount,
      transport: http(rpcUrl, { retryCount: 2, timeout: 20_000 }),
    });
    for (const machine of endpointResult.machines) {
      await reconcileMachineRoute({
        client,
        walletClient,
        account: deploymentAccount,
        manager,
        machine,
      });
      const status = await machineStatus({ client, manager, machine });
      if (status === 2 && !availabilityRefresh) {
        console.log(JSON.stringify({
          event: "FCC_MACHINE_ALREADY_PRODUCTION",
          machine: machine.machine,
          teeId: machine.teeId,
        }));
        continue;
      }
      const statePath = resolve(runtimeDirectory, `${machine.teeId.toLowerCase()}.state.json`);
      if (availabilityRefresh) {
        if (status === 2) {
          const availability = await currentMachineAvailability({ client, manager, machine });
          if (!availabilityRefreshDue(availability, refreshAfterSeconds)) {
            console.log(JSON.stringify({
              event: "FCC_MACHINE_AVAILABILITY_REFRESH_NOT_DUE",
              machine: machine.machine,
              teeId: machine.teeId,
              refreshAfterSeconds,
              availability,
            }));
            continue;
          }
          archiveRegistrationState(statePath);
        } else if (status === 4) {
          archiveRegistrationState(statePath);
        } else {
          throw new Error(`FCC_MACHINE_${machine.machine}_UNSAFE_REFRESH_STATUS_${status}`);
        }
      }
      const execution = spawnSync(binaryPath, [
        "-a", addressesPath,
        "-c", rpcUrl,
        "-p", machine.controlUrl,
        "-h", machine.publicUrl,
        "-ep", endpointConfiguration.normalProxyUrl,
        "-state", statePath,
        "-resume",
        "-command", availabilityRefresh ? (status === 4 ? "Rap" : "Ra") : "rRap",
      ], {
        cwd: runtimeDirectory,
        env: {
          ...process.env,
          DEPLOYMENT_PRIVATE_KEY: deploymentKey,
          SIMULATED_TEE: "true",
        },
        encoding: "utf8",
      });
      process.stdout.write(execution.stdout ?? "");
      process.stderr.write(execution.stderr ?? "");
      if (execution.status !== 0) {
        throw new Error(`FCC_MACHINE_${machine.machine}_REGISTRATION_FAILED`);
      }
      if (availabilityRefresh && status === 2) {
        await confirmMachineAvailability({
          client,
          walletClient,
          account: deploymentAccount,
          manager,
          machine,
          normalProxyUrl: endpointConfiguration.normalProxyUrl,
          instructionId: availabilityInstructionId(`${execution.stdout ?? ""}\n${execution.stderr ?? ""}`),
        });
      }
      if (availabilityRefresh && await machineStatus({ client, manager, machine }) !== 2) {
        throw new Error(`FCC_MACHINE_${machine.machine}_REFRESH_NOT_PRODUCTION`);
      }
    }

    const verification = await verifyOnchainMachinesWithRetry({
      client,
      manager,
      extensionId: BigInt(extensionIdHex),
      endpointResult,
    });
    const selectedMachine = rolling ? verification.machines[rollingMachineIndex] : null;
    const nonAvailabilityAssertionsPass = verification.machines.every(({ assertions }) =>
      Object.entries(assertions).every(([name, value]) =>
        name.startsWith("availability") ? true : value === true
      )
    );
    const rollingVerificationPassed = rolling &&
      verification.activeSet.status === "PASSED" &&
      nonAvailabilityAssertionsPass &&
      Object.values(selectedMachine?.assertions ?? {}).every(Boolean);
    const evidenceStatus = rolling
      ? (rollingVerificationPassed ? "PASSED" : "FAILED")
      : verification.status;
    const evidence = {
      schemaVersion: 1,
      gate: rolling ? "FCC_MARKET_V2_ROLLING_MACHINE_REGISTRATION" :
        (v2 ? "FCC_MARKET_V2_MACHINES" : "0-fcc-machines"),
      status: evidenceStatus,
      recordedAt: new Date().toISOString(),
      sourceCommit: releaseSourceCommit,
      network: {
        name: manifest.network.name,
        chainId: manifest.network.chainId,
        blockNumber: verification.blockNumber.toString(),
        blockTimestamp: verification.blockTimestamp,
      },
      publicIdentifiers: {
        manager: manifest.contracts.flareTeeManager,
        extensionId: extensionIdHex,
        command: availabilityRefresh ? "Ra-confirm-or-Rap-promote" : "rRap",
        simulatedTee: true,
        ...(rolling ? { rollingMachine: rollingMachineNumber } : {}),
        activeMachineCount: verification.activeSet.activeMachineCount,
        machines: verification.machines,
      },
      assertions: {
        threeMachinesVerified: verification.machines.length === 3,
        allProductionAndBound: rolling
          ? nonAvailabilityAssertionsPass
          : verification.status === "PASSED",
        threeDistinctIdentities: new Set(verification.machines.map(({ teeId }) => teeId)).size === 3,
        exactActiveMachineSet: verification.activeSet.status === "PASSED",
        ...(rolling ? {
          selectedMachineProductionAndFresh:
            Object.values(selectedMachine?.assertions ?? {}).every(Boolean),
          remainingMachinesStillBound: nonAvailabilityAssertionsPass,
        } : {}),
      },
      blockers: [],
      notes: [
        "This evidence records public Coston2 machine bindings only and does not claim hardware-backed confidentiality.",
        "No deployment key, TEE key, proxy key, direct API key, indexer credential, raw signature, attestation, or bid payload is recorded.",
      ],
    };
    if (evidenceStatus !== "PASSED") throw new Error("FCC_MACHINE_ONCHAIN_VERIFICATION_FAILED");
    if (!availabilityRefresh) {
      mkdirSync(resolve(repositoryRoot, "evidence/coston2"), { recursive: true });
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, v2 ? { flag: "wx" } : {});
      setLocalEnvironmentValues(environmentPath, {
        [v2 ? "FCC_V2_TEE_IDS" : "FLAREQUORUM_FCC_TEE_IDS"]:
          verification.machines.map(({ teeId }) => teeId).join(","),
      });
    }
    console.log(JSON.stringify({
      gate: evidence.gate,
      status: evidence.status,
      blockNumber: evidence.network.blockNumber,
      ...(availabilityRefresh ? { refreshAfterSeconds } : {}),
      machines: verification.machines.map(({ machine, teeId, status, assertions }) => ({ machine, teeId, status, assertions })),
      evidence: availabilityRefresh ? null : evidenceDisplayPath,
    }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({
    gate: v2 ? "FCC_MARKET_V2_MACHINES" : "0-fcc-machines",
    status: "FAILED",
    code: error instanceof Error ? error.message : "FCC_MACHINE_REGISTRATION_FAILED",
  }));
  process.exitCode = 1;
}
