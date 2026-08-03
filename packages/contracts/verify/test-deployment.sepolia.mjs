import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Safe from "@safe-global/protocol-kit";
import {
  createPublicClient,
  getAddress,
  getContract,
  http,
  keccak256,
} from "viem";
import { sepolia } from "viem/chains";

const auctionHouseRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(auctionHouseRoot, "../..");
const deploymentPath = resolve(
  auctionHouseRoot,
  "deployments/sepolia.test.json",
);
const outputPath = resolve(
  repositoryRoot,
  "evidence/sepolia/deployment-consistency.test.json",
);

const artifactDefinitions = [
  [
    "VeilBidTestUSDC",
    "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidTestUSDC.json",
  ],
  [
    "VeilBidConfidentialUSDC",
    "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidConfidentialUSDC.json",
  ],
  [
    "VeilBidMarket",
    "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
  ],
  [
    "VeilBidAwardReceipt",
    "artifacts/contracts/receipt/VeilBidAwardReceipt.sol/VeilBidAwardReceipt.json",
  ],
  [
    "VeilBidSafePreparationModule",
    "artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json",
  ],
];

const evidence = {
  schemaVersion: 1,
  suite: "test-deployment-consistency",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
  },
  publicIdentifiers: {
    contracts: {},
    runtimeCodeHashes: {},
    runtimeCodeBytes: {},
    deploymentTransactions: {},
    blocks: {},
  },
  assertions: {
    chainIdVerified: false,
    allRuntimeCodePresent: false,
    runtimeBytecodeMatchesArtifacts: false,
    deploymentReceiptsVerified: false,
    marketRelationshipsVerified: false,
    wrapperConfigurationVerified: false,
    moduleConfigurationVerified: false,
    safeConfigurationVerified: false,
    cleanupStateVerified: false,
    manifestRemainsUnverified: false,
  },
  blockers: [],
  notes: [
    "Runtime comparisons mask Solidity immutable slots and separately verify every immutable relationship through public getters.",
    "This verifies consistency of the E2E test deployment; it does not publish explorer source verification or promote the deployment to release status.",
  ],
};

let stage = "CONFIGURATION";

