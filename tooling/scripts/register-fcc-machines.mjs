import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  evaluateRegisteredMachine,
  inspectMachineRegistrationEndpoints,
  machineRegistrationEnvironment,
  registrationAddresses,
  requiredMachineRouteUpdate,
  isTeeNotFoundError,
} from "../flare/fcc-machine-registration.mjs";
import { normalizePrivateKey, readFoundationManifest } from "../flare/foundations.mjs";
import { setLocalEnvironmentValues } from "../flare/local-fcc-secrets.mjs";

const managerAbi = parseAbi([
  "error TeeNotFound()",
  "function getTeeMachineStatus(address) view returns (uint8)",
  "function getExtensionId(address) view returns (uint256)",
  "function getPublicKey(address) view returns ((bytes32 x,bytes32 y))",
  "function getTeeMachine(address) view returns ((address teeId,address teeProxyId,string url))",
  "function getTeeMachineWithAttestationData(address) view returns ((address teeId,address initialTeeId,string url,bytes32 codeHash,bytes32 platform))",
  "function updateTeeMachineSettings(address teeId,address teeProxyId,string url)",
]);
const repositoryRoot = resolve(import.meta.dirname, "../..");
const environmentPath = resolve(repositoryRoot, ".env.local");
const runtimeDirectory = resolve(repositoryRoot, ".local/fcc/registration");
const binaryDirectory = resolve(repositoryRoot, ".local/fcc/bin");
const evidenceRelativePath = process.env.FCC_MACHINE_EVIDENCE_PATH?.trim() || "evidence/coston2/fcc-machines.json";
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
  const containerName = `veilbid-register-extract-${process.pid}-${Date.now()}`;
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

function publicPreflight(result, extraBlockers) {
  const blockers = [...extraBlockers, ...result.blockers];
  return {
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    mode: "simulated-coston2",
    command: "rRap",
    machineCount: result.machines.length,
    machines: result.machines.map((machine) => ({
      machine: machine.machine,
      teeId: machine.teeId,
      publicUrl: machine.publicUrl,
      publicKeyFingerprintSha256: machine.publicKeyFingerprintSha256,
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

async function verifyOnchainMachines({ client, manager, extensionId, endpointResult }) {
  const blockNumber = await client.getBlockNumber();
  const machines = [];
  for (const machine of endpointResult.machines) {
    const [status, registeredExtensionId, record, publicKey] = await Promise.all([
      client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [machine.teeId], blockNumber }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getExtensionId", args: [machine.teeId], blockNumber }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineWithAttestationData", args: [machine.teeId], blockNumber }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getPublicKey", args: [machine.teeId], blockNumber }),
    ]);
    machines.push(evaluateRegisteredMachine({
      machine,
      status,
      registeredExtensionId,
      record,
      publicKey,
      expectedExtensionId: extensionId,
    }));
  }
  return {
    blockNumber,
    status: machines.every(({ assertions }) => Object.values(assertions).every(Boolean))
      ? "PASSED"
      : "FAILED",
    machines,
  };
}

try {
  const manifest = readFoundationManifest(repositoryRoot);
  const codeVersionEvidence = JSON.parse(readFileSync(
    resolve(repositoryRoot, "evidence/coston2/fcc-code-version.json"),
    "utf8",
  ));
  const extensionIdHex = process.env.FCC_EXTENSION_ID?.trim();
  const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
  const deploymentKey = normalizePrivateKey(process.env.FLARE_DEPLOYMENT_PRIVATE_KEY);
  const extraBlockers = [];
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
  const preflight = publicPreflight(endpointResult, extraBlockers);
  if (!process.argv.includes("--execute") || preflight.status !== "READY") {
    console.log(JSON.stringify(preflight, null, 2));
    if (preflight.status !== "READY") process.exitCode = 1;
  } else {
    mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
    chmodSync(runtimeDirectory, 0o700);
    const addressesPath = resolve(runtimeDirectory, "coston2-addresses.json");
    writeRegistrationAddresses(addressesPath, manifest);
    const binaryPath = extractRegistrationBinary(manifest.docker.teeRegistrationReleaseRecipe);
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
      if (status === 2) {
        console.log(JSON.stringify({
          event: "FCC_MACHINE_ALREADY_PRODUCTION",
          machine: machine.machine,
          teeId: machine.teeId,
        }));
        continue;
      }
      const statePath = resolve(runtimeDirectory, `${machine.teeId.toLowerCase()}.state.json`);
      const execution = spawnSync(binaryPath, [
        "-a", addressesPath,
        "-c", rpcUrl,
        "-p", machine.controlUrl,
        "-h", machine.publicUrl,
        "-ep", endpointConfiguration.normalProxyUrl,
        "-state", statePath,
        "-resume",
        "-command", "rRap",
      ], {
        cwd: runtimeDirectory,
        env: {
          ...process.env,
          DEPLOYMENT_PRIVATE_KEY: deploymentKey,
          SIMULATED_TEE: "true",
        },
        stdio: "inherit",
      });
      if (execution.status !== 0) {
        throw new Error(`FCC_MACHINE_${machine.machine}_REGISTRATION_FAILED`);
      }
    }

    const verification = await verifyOnchainMachines({
      client,
      manager,
      extensionId: BigInt(extensionIdHex),
      endpointResult,
    });
    const evidence = {
      schemaVersion: 1,
      gate: "0-fcc-machines",
      status: verification.status,
      recordedAt: new Date().toISOString(),
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
      network: { name: manifest.network.name, chainId: manifest.network.chainId, blockNumber: verification.blockNumber.toString() },
      publicIdentifiers: {
        manager: manifest.contracts.flareTeeManager,
        extensionId: extensionIdHex,
        command: "rRap",
        simulatedTee: true,
        machines: verification.machines,
      },
      assertions: {
        threeMachinesVerified: verification.machines.length === 3,
        allProductionAndBound: verification.status === "PASSED",
        threeDistinctIdentities: new Set(verification.machines.map(({ teeId }) => teeId)).size === 3,
      },
      notes: [
        "This evidence records public Coston2 machine bindings only and does not claim hardware-backed confidentiality.",
        "No deployment key, TEE key, proxy key, direct API key, indexer credential, raw signature, attestation, or bid payload is recorded.",
      ],
    };
    if (verification.status !== "PASSED") throw new Error("FCC_MACHINE_ONCHAIN_VERIFICATION_FAILED");
    mkdirSync(resolve(repositoryRoot, "evidence/coston2"), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    setLocalEnvironmentValues(environmentPath, {
      VEILBID_FCC_TEE_IDS: verification.machines.map(({ teeId }) => teeId).join(","),
    });
    console.log(JSON.stringify({
      gate: evidence.gate,
      status: evidence.status,
      blockNumber: evidence.network.blockNumber,
      machines: verification.machines.map(({ machine, teeId, status, assertions }) => ({ machine, teeId, status, assertions })),
      evidence: evidenceDisplayPath,
    }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({
    gate: "0-fcc-machines",
    status: "FAILED",
    code: error instanceof Error ? error.message : "FCC_MACHINE_REGISTRATION_FAILED",
  }));
  process.exitCode = 1;
}
