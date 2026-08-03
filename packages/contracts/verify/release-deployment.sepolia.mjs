import { strict as assert } from "node:assert";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
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
import {
  constructorArgumentsMatch,
  runtimeLogicMatches,
} from "./bytecode.mjs";

const auctionHouseRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(auctionHouseRoot, "../..");
const deploymentPath = resolve(
  auctionHouseRoot,
  "deployments/sepolia.release.json",
);
const temporaryDeploymentPath = `${deploymentPath}.tmp`;
const outputPath = resolve(
  repositoryRoot,
  "evidence/sepolia/deployment-consistency.release.json",
);
const promote = process.argv.includes("--promote");
const sourcifyBaseUrl = "https://sourcify.dev/server";

const artifactDefinitions = [
  {
    name: "VeilBidTestUSDC",
    artifact:
      "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidTestUSDC.json",
    constructorArgs: () => [],
  },
  {
    name: "VeilBidConfidentialUSDC",
    artifact:
      "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidConfidentialUSDC.json",
    constructorArgs: (deployment) => [
      deployment.contracts.VeilBidTestUSDC.address,
    ],
  },
  {
    name: "VeilBidMarket",
    artifact:
      "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
    constructorArgs: (deployment) => [
      deployment.contracts.VeilBidConfidentialUSDC.address,
    ],
  },
  {
    name: "VeilBidAwardReceipt",
    artifact:
      "artifacts/contracts/receipt/VeilBidAwardReceipt.sol/VeilBidAwardReceipt.json",
    buildFrom:
      "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
    embedded: true,
  },
  {
    name: "VeilBidSafePreparationModule",
    artifact:
      "artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json",
    constructorArgs: (deployment) => [
      deployment.contracts.VeilBidDemoSafe.address,
    ],
  },
  {
    name: "VeilBidSafeModuleFactory",
    artifact:
      "artifacts/contracts/safe/VeilBidSafeModuleFactory.sol/VeilBidSafeModuleFactory.json",
    constructorArgs: (deployment) => [
      deployment.contracts.VeilBidMarket.address,
    ],
  },
  {
    name: "VeilBidSafeUnwrapPreparation",
    artifact:
      "artifacts/contracts/safe/VeilBidSafeUnwrapPreparation.sol/VeilBidSafeUnwrapPreparation.json",
    constructorArgs: (deployment) => [
      deployment.contracts.VeilBidConfidentialUSDC.address,
    ],
  },
];

const evidence = {
  schemaVersion: 1,
  suite: "release-deployment-consistency",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    sourceProvider: "sourcify-v2",
  },
  publicIdentifiers: {
    sourceCommit: null,
    contracts: {},
    runtimeCodeHashes: {},
    runtimeCodeBytes: {},
    deploymentTransactions: {},
    configurationTransactions: {},
    blocks: {},
    sourceMappings: {},
  },
  assertions: {
    releaseManifestVerified: false,
    chainIdVerified: false,
    allRuntimeCodePresent: false,
    runtimeBytecodeMatchesArtifacts: false,
    constructorCalldataMatchesArtifacts: false,
    deploymentReceiptsVerified: false,
    configurationReceiptsVerified: false,
    marketRelationshipsVerified: false,
    wrapperConfigurationVerified: false,
    moduleConfigurationVerified: false,
    unwrapPreparationConfigurationVerified: false,
    safeConfigurationVerified: false,
    releaseOperationalStateVerified: false,
    topLevelSourceMappingsExact: false,
    embeddedReceiptSourceMappingVerified: false,
    safeSourceMappingExact: false,
    manifestPromoted: false,
  },
  blockers: [],
  notes: [
    "Runtime logic comparisons mask Solidity immutable slots, exclude only the compiler CBOR metadata trailer, and separately verify every immutable relationship through public getters.",
    "Full deployed and creation bytecode are checked against Sourcify's exact canonical recompilation; constructor arguments are also checked against the current local ABI.",
    "The embedded receipt has exact runtime mapping and shares the exact Market creation transaction; Sourcify does not report a separate top-level creation match for this internal CREATE.",
    "No credentials, private keys, signatures, confidential handles, proofs, bid values, or balances are recorded.",
  ],
};

let stage = "CONFIGURATION";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveEvidence() {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
}

