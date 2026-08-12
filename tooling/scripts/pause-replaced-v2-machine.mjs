import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { planRollingMachineReplacement } from "../flare/fcc-machine-recovery.mjs";
import {
  inspectMachineRegistrationEndpoints,
  machineRegistrationEnvironment,
} from "../flare/fcc-machine-registration.mjs";
import { normalizePrivateKey, readFoundationManifest } from "../flare/foundations.mjs";
import { readV2ReleasePlan } from "../flare/v2-release.mjs";

const root = resolve(import.meta.dirname, "../..");
const execute = process.argv.includes("--execute");
const indexValue = Number(process.env.FCC_ROLLING_MACHINE_INDEX);
const machineIndex = indexValue - 1;
if (!Number.isInteger(machineIndex) || machineIndex < 0 || machineIndex > 2) {
  throw new Error("FCC_ROLLING_MACHINE_INDEX_INVALID");
}
const previousEvidenceArtifact = process.env.FCC_PREVIOUS_MACHINE_EVIDENCE_PATH?.trim();
const evidenceArtifact = process.env.FCC_ROLLING_EVIDENCE_PATH?.trim();
if (
  !previousEvidenceArtifact || !evidenceArtifact ||
  [previousEvidenceArtifact, evidenceArtifact].some((path) =>
    path.startsWith("/") || path.split("/").includes("..") || !path.endsWith(".json")
  )
) throw new Error("FCC_ROLLING_EVIDENCE_PATH_INVALID");
const evidencePath = resolve(root, evidenceArtifact);

const managerAbi = parseAbi([
  "function getActiveTeeMachines(uint256 extensionId) view returns (address[] teeIds,string[] urls)",
  "function getTeeMachineStatus(address teeId) view returns (uint8)",
  "function getTeeMachineOwner(address teeId) view returns (address)",
  "function getExtensionId(address teeId) view returns (uint256)",
  "function pause(address teeId)",
]);

