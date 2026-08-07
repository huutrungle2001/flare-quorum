import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  zeroAddress,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  evaluateGovernancePreflight,
  evaluateGovernanceVerification,
  governanceConfiguration,
} from "../flare/fcc-governance.mjs";
import {
  inspectMachineRegistrationEndpoints,
  machineRegistrationEnvironment,
} from "../flare/fcc-machine-registration.mjs";
import { normalizePrivateKey, readFoundationManifest } from "../flare/foundations.mjs";

const governanceAbi = parseAbi([
  "event NewTeeGovernanceSet(uint256 indexed extensionId, bytes32 indexed governanceHash, address[] signers, uint64 signersThreshold)",
  "function getExtensionOwner(uint256 extensionId) view returns (address)",
  "function getLatestTeeGovernanceHash(uint256 extensionId) view returns (bytes32)",
  "function getLatestTeeGovernance(uint256 extensionId) view returns (address[] signers, uint64 signersThreshold, address safe)",
  "function isGovernanceHashValid(uint256 extensionId, bytes32 governanceHash) view returns (bool)",
  "function isTeeGovernanceSigner(uint256 extensionId, bytes32 governanceHash, address signer) view returns (bool)",
  "function setNewTeeGovernance(uint256 extensionId, address[] signers, uint64 signersThreshold)",
]);

const root = resolve(import.meta.dirname, "../..");

function evidenceFilePath(value, fallback, variableName) {
  const relativePath = String(value ?? fallback).trim();
  if (!relativePath || relativePath.startsWith("/") || relativePath.split("/").includes("..")) {
    throw new Error(`${variableName}_INVALID`);
  }
  return resolve(root, relativePath);
}

const registrationEvidencePath = evidenceFilePath(
  process.env.FCC_GOVERNANCE_REGISTRATION_EVIDENCE_PATH,
  "evidence/coston2/fcc-extension-registration.json",
  "FCC_GOVERNANCE_REGISTRATION_EVIDENCE_PATH",
);
const evidencePath = evidenceFilePath(
  process.env.FCC_GOVERNANCE_EVIDENCE_PATH,
  "evidence/coston2/fcc-governance.json",
  "FCC_GOVERNANCE_EVIDENCE_PATH",
);
const evidenceDisplayPath = evidencePath.startsWith(`${root}/`)
  ? evidencePath.slice(root.length + 1)
  : evidencePath;

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