function saveDeployment(deployment) {
  writeFileSync(
    temporaryDeploymentPath,
    `${JSON.stringify(deployment, null, 2)}\n`,
    { mode: 0o644 },
  );
  renameSync(temporaryDeploymentPath, deploymentPath);
}

function artifactFromBuild(definition) {
  const artifact = readJson(
    resolve(auctionHouseRoot, definition.artifact),
  );
  const buildArtifact = definition.buildFrom
    ? readJson(resolve(auctionHouseRoot, definition.buildFrom))
    : artifact;
  const buildOutput = readJson(
    resolve(
      auctionHouseRoot,
      `artifacts/build-info/${buildArtifact.buildInfoId}.output.json`,
    ),
  );
  const compiled =
    buildOutput.output.contracts[`project/${artifact.sourceName}`][
      artifact.contractName
    ].evm;
  return {
    ...artifact,
    bytecode: `0x${compiled.bytecode.object}`,
    deployedBytecode: `0x${compiled.deployedBytecode.object}`,
    immutableReferences:
      compiled.deployedBytecode.immutableReferences,
  };
}

async function retry(operation, code) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation();
    } catch {
      if (attempt === 4) throw new Error(code);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
  throw new Error(code);
}

async function sourcifyLookup(chainId, address, fields = "all") {
  const response = await retry(
    () =>
      fetch(
        `${sourcifyBaseUrl}/v2/contract/${chainId}/${address}?fields=${fields}`,
      ),
    "SOURCIFY_UNAVAILABLE",
  );
  if (!response.ok) throw new Error("SOURCIFY_LOOKUP_FAILED");
  return response.json();
}