function read(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function secureRpcUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

try {
  const foundations = readFoundationManifest(root);
  const plan = readV2ReleasePlan(root);
  const registration = read(plan.artifacts.extensionRegistrationEvidence);
  const candidate = read(plan.artifacts.candidateManifest);
  const previousEvidence = read(previousEvidenceArtifact);
  const marketAbi = read(plan.artifacts.candidateMarketAbi);
  const previousMachines = previousEvidence.publicIdentifiers?.machines ?? [];
  const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
  const deploymentKey = normalizePrivateKey(process.env.FLARE_DEPLOYMENT_PRIVATE_KEY);
  if (!secureRpcUrl(rpcUrl) || !/^0x[0-9a-f]{64}$/i.test(deploymentKey ?? "")) {
    throw new Error("FCC_ROLLING_CONFIGURATION_INVALID");
  }
  const account = privateKeyToAccount(deploymentKey);
  if (account.address !== getAddress(foundations.network.declaredDeployer)) {
    throw new Error("FCC_ROLLING_OWNER_MISMATCH");
  }
  const extensionId = BigInt(registration.publicIdentifiers.extensionId);
  const endpointResult = await inspectMachineRegistrationEndpoints({
    ...machineRegistrationEnvironment(process.env),
    expected: {
      extensionId: registration.publicIdentifiers.extensionIdHex,
      initialOwner: account.address,
      codeHash: registration.publicIdentifiers.codeHash,
      platform: registration.publicIdentifiers.platform,
    },
    forbiddenHostnameSuffix: foundations.externalRequirements.forbiddenProxyHostnameSuffix,
  });
  if (endpointResult.status !== "READY") {
    throw new Error(`FCC_ROLLING_ENDPOINTS_NOT_READY:${endpointResult.blockers.join(",")}`);
  }
  const manager = getAddress(foundations.contracts.flareTeeManager);
  const market = getAddress(candidate.contracts.FlareQuorumMarketV2.address);
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
  const [activeResult, tenderCount] = await Promise.all([
    client.readContract({ address: manager, abi: managerAbi, functionName: "getActiveTeeMachines", args: [extensionId] }),
    client.readContract({ address: market, abi: marketAbi, functionName: "tenderCount" }),
  ]);
  const [activeIds, activeUrls] = activeResult;
  const activeMachines = await Promise.all(activeIds.map(async (teeId, index) => {
    const [status, owner, boundExtensionId] = await Promise.all([
      client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [teeId] }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineOwner", args: [teeId] }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getExtensionId", args: [teeId] }),
    ]);
    return {
      teeId: getAddress(teeId),
      url: activeUrls[index],
      status: Number(status),
      owner: getAddress(owner),
      extensionId: boundExtensionId.toString(),
    };
  }));
  const tenders = await Promise.all(Array.from({ length: Number(tenderCount) }, async (_, index) => {
    const tenderId = BigInt(index + 1);
    const tender = await client.readContract({
      address: market,
      abi: marketAbi,
      functionName: "getTender",
      args: [tenderId],
    });
    return {
      tenderId: tenderId.toString(),
      status: Number(tender.status),
      teeIds: tender.teeIds.map(getAddress),
    };
  }));
  const replacementPlan = planRollingMachineReplacement({
    previousMachines,
    currentMachines: endpointResult.machines,
    activeMachines,
    expectedOwner: account.address,
    openTenders: tenders.filter(({ status }) => status < 4),
    machineIndex,
  });
  const publicResult = {
    status: replacementPlan.status,
    scope: execute ? "execution requested" : "preflight only; no transaction sent",
    machine: indexValue,
    extensionId: extensionId.toString(),
    oldTeeId: replacementPlan.oldMachine?.teeId ?? null,
    replacementTeeId: replacementPlan.replacement?.teeId ?? null,
    publicUrl: replacementPlan.replacement?.publicUrl ?? null,
    blockingTenderIds: replacementPlan.blockingTenderIds ?? [],
    blockers: replacementPlan.blockers,
  };
  if (!execute || replacementPlan.status !== "READY") {
    console.log(JSON.stringify(publicResult, null, 2));
    if (replacementPlan.status !== "READY") process.exitCode = 1;
  } else {
    if (existsSync(evidencePath)) throw new Error("FCC_ROLLING_EVIDENCE_ALREADY_EXISTS");
    if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
      throw new Error("FCC_ROLLING_REQUIRES_CLEAN_WORKTREE");
    }
    const wallet = createWalletClient({
      account,
      transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }),
    });
    const simulation = await client.simulateContract({
      account,
      address: manager,
      abi: managerAbi,
      functionName: "pause",
      args: [replacementPlan.oldMachine.teeId],
    });
    const transactionHash = await wallet.writeContract(simulation.request);
    const receipt = await client.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2 });
    if (receipt.status !== "success") throw new Error("FCC_ROLLING_PAUSE_FAILED");
    const [status, remaining] = await Promise.all([
      client.readContract({
        address: manager, abi: managerAbi, functionName: "getTeeMachineStatus",
        args: [replacementPlan.oldMachine.teeId], blockNumber: receipt.blockNumber,
      }),
      client.readContract({
        address: manager, abi: managerAbi, functionName: "getActiveTeeMachines",
        args: [extensionId], blockNumber: receipt.blockNumber,
      }),
    ]);
    const oldRemoved = Number(status) !== 2 &&
      !remaining[0].some((teeId) => getAddress(teeId) === getAddress(replacementPlan.oldMachine.teeId));
    if (!oldRemoved) throw new Error("FCC_ROLLING_PAUSE_VERIFICATION_FAILED");
    const evidence = {
      schemaVersion: 1,
      gate: "FCC_V2_ROLLING_MACHINE_PAUSE",
      status: "PASSED",
      recordedAt: new Date().toISOString(),
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      network: { name: foundations.network.name, chainId: foundations.network.chainId, blockNumber: receipt.blockNumber.toString() },
      publicIdentifiers: {
        manager,
        extensionId: extensionId.toString(),
        machine: indexValue,
        oldTeeId: replacementPlan.oldMachine.teeId,
        replacementTeeId: replacementPlan.replacement.teeId,
        publicUrl: replacementPlan.replacement.publicUrl,
        pauseTransaction: transactionHash,
      },
      assertions: {
        replacementIdentityChanged: getAddress(replacementPlan.oldMachine.teeId) !== getAddress(replacementPlan.replacement.teeId),
        onlySelectedEndpointChanged: true,
        noOpenTenderUsesPausedIdentity: replacementPlan.blockingTenderIds.length === 0,
        oldIdentityRemovedFromProduction: oldRemoved,
        twoPreviousMachinesRemainActive: remaining[0].length === 2,
      },
      blockers: [],
      notes: [
        "The replacement endpoint was verified before the old identity was paused; rRap registration is the next separate step.",
        "No deployment key, TEE key, proxy credential, raw signature, ciphertext, or bid data is recorded.",
      ],
    };
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({
      ...publicResult,
      status: "PASSED",
      pauseTransaction: transactionHash,
      remainingActiveMachineCount: remaining[0].length,
      evidence: evidenceArtifact,
    }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({
    gate: "FCC_V2_ROLLING_MACHINE_PAUSE",
    status: "FAILED",
    code: error instanceof Error ? error.message : "FCC_ROLLING_MACHINE_PAUSE_FAILED",
  }));
  process.exitCode = 1;
}