function saveEvidence() {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function maskImmutables(bytecode, immutableReferences) {
  const bytes = bytecode.slice(2).match(/.{2}/g) ?? [];
  for (const references of Object.values(immutableReferences ?? {})) {
    for (const { length, start } of references) {
      bytes.splice(start, length, ...Array(length).fill("00"));
    }
  }
  return `0x${bytes.join("")}`;
}

function receiptArtifactFromMarketCompilation(artifact) {
  const marketArtifact = readJson(
    resolve(
      auctionHouseRoot,
      "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
    ),
  );
  const buildOutput = readJson(
    resolve(
      auctionHouseRoot,
      `artifacts/build-info/${marketArtifact.buildInfoId}.output.json`,
    ),
  );
  const compiledReceipt =
    buildOutput.output.contracts[
      `project/${artifact.sourceName}`
    ][artifact.contractName].evm.deployedBytecode;
  return {
    ...artifact,
    deployedBytecode: `0x${compiledReceipt.object}`,
    immutableReferences: compiledReceipt.immutableReferences,
  };
}

async function main() {
  const deployment = readJson(deploymentPath);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(requiredEnvironment("SEPOLIA_RPC_URL")),
  });
  evidence.assertions.chainIdVerified =
    (await publicClient.getChainId()) === deployment.chainId &&
    deployment.chainId === sepolia.id;
  assert.equal(evidence.assertions.chainIdVerified, true);
  evidence.assertions.manifestRemainsUnverified =
    deployment.kind === "test-e2e" && deployment.verified === false;
  assert.equal(evidence.assertions.manifestRemainsUnverified, true);

  stage = "RUNTIME_BYTECODE";
  const artifacts = new Map();
  for (const [contractName, relativeArtifactPath] of artifactDefinitions) {
    let artifact = readJson(
      resolve(auctionHouseRoot, relativeArtifactPath),
    );
    if (contractName === "VeilBidAwardReceipt") {
      artifact = receiptArtifactFromMarketCompilation(artifact);
    }
    artifacts.set(contractName, artifact);
    const deployed = deployment.contracts[contractName];
    const runtimeCode = await publicClient.getCode({
      address: deployed.address,
    });
    assert.ok(runtimeCode && runtimeCode !== "0x");
    evidence.publicIdentifiers.contracts[contractName] = deployed.address;
    evidence.publicIdentifiers.runtimeCodeHashes[contractName] =
      keccak256(runtimeCode);
    evidence.publicIdentifiers.runtimeCodeBytes[contractName] = (
      (runtimeCode.length - 2) /
      2
    ).toString();
    assert.equal(
      maskImmutables(runtimeCode, artifact.immutableReferences),
      maskImmutables(
        artifact.deployedBytecode,
        artifact.immutableReferences,
      ),
      `${contractName} runtime mismatch`,
    );
  }
  const safeDeployment = deployment.contracts.VeilBidDemoSafe;
  const safeCode = await publicClient.getCode({
    address: safeDeployment.address,
  });
  assert.ok(safeCode && safeCode !== "0x");
  evidence.publicIdentifiers.contracts.VeilBidDemoSafe =
    safeDeployment.address;
  evidence.publicIdentifiers.runtimeCodeHashes.VeilBidDemoSafe =
    keccak256(safeCode);
  evidence.publicIdentifiers.runtimeCodeBytes.VeilBidDemoSafe = (
    (safeCode.length - 2) /
    2
  ).toString();
  evidence.assertions.allRuntimeCodePresent = true;
  evidence.assertions.runtimeBytecodeMatchesArtifacts = true;

  stage = "DEPLOYMENT_RECEIPTS";
  for (const contractName of [
    "VeilBidTestUSDC",
    "VeilBidConfidentialUSDC",
    "VeilBidMarket",
    "VeilBidSafePreparationModule",
  ]) {
    const deployed = deployment.contracts[contractName];
    const receipt = await publicClient.getTransactionReceipt({
      hash: deployed.deploymentTransaction,
    });
    assert.equal(receipt.status, "success");
    assert.equal(
      getAddress(receipt.contractAddress),
      getAddress(deployed.address),
    );
    evidence.publicIdentifiers.deploymentTransactions[contractName] =
      deployed.deploymentTransaction;
    evidence.publicIdentifiers.blocks[contractName] =
      receipt.blockNumber.toString();
  }
  const marketReceipt = await publicClient.getTransactionReceipt({
    hash: deployment.contracts.VeilBidMarket.deploymentTransaction,
  });
  assert.equal(marketReceipt.status, "success");
  evidence.publicIdentifiers.deploymentTransactions.VeilBidAwardReceipt =
    deployment.contracts.VeilBidAwardReceipt.deploymentTransaction;
  evidence.publicIdentifiers.blocks.VeilBidAwardReceipt =
    marketReceipt.blockNumber.toString();
  const safeReceipt = await publicClient.getTransactionReceipt({
    hash: safeDeployment.deploymentTransaction,
  });
  assert.equal(safeReceipt.status, "success");
  evidence.publicIdentifiers.deploymentTransactions.VeilBidDemoSafe =
    safeDeployment.deploymentTransaction;
  evidence.publicIdentifiers.blocks.VeilBidDemoSafe =
    safeReceipt.blockNumber.toString();
  evidence.assertions.deploymentReceiptsVerified = true;

  stage = "RELATIONSHIPS";
  const market = getContract({
    address: deployment.contracts.VeilBidMarket.address,
    abi: artifacts.get("VeilBidMarket").abi,
    client: publicClient,
  });
  const wrapper = getContract({
    address: deployment.contracts.VeilBidConfidentialUSDC.address,
    abi: artifacts.get("VeilBidConfidentialUSDC").abi,
    client: publicClient,
  });
  const receipt = getContract({
    address: deployment.contracts.VeilBidAwardReceipt.address,
    abi: artifacts.get("VeilBidAwardReceipt").abi,
    client: publicClient,
  });
  const module = getContract({
    address: deployment.contracts.VeilBidSafePreparationModule.address,
    abi: artifacts.get("VeilBidSafePreparationModule").abi,
    client: publicClient,
  });
  evidence.assertions.marketRelationshipsVerified =
    getAddress(await market.read.paymentToken()) ===
      getAddress(deployment.contracts.VeilBidConfidentialUSDC.address) &&
    getAddress(await market.read.awardReceipt()) ===
      getAddress(deployment.contracts.VeilBidAwardReceipt.address) &&
    getAddress(await receipt.read.market()) ===
      getAddress(deployment.contracts.VeilBidMarket.address);
  assert.equal(evidence.assertions.marketRelationshipsVerified, true);
  evidence.assertions.wrapperConfigurationVerified =
    getAddress(await wrapper.read.underlying()) ===
      getAddress(deployment.contracts.VeilBidTestUSDC.address) &&
    (await wrapper.read.decimals()) === 6;
  assert.equal(evidence.assertions.wrapperConfigurationVerified, true);
  evidence.assertions.moduleConfigurationVerified =
    getAddress(await module.read.safe()) ===
      getAddress(safeDeployment.address) &&
    getAddress(await module.read.market()) ===
      getAddress(deployment.contracts.VeilBidMarket.address);
  assert.equal(evidence.assertions.moduleConfigurationVerified, true);

  const safeKit = await Safe.init({
    provider: requiredEnvironment("SEPOLIA_RPC_URL"),
    safeAddress: safeDeployment.address,
  });
  evidence.assertions.safeConfigurationVerified =
    (await safeKit.isSafeDeployed()) === true &&
    safeKit.getContractVersion() === "1.4.1" &&
    (await safeKit.getOwners()).length === 1 &&
    (await safeKit.getThreshold()) === 1;
  assert.equal(evidence.assertions.safeConfigurationVerified, true);
  evidence.assertions.cleanupStateVerified =
    (await safeKit.isModuleEnabled(
      deployment.contracts.VeilBidSafePreparationModule.address,
    )) === false &&
    (await wrapper.read.isOperator([
      safeDeployment.address,
      deployment.contracts.VeilBidMarket.address,
    ])) === false;
  assert.equal(evidence.assertions.cleanupStateVerified, true);

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/deployment-consistency.test.json",
      assertions: evidence.assertions,
      runtimeCodeHashes: evidence.publicIdentifiers.runtimeCodeHashes,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `TEST_DEPLOYMENT_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`Verification stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