async function main() {
  const deployment = readJson(deploymentPath);
  assert.equal(deployment.kind, "release");
  assert.equal(deployment.deploymentState, "configured");
  assert.equal(deployment.blockers.length, 0);
  assert.equal(
    deployment.verified === false || deployment.verified === true,
    true,
  );
  evidence.publicIdentifiers.sourceCommit =
    deployment.sourceCommit;

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(requiredEnvironment("SEPOLIA_RPC_URL")),
  });
  evidence.assertions.chainIdVerified =
    (await retry(
      () => publicClient.getChainId(),
      "CHAIN_ID_UNAVAILABLE",
    )) === deployment.chainId &&
    deployment.chainId === sepolia.id;
  assert.equal(evidence.assertions.chainIdVerified, true);

  stage = "RUNTIME_BYTECODE";
  const artifacts = new Map();
  const sourceMappings = new Map();
  for (const definition of artifactDefinitions) {
    const artifact = artifactFromBuild(definition);
    artifacts.set(definition.name, artifact);
    const deployed = deployment.contracts[definition.name];
    assert.ok(deployed?.address);
    const runtimeCode = await retry(
      () => publicClient.getCode({ address: deployed.address }),
      "RUNTIME_CODE_UNAVAILABLE",
    );
    assert.ok(runtimeCode && runtimeCode !== "0x");
    const source = await sourcifyLookup(
      deployment.chainId,
      deployed.address,
      "creationMatch,runtimeMatch,creationBytecode,runtimeBytecode",
    );
    sourceMappings.set(definition.name, source);
    evidence.publicIdentifiers.contracts[definition.name] =
      deployed.address;
    evidence.publicIdentifiers.runtimeCodeHashes[definition.name] =
      keccak256(runtimeCode);
    evidence.publicIdentifiers.runtimeCodeBytes[definition.name] = (
      (runtimeCode.length - 2) /
      2
    ).toString();
    assert.equal(
      runtimeLogicMatches(
        runtimeCode,
        artifact.deployedBytecode,
        artifact.immutableReferences,
      ),
      true,
      `${definition.name} runtime mismatch`,
    );
    assert.equal(source.runtimeMatch, "exact_match");
    assert.equal(
      runtimeCode.toLowerCase(),
      source.runtimeBytecode.onchainBytecode.toLowerCase(),
      `${definition.name} canonical runtime mismatch`,
    );
  }

  const safeDeployment = deployment.contracts.VeilBidDemoSafe;
  const safeCode = await retry(
    () =>
      publicClient.getCode({
        address: safeDeployment.address,
      }),
    "SAFE_CODE_UNAVAILABLE",
  );
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

  stage = "DEPLOYMENT_TRANSACTIONS";
  for (const definition of artifactDefinitions) {
    const deployed = deployment.contracts[definition.name];
    const receipt = await retry(
      () =>
        publicClient.getTransactionReceipt({
          hash: deployed.deploymentTransaction,
        }),
      "DEPLOYMENT_RECEIPT_UNAVAILABLE",
    );
    assert.equal(receipt.status, "success");
    if (!definition.embedded) {
      assert.equal(
        getAddress(receipt.contractAddress),
        getAddress(deployed.address),
      );
      const transaction = await retry(
        () =>
          publicClient.getTransaction({
            hash: deployed.deploymentTransaction,
          }),
        "DEPLOYMENT_TRANSACTION_UNAVAILABLE",
      );
      assert.equal(
        transaction.input,
        sourceMappings.get(definition.name).creationBytecode
          .onchainBytecode,
        `${definition.name} canonical creation bytecode mismatch`,
      );
      assert.equal(
        constructorArgumentsMatch(
          transaction.input,
          artifacts.get(definition.name).abi,
          definition.constructorArgs(deployment),
        ),
        true,
        `${definition.name} constructor arguments mismatch`,
      );
    } else {
      assert.equal(
        deployed.deploymentTransaction,
        deployment.contracts.VeilBidMarket.deploymentTransaction,
      );
      assert.equal(
        deployed.deploymentBlock,
        deployment.contracts.VeilBidMarket.deploymentBlock,
      );
    }
    assert.equal(
      receipt.blockNumber.toString(),
      deployed.deploymentBlock,
    );
    evidence.publicIdentifiers.deploymentTransactions[
      definition.name
    ] = deployed.deploymentTransaction;
    evidence.publicIdentifiers.blocks[definition.name] =
      receipt.blockNumber.toString();
  }
  const safeReceipt = await retry(
    () =>
      publicClient.getTransactionReceipt({
        hash: safeDeployment.deploymentTransaction,
      }),
    "SAFE_DEPLOYMENT_RECEIPT_UNAVAILABLE",
  );
  assert.equal(safeReceipt.status, "success");
  assert.equal(
    safeReceipt.blockNumber.toString(),
    safeDeployment.deploymentBlock,
  );
  evidence.publicIdentifiers.deploymentTransactions.VeilBidDemoSafe =
    safeDeployment.deploymentTransaction;
  evidence.publicIdentifiers.blocks.VeilBidDemoSafe =
    safeReceipt.blockNumber.toString();
  evidence.assertions.constructorCalldataMatchesArtifacts = true;
  evidence.assertions.deploymentReceiptsVerified = true;

  stage = "CONFIGURATION_TRANSACTIONS";
  for (const label of [
    "enableModule",
    "configureMarket",
    "authorizeMarket",
  ]) {
    const configured = deployment.configurationTransactions[label];
    assert.ok(configured?.transactionHash);
    const receipt = await retry(
      () =>
        publicClient.getTransactionReceipt({
          hash: configured.transactionHash,
        }),
      "CONFIGURATION_RECEIPT_UNAVAILABLE",
    );
    assert.equal(receipt.status, "success");
    assert.equal(receipt.blockNumber.toString(), configured.block);
    evidence.publicIdentifiers.configurationTransactions[label] =
      configured.transactionHash;
    evidence.publicIdentifiers.blocks[`configuration:${label}`] =
      receipt.blockNumber.toString();
  }
  evidence.assertions.configurationReceiptsVerified = true;

  stage = "RELATIONSHIPS";
  const market = getContract({
    address: deployment.contracts.VeilBidMarket.address,
    abi: artifacts.get("VeilBidMarket").abi,
    client: publicClient,
  });
  const wrapper = getContract({
    address:
      deployment.contracts.VeilBidConfidentialUSDC.address,
    abi: artifacts.get("VeilBidConfidentialUSDC").abi,
    client: publicClient,
  });
  const receipt = getContract({
    address: deployment.contracts.VeilBidAwardReceipt.address,
    abi: artifacts.get("VeilBidAwardReceipt").abi,
    client: publicClient,
  });
  const module = getContract({
    address:
      deployment.contracts.VeilBidSafePreparationModule.address,
    abi: artifacts.get("VeilBidSafePreparationModule").abi,
    client: publicClient,
  });
  const moduleFactory = getContract({
    address:
      deployment.contracts.VeilBidSafeModuleFactory.address,
    abi: artifacts.get("VeilBidSafeModuleFactory").abi,
    client: publicClient,
  });
  const unwrapPreparation = getContract({
    address:
      deployment.contracts.VeilBidSafeUnwrapPreparation.address,
    abi: artifacts.get("VeilBidSafeUnwrapPreparation").abi,
    client: publicClient,
  });
  evidence.assertions.marketRelationshipsVerified =
    getAddress(
      await retry(
        () => market.read.paymentToken(),
        "MARKET_PAYMENT_TOKEN_UNAVAILABLE",
      ),
    ) ===
      getAddress(
        deployment.contracts.VeilBidConfidentialUSDC.address,
      ) &&
    getAddress(
      await retry(
        () => market.read.awardReceipt(),
        "MARKET_RECEIPT_UNAVAILABLE",
      ),
    ) ===
      getAddress(
        deployment.contracts.VeilBidAwardReceipt.address,
      ) &&
    getAddress(
      await retry(
        () => receipt.read.market(),
        "RECEIPT_MARKET_UNAVAILABLE",
      ),
    ) === getAddress(deployment.contracts.VeilBidMarket.address);
  assert.equal(
    evidence.assertions.marketRelationshipsVerified,
    true,
  );
  evidence.assertions.wrapperConfigurationVerified =
    getAddress(
      await retry(
        () => wrapper.read.underlying(),
        "WRAPPER_UNDERLYING_UNAVAILABLE",
      ),
    ) ===
      getAddress(deployment.contracts.VeilBidTestUSDC.address) &&
    (await retry(
      () => wrapper.read.decimals(),
      "WRAPPER_DECIMALS_UNAVAILABLE",
    )) === 6;
  assert.equal(
    evidence.assertions.wrapperConfigurationVerified,
    true,
  );
  evidence.assertions.moduleConfigurationVerified =
    getAddress(
      await retry(
        () => module.read.safe(),
        "MODULE_SAFE_UNAVAILABLE",
      ),
    ) === getAddress(safeDeployment.address) &&
    getAddress(
      await retry(
        () => module.read.market(),
        "MODULE_MARKET_UNAVAILABLE",
      ),
    ) === getAddress(deployment.contracts.VeilBidMarket.address) &&
    getAddress(
      await retry(
        () => moduleFactory.read.market(),
        "MODULE_FACTORY_MARKET_UNAVAILABLE",
      ),
    ) === getAddress(deployment.contracts.VeilBidMarket.address);
  assert.equal(
    evidence.assertions.moduleConfigurationVerified,
    true,
  );
  evidence.assertions.unwrapPreparationConfigurationVerified =
    getAddress(
      await retry(
        () => unwrapPreparation.read.wrapper(),
        "UNWRAP_PREPARATION_WRAPPER_UNAVAILABLE",
      ),
    ) ===
    getAddress(deployment.contracts.VeilBidConfidentialUSDC.address);
  assert.equal(
    evidence.assertions.unwrapPreparationConfigurationVerified,
    true,
  );

  const safeKit = await retry(
    () =>
      Safe.init({
        provider: requiredEnvironment("SEPOLIA_RPC_URL"),
        safeAddress: safeDeployment.address,
      }),
    "SAFE_CONNECTION_FAILED",
  );
  evidence.assertions.safeConfigurationVerified =
    (await retry(
      () => safeKit.isSafeDeployed(),
      "SAFE_DEPLOYMENT_CHECK_FAILED",
    )) === true &&
    safeKit.getContractVersion() === deployment.safe.version &&
    JSON.stringify(
      (
        await retry(
          () => safeKit.getOwners(),
          "SAFE_OWNERS_UNAVAILABLE",
        )
      ).map((owner) => getAddress(owner)),
    ) ===
      JSON.stringify(
        deployment.safe.owners.map((owner) =>
          getAddress(owner),
        ),
      ) &&
    (await retry(
      () => safeKit.getThreshold(),
      "SAFE_THRESHOLD_UNAVAILABLE",
    )) === deployment.safe.threshold;
  assert.equal(
    evidence.assertions.safeConfigurationVerified,
    true,
  );
  evidence.assertions.releaseOperationalStateVerified =
    (await retry(
      () =>
        safeKit.isModuleEnabled(
          deployment.contracts.VeilBidSafePreparationModule
            .address,
        ),
      "SAFE_MODULE_STATE_UNAVAILABLE",
    )) === true &&
    (await retry(
      () =>
        wrapper.read.isOperator([
          safeDeployment.address,
          deployment.contracts.VeilBidMarket.address,
        ]),
      "WRAPPER_OPERATOR_STATE_UNAVAILABLE",
    )) === true;
  assert.equal(
    evidence.assertions.releaseOperationalStateVerified,
    true,
  );

  stage = "SOURCE_MAPPINGS";
  for (const definition of artifactDefinitions) {
    const deployed = deployment.contracts[definition.name];
    const source = sourceMappings.get(definition.name);
    evidence.publicIdentifiers.sourceMappings[definition.name] = {
      creationMatch: source.creationMatch,
      runtimeMatch: source.runtimeMatch,
      repositoryUrl:
        `https://repo.sourcify.dev/${deployment.chainId}/${deployed.address}`,
    };
  }
  const safeSource = await sourcifyLookup(
    deployment.chainId,
    safeDeployment.address,
  );
  evidence.publicIdentifiers.sourceMappings.VeilBidDemoSafe = {
    creationMatch: safeSource.creationMatch,
    runtimeMatch: safeSource.runtimeMatch,
    repositoryUrl:
      `https://repo.sourcify.dev/${deployment.chainId}/${safeDeployment.address}`,
  };
  evidence.assertions.topLevelSourceMappingsExact =
    artifactDefinitions
      .filter((definition) => !definition.embedded)
      .every((definition) => {
        const mapping =
          evidence.publicIdentifiers.sourceMappings[
            definition.name
          ];
        return (
          mapping.creationMatch === "exact_match" &&
          mapping.runtimeMatch === "exact_match"
        );
      });
  evidence.assertions.embeddedReceiptSourceMappingVerified =
    evidence.publicIdentifiers.sourceMappings
      .VeilBidAwardReceipt.runtimeMatch === "exact_match" &&
    deployment.contracts.VeilBidAwardReceipt
      .deploymentTransaction ===
      deployment.contracts.VeilBidMarket.deploymentTransaction &&
    getAddress(await receipt.read.market()) ===
      getAddress(deployment.contracts.VeilBidMarket.address);
  evidence.assertions.safeSourceMappingExact =
    safeSource.creationMatch === "exact_match" &&
    safeSource.runtimeMatch === "exact_match";
  assert.equal(
    evidence.assertions.topLevelSourceMappingsExact,
    true,
  );
  assert.equal(
    evidence.assertions.embeddedReceiptSourceMappingVerified,
    true,
  );
  assert.equal(
    evidence.assertions.safeSourceMappingExact,
    true,
  );

  stage = "PROMOTION";
  if (promote) {
    const checkedAt = new Date().toISOString();
    deployment.verified = true;
    deployment.sourceVerification = {
      provider: "sourcify-v2",
      status: "verified",
      checkedAt,
      evidence:
        "evidence/sepolia/deployment-consistency.release.json",
    };
    const evidencePaths = new Set(deployment.evidence);
    evidencePaths.add(
      "evidence/sepolia/source-publication.release.json",
    );
    evidencePaths.add(
      "evidence/sepolia/deployment-consistency.release.json",
    );
    deployment.evidence = [...evidencePaths];
    deployment.notes = deployment.notes.filter(
      (note) =>
        !note.startsWith("Source verification remains pending") &&
        !note.startsWith("Exact top-level creation/runtime mappings"),
    );
    deployment.notes.push(
      "Exact top-level creation/runtime mappings, embedded receipt runtime mapping, Safe source mapping, constructor calldata, runtime bytecode, receipts, wiring, and operational state were verified before promotion.",
    );
    saveDeployment(deployment);
    evidence.assertions.manifestPromoted = true;
  } else {
    evidence.assertions.manifestPromoted =
      deployment.verified === true;
  }
  evidence.assertions.releaseManifestVerified =
    promote || deployment.verified === true;
  assert.equal(
    evidence.assertions.releaseManifestVerified,
    true,
    "Release verification must use --promote until the manifest is verified",
  );

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence:
        "evidence/sepolia/deployment-consistency.release.json",
      promoted: evidence.assertions.manifestPromoted,
      assertions: evidence.assertions,
      runtimeCodeHashes:
        evidence.publicIdentifiers.runtimeCodeHashes,
      sourceMappings:
        evidence.publicIdentifiers.sourceMappings,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `RELEASE_DEPLOYMENT_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`Verification stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
