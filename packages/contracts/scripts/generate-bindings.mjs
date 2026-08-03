import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const auctionHouseRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(auctionHouseRoot, "../..");
const generatedRoot = resolve(
  repositoryRoot,
  "packages/chain-bindings/generated",
);
const checkOnly = process.argv.includes("--check");

const contracts = [
  {
    name: "VeilBidMarket",
    artifact:
      "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
  },
  {
    name: "VeilBidAwardReceipt",
    artifact:
      "artifacts/contracts/receipt/VeilBidAwardReceipt.sol/VeilBidAwardReceipt.json",
  },
  {
    name: "VeilBidSafePreparationModule",
    artifact:
      "artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json",
  },
  {
    name: "VeilBidSafeModuleFactory",
    artifact:
      "artifacts/contracts/safe/VeilBidSafeModuleFactory.sol/VeilBidSafeModuleFactory.json",
  },
  {
    name: "VeilBidSafeUnwrapPreparation",
    artifact:
      "artifacts/contracts/safe/VeilBidSafeUnwrapPreparation.sol/VeilBidSafeUnwrapPreparation.json",
  },
  {
    name: "VeilBidTestUSDC",
    artifact:
      "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidTestUSDC.json",
  },
  {
    name: "VeilBidConfidentialUSDC",
    artifact:
      "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidConfidentialUSDC.json",
  },
];

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const outputs = new Map();
const manifestContracts = [];
for (const contract of contracts) {
  const artifactPath = resolve(auctionHouseRoot, contract.artifact);
  const artifact = readJson(artifactPath);
  const relativeOutput = `abis/${contract.name}.json`;
  const content = serialized(artifact.abi);
  outputs.set(relativeOutput, content);
  manifestContracts.push({
    contractName: contract.name,
    abi: relativeOutput,
    sha256: digest(content),
  });
}

const deploymentDefinitions = [
  {
    input: "deployments/sepolia.test.json",
    output: "addresses/sepolia.test.json",
  },
  {
    input: "deployments/sepolia.release.json",
    output: "addresses/sepolia.release.json",
  },
].filter(({ input }) =>
  existsSync(resolve(auctionHouseRoot, input)),
);

const deployments = [];
for (const definition of deploymentDefinitions) {
  const deployment = readJson(
    resolve(auctionHouseRoot, definition.input),
  );
  const addressContent = serialized(deployment);
  outputs.set(definition.output, addressContent);
  deployments.push({
    network: deployment.network,
    chainId: deployment.chainId,
    kind: deployment.kind,
    verified: deployment.verified,
    addresses: definition.output,
    sha256: digest(addressContent),
  });
}

outputs.set(
  "manifest.json",
  serialized({
    schemaVersion: 1,
    generator: "packages/contracts/scripts/generate-bindings.mjs",
    contracts: manifestContracts,
    deployments,
  }),
);

const stale = [];
for (const [relativePath, expected] of outputs) {
  const outputPath = resolve(generatedRoot, relativePath);
  if (checkOnly) {
    let actual;
    try {
      actual = readFileSync(outputPath, "utf8");
    } catch {
      stale.push(relativePath);
      continue;
    }
    if (actual !== expected) stale.push(relativePath);
    continue;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, expected);
}

if (checkOnly && stale.length > 0) {
  console.error(`Generated bindings are stale: ${stale.join(", ")}`);
  process.exitCode = 1;
} else if (checkOnly) {
  console.log(`Verified ${outputs.size} generated binding files.`);
} else {
  console.log(`Generated ${outputs.size} binding files.`);
}