async function governanceState(client, manager, extensionId, blockNumber) {
  const options = blockNumber === undefined ? {} : { blockNumber };
  const [extensionOwner, onchainHash] = await Promise.all([
    client.readContract({ address: manager, abi: governanceAbi, functionName: "getExtensionOwner", args: [extensionId], ...options }),
    client.readContract({ address: manager, abi: governanceAbi, functionName: "getLatestTeeGovernanceHash", args: [extensionId], ...options }),
  ]);
  if (onchainHash.toLowerCase() === zeroHash) {
    return {
      extensionOwner,
      onchainHash,
      onchainSigners: [],
      onchainThreshold: 0n,
      onchainSafe: zeroAddress,
    };
  }
  const governance = await client.readContract({
    address: manager,
    abi: governanceAbi,
    functionName: "getLatestTeeGovernance",
    args: [extensionId],
    ...options,
  });
  return {
    extensionOwner,
    onchainHash,
    onchainSigners: governance[0],
    onchainThreshold: governance[1],
    onchainSafe: governance[2],
  };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const foundations = readFoundationManifest(root);
  const registration = JSON.parse(readFileSync(registrationEvidencePath, "utf8"));
  const codeVersion = JSON.parse(readFileSync(
    resolve(root, "evidence/coston2/fcc-code-version.json"),
    "utf8",
  ));
  const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
  const privateKey = normalizePrivateKey(process.env.FLARE_DEPLOYMENT_PRIVATE_KEY);
  if (!secureRpcUrl(rpcUrl)) throw new Error("FCC_GOVERNANCE_RPC_INVALID");
  if (!/^0x[0-9a-f]{64}$/i.test(privateKey ?? "")) {
    throw new Error("FCC_GOVERNANCE_DEPLOYMENT_KEY_INVALID");
  }

  const account = privateKeyToAccount(privateKey);
  const declaredDeployer = getAddress(foundations.network.declaredDeployer);
  if (account.address !== declaredDeployer) throw new Error("FCC_GOVERNANCE_OWNER_KEY_MISMATCH");
  const manager = getAddress(registration.publicIdentifiers.manager);
  if (manager !== getAddress(foundations.contracts.flareTeeManager)) {
    throw new Error("FCC_GOVERNANCE_MANAGER_MISMATCH");
  }
  const extensionId = BigInt(registration.publicIdentifiers.extensionId);
  const extensionIdHex = registration.publicIdentifiers.extensionIdHex;
  const desired = governanceConfiguration({
    rawSigners: process.env.GOVERNANCE_SIGNERS,
    fallbackSigner: declaredDeployer,
    rawThreshold: process.env.GOVERNANCE_THRESHOLD,
  });

  const chain = {
    id: 114,
    name: "Coston2",
    nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  const transport = http(rpcUrl, { timeout: 20_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const [chainId, managerCode] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getCode({ address: manager }),
  ]);
  if (chainId !== 114 || !managerCode || managerCode === "0x") {
    throw new Error("FCC_GOVERNANCE_NETWORK_PREFLIGHT_FAILED");
  }

  const endpointConfiguration = machineRegistrationEnvironment(process.env);
  const endpoints = await inspectMachineRegistrationEndpoints({
    ...endpointConfiguration,
    expected: {
      extensionId: extensionIdHex,
      initialOwner: declaredDeployer,
      codeHash: codeVersion.publicIdentifiers.codeHash,
      platform: codeVersion.publicIdentifiers.platform,
    },
    forbiddenHostnameSuffix: foundations.externalRequirements.forbiddenProxyHostnameSuffix,
  });
  if (endpoints.status !== "READY") throw new Error("FCC_GOVERNANCE_MACHINE_ENDPOINTS_NOT_READY");

  const before = await governanceState(publicClient, manager, extensionId);
  const preflight = evaluateGovernancePreflight({
    account: account.address,
    ...before,
    desired,
    machineHashes: endpoints.machines.map(({ governanceHash }) => governanceHash),
  });
  const publicResult = {
    gate: "FCC_GOVERNANCE",
    status: preflight.status,
    scope: execute ? "Coston2 governance execution" : "preflight only; no transaction sent",
    extensionId: extensionId.toString(),
    manager,
    governanceHash: desired.hash,
    signers: desired.signers,
    threshold: desired.threshold.toString(),
    machines: endpoints.machines.map(({ machine, teeId }) => ({ machine, teeId })),
    assertions: preflight.assertions,
  };
  if (!execute || preflight.status === "BLOCKED") {
    console.log(JSON.stringify(publicResult, null, 2));
    if (preflight.status === "BLOCKED") process.exitCode = 1;
    return;
  }
  if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
    throw new Error("FCC_GOVERNANCE_REQUIRES_CLEAN_WORKTREE");
  }
  if (existsSync(evidencePath)) throw new Error("FCC_GOVERNANCE_EVIDENCE_ALREADY_EXISTS");

  let transactionHash;
  let receipt;
  if (preflight.status === "READY") {
    let simulation;
    try {
      simulation = await publicClient.simulateContract({
        account,
        address: manager,
        abi: governanceAbi,
        functionName: "setNewTeeGovernance",
        args: [extensionId, desired.signers, desired.threshold],
      });
    } catch {
      throw new Error("FCC_GOVERNANCE_SIMULATION_FAILED");
    }
    transactionHash = await walletClient.writeContract(simulation.request);
    receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2 });
    if (receipt.status !== "success") throw new Error("FCC_GOVERNANCE_TRANSACTION_FAILED");
  } else {
    const events = await publicClient.getContractEvents({
      address: manager,
      abi: governanceAbi,
      eventName: "NewTeeGovernanceSet",
      args: { extensionId, governanceHash: desired.hash },
      fromBlock: BigInt(
        registration.publicIdentifiers.registrationBlock ??
        registration.network?.registrationBlock ??
        registration.network?.blockNumber ??
        0,
      ),
      toBlock: "latest",
      strict: true,
    });
    const event = events.at(-1);
    if (!event?.transactionHash) throw new Error("FCC_GOVERNANCE_EVENT_NOT_FOUND");
    transactionHash = event.transactionHash;
    receipt = await publicClient.getTransactionReceipt({ hash: transactionHash });
  }

  const after = await governanceState(publicClient, manager, extensionId, receipt.blockNumber);
  const [hashIsValid, ...signerChecks] = await Promise.all([
    publicClient.readContract({
      address: manager,
      abi: governanceAbi,
      functionName: "isGovernanceHashValid",
      args: [extensionId, desired.hash],
      blockNumber: receipt.blockNumber,
    }),
    ...desired.signers.map((signer) => publicClient.readContract({
      address: manager,
      abi: governanceAbi,
      functionName: "isTeeGovernanceSigner",
      args: [extensionId, desired.hash, signer],
      blockNumber: receipt.blockNumber,
    })),
  ]);
  const verification = evaluateGovernanceVerification({
    desired,
    ...after,
    hashIsValid,
    signerChecks,
  });
  if (verification.status !== "PASSED") throw new Error("FCC_GOVERNANCE_VERIFICATION_FAILED");

  const evidence = {
    schemaVersion: 1,
    gate: "FCC_GOVERNANCE",
    status: "PASSED",
    recordedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    network: {
      name: foundations.network.name,
      chainId: foundations.network.chainId,
      blockNumber: receipt.blockNumber.toString(),
    },
    publicIdentifiers: {
      manager,
      extensionId: extensionId.toString(),
      governanceHash: desired.hash,
      signers: desired.signers,
      threshold: desired.threshold.toString(),
      transactionHash,
      machineIds: endpoints.machines.map(({ teeId }) => teeId),
    },
    assertions: {
      ...preflight.assertions,
      ...verification.assertions,
      transactionSucceeded: receipt.status === "success",
    },
    blockers: ["THREE_PRODUCTION_MACHINES_NOT_REGISTERED", "LIVE_FCC_FOUNDATION_ACTION_NOT_VERIFIED"],
    notes: [
      "Plain one-signer governance matches the governance hash independently reported by all three simulated Railway TEE machines.",
      "This record does not claim machine production status, a live FCC action result, hardware attestation, or a completed Gate 0/Gate A.",
      "No private key, proxy key, indexer credential, raw signature, attestation, TEE public key, or bid payload is recorded.",
    ],
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({
    gate: evidence.gate,
    status: evidence.status,
    blockNumber: evidence.network.blockNumber,
    transactionHash,
    governanceHash: desired.hash,
    assertions: evidence.assertions,
    evidence: evidenceDisplayPath,
  }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    gate: "FCC_GOVERNANCE",
    status: "FAILED",
    code: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "FCC_GOVERNANCE_OPERATION_FAILED",
  }));
  process.exitCode = 1;
}
