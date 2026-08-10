import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { planStaleMachineRetirement } from "../flare/fcc-machine-recovery.mjs";
import {
  inspectMachineRegistrationEndpoints,
  machineRegistrationEnvironment,
  registeredMachineExtensionId,
} from "../flare/fcc-machine-registration.mjs";
import { normalizePrivateKey, readFoundationManifest } from "../flare/foundations.mjs";

const managerAbi = parseAbi([
  "function getActiveTeeMachines(uint256 extensionId) view returns (address[] teeIds,string[] urls)",
  "function getTeeMachineStatus(address teeId) view returns (uint8)",
  "function getTeeMachineOwner(address teeId) view returns (address)",
  "function getExtensionId(address teeId) view returns (uint256)",
  "function pause(address teeId)",
]);
const root = resolve(import.meta.dirname, "../..");
const execute = process.argv.includes("--execute");
const statePath = resolve(root, ".local/fcc/replacement-recovery.state.json");
const evidencePath = resolve(root, "evidence/coston2/fcc-replacement-recovery.json");

function secureRpcUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

try {
  const foundations = readFoundationManifest(root);
  const productRegistration = JSON.parse(readFileSync(
    resolve(root, "evidence/coston2/fcc-market-extension-registration.json"),
    "utf8",
  ));
  const release = JSON.parse(readFileSync(
    resolve(root, "packages/flare-contracts/deployments/coston2.release.json"),
    "utf8",
  ));
  const marketAbi = JSON.parse(readFileSync(
    resolve(root, "packages/flare-bindings/generated/abis/VeilBidFlareMarket.json"),
    "utf8",
  ));
  const extensionIdHex = registeredMachineExtensionId(process.env);
  const extensionId = BigInt(extensionIdHex);
  const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
  const deploymentKey = normalizePrivateKey(process.env.FLARE_DEPLOYMENT_PRIVATE_KEY);
  if (!secureRpcUrl(rpcUrl) || !/^0x[0-9a-f]{64}$/i.test(deploymentKey ?? "")) {
    throw new Error("FCC_RECOVERY_CONFIGURATION_INVALID");
  }
  if (extensionId !== BigInt(productRegistration.publicIdentifiers.extensionId)) {
    throw new Error("FCC_RECOVERY_EXTENSION_MISMATCH");
  }
  const account = privateKeyToAccount(deploymentKey);
  if (account.address !== getAddress(foundations.network.declaredDeployer)) {
    throw new Error("FCC_RECOVERY_OWNER_MISMATCH");
  }

  const endpointResult = await inspectMachineRegistrationEndpoints({
    ...machineRegistrationEnvironment(process.env),
    expected: {
      extensionId: productRegistration.publicIdentifiers.extensionIdHex,
      initialOwner: account.address,
      codeHash: productRegistration.publicIdentifiers.codeHash,
      platform: productRegistration.publicIdentifiers.platform,
    },
    forbiddenHostnameSuffix: foundations.externalRequirements.forbiddenProxyHostnameSuffix,
  });
  if (endpointResult.status !== "READY") {
    console.log(JSON.stringify({
      status: "BLOCKED",
      scope: "preflight only; no transaction sent",
      blockers: endpointResult.blockers,
    }, null, 2));
    process.exitCode = 1;
  } else {
    const manager = getAddress(foundations.contracts.flareTeeManager);
    const market = getAddress(release.contracts.VeilBidFlareMarket.address);
    const publicClient = createPublicClient({ transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
    const walletClient = createWalletClient({ account, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
    const [activeResult, tenderCount] = await Promise.all([
      publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getActiveTeeMachines", args: [extensionId] }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "tenderCount" }),
    ]);
    const [activeIds, activeUrls] = activeResult;
    const activeMachines = await Promise.all(activeIds.map(async (teeId, index) => {
      const [status, owner, registeredExtensionId] = await Promise.all([
        publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [teeId] }),
        publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineOwner", args: [teeId] }),
        publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getExtensionId", args: [teeId] }),
      ]);
      return {
        teeId: getAddress(teeId),
        url: activeUrls[index],
        status: Number(status),
        owner: getAddress(owner),
        extensionId: registeredExtensionId.toString(),
      };
    }));
    const tenders = await Promise.all(Array.from({ length: Number(tenderCount) }, async (_, index) => {
      const tenderId = BigInt(index + 1);
      const tender = await publicClient.readContract({ address: market, abi: marketAbi, functionName: "getTender", args: [tenderId] });
      return {
        tenderId: tenderId.toString(),
        status: Number(tender.status),
        teeIds: tender.teeIds.map(getAddress),
      };
    }));
    const openTenders = tenders.filter(({ status }) => status < 4);
    const plan = planStaleMachineRetirement({
      activeMachines,
      currentMachines: endpointResult.machines,
      expectedOwner: account.address,
      openTenders,
    });
    const publicPlan = {
      status: plan.status,
      scope: execute ? "execution requested" : "preflight only; no transaction sent",
      extensionId: extensionId.toString(),
      currentMachineCount: endpointResult.machines.length,
      activeMachineCount: activeMachines.length,
      staleMachines: plan.candidates.map(({ teeId, url }) => ({ teeId, url })),
      blockingTenderIds: plan.blockingTenderIds,
      blockers: plan.blockers,
    };
    if (!execute || plan.status !== "READY") {
      console.log(JSON.stringify(publicPlan, null, 2));
      if (plan.status !== "READY") process.exitCode = 1;
    } else {
      if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "") {
        throw new Error("FCC_RECOVERY_REQUIRES_CLEAN_WORKTREE");
      }
      const state = existsSync(statePath)
        ? JSON.parse(readFileSync(statePath, "utf8"))
        : { schemaVersion: 1, manager, extensionId: extensionId.toString(), retiredMachines: [] };
      if (getAddress(state.manager) !== manager || state.extensionId !== extensionId.toString()) {
        throw new Error("FCC_RECOVERY_STATE_MISMATCH");
      }
      for (const machine of plan.candidates) {
        const simulation = await publicClient.simulateContract({
          account,
          address: manager,
          abi: managerAbi,
          functionName: "pause",
          args: [machine.teeId],
        });
        const transactionHash = await walletClient.writeContract(simulation.request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2 });
        if (receipt.status !== "success") throw new Error("FCC_STALE_MACHINE_PAUSE_FAILED");
        state.retiredMachines.push({
          teeId: machine.teeId,
          url: machine.url,
          transactionHash,
          blockNumber: receipt.blockNumber.toString(),
        });
      }
      mkdirSync(resolve(root, ".local/fcc"), { recursive: true, mode: 0o700 });
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      const [remainingResult, statuses] = await Promise.all([
        publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getActiveTeeMachines", args: [extensionId] }),
        Promise.all(plan.candidates.map(({ teeId }) =>
          publicClient.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [teeId] })
        )),
      ]);
      const remainingIds = new Set(remainingResult[0].map((teeId) => getAddress(teeId)));
      const retiredNow = plan.candidates.every(({ teeId }, index) =>
        Number(statuses[index]) !== 2 && !remainingIds.has(getAddress(teeId))
      );
      if (!retiredNow) throw new Error("FCC_STALE_MACHINE_RETIREMENT_VERIFICATION_FAILED");
      const evidence = {
        schemaVersion: 1,
        gate: "FCC_REPLACEMENT_RECOVERY",
        status: "PASSED",
        recordedAt: new Date().toISOString(),
        sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
        network: { name: foundations.network.name, chainId: foundations.network.chainId },
        publicIdentifiers: {
          manager,
          extensionId: extensionId.toString(),
          currentMachines: endpointResult.machines.map(({ machine, teeId, publicUrl }) => ({ machine, teeId, publicUrl })),
          retiredMachines: state.retiredMachines,
        },
        assertions: {
          threeCurrentMachinesVerified: endpointResult.machines.length === 3,
          noOpenTenderUsesRetiredIdentity: plan.blockingTenderIds.length === 0,
          staleProductionIdentitiesRemoved: retiredNow,
        },
        notes: [
          "This is the organizer-supported replacement plus re-registration recovery model; identity restoration is not claimed.",
          "Retirement uses the verified FlareTeeManager owner pause path after checking every unfinished FlareQuorum tender.",
          "No deployment key, TEE key, proxy credential, raw signature, attestation, ciphertext, or bid data is recorded.",
        ],
      };
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
      console.log(JSON.stringify({
        ...publicPlan,
        status: "PASSED",
        retiredNow: plan.candidates.map(({ teeId }) => teeId),
        remainingActiveMachineCount: remainingIds.size,
        evidence: "evidence/coston2/fcc-replacement-recovery.json",
      }, null, 2));
    }
  }
} catch (error) {
  console.error(JSON.stringify({
    gate: "FCC_REPLACEMENT_RECOVERY",
    status: "FAILED",
    code: error instanceof Error ? error.message : "FCC_RECOVERY_FAILED",
  }));
  process.exitCode = 1;
}
