import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createPublicClient,
  formatEther,
  getAddress,
  http,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const auctionHouseRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(auctionHouseRoot, "../..");
const outputPath = resolve(
  repositoryRoot,
  "evidence/sepolia/release-preflight.json",
);
const deploymentPath = resolve(
  auctionHouseRoot,
  "deployments/sepolia.release.json",
);
const noWrite = process.argv.includes("--no-write");
const minimumDeployerBalance = 20_000_000_000_000_000n;
const minimumVendorBalance = 1_000_000_000_000_000n;

const artifactDefinitions = [
  {
    path: "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidTestUSDC.json",
  },
  {
    path: "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidConfidentialUSDC.json",
  },
  {
    path: "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
  },
  {
    path: "artifacts/contracts/receipt/VeilBidAwardReceipt.sol/VeilBidAwardReceipt.json",
    buildFrom:
      "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
  },
  {
    path: "artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json",
  },
  {
    path: "artifacts/contracts/safe/VeilBidSafeModuleFactory.sol/VeilBidSafeModuleFactory.json",
  },
  {
    path: "artifacts/contracts/safe/VeilBidSafeUnwrapPreparation.sol/VeilBidSafeUnwrapPreparation.json",
  },
];

const evidence = {
  schemaVersion: 1,
  suite: "release-deployment-preflight",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
  },
  publicIdentifiers: {
    sourceCommit: null,
    upstreamCommit: null,
    deployer: null,
    vendor: null,
    latestBlock: null,
    artifactCreationCodeHashes: {},
    buildInputHashes: {},
  },
  assertions: {
    chainIdVerified: false,
    credentialsConfigured: false,
    distinctActorsVerified: false,
    deployerBalanceSufficient: false,
    vendorBalanceSufficient: false,
    worktreeClean: false,
    upstreamSynchronized: false,
    environmentFileUntracked: false,
    artifactsCompiled: false,
    releaseManifestSafe: false,
  },
  blockers: [],
  notes: [
    "RPC credentials, private keys, exact wallet balances, and transaction signatures are omitted.",
    `The deployer threshold is ${formatEther(minimumDeployerBalance)} Sepolia ETH and the secondary vendor threshold is ${formatEther(minimumVendorBalance)} Sepolia ETH.`,
    "This command is read-only with respect to Ethereum Sepolia.",
  ],
};

let stage = "CONFIGURATION";

function saveEvidence() {
  if (noWrite) return;
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

function privateKeyFromEnvironment(name) {
  const raw = requiredEnvironment(name);
  const value = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error("GIT_COMMAND_FAILED");
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function main() {
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const deployer = privateKeyToAccount(
    privateKeyFromEnvironment("SEPOLIA_PRIVATE_KEY"),
  );
  const vendor = privateKeyToAccount(
    privateKeyFromEnvironment("SEPOLIA_VENDOR_PRIVATE_KEY"),
  );
  evidence.assertions.credentialsConfigured = true;
  evidence.publicIdentifiers.deployer = deployer.address;
  evidence.publicIdentifiers.vendor = vendor.address;
  evidence.assertions.distinctActorsVerified =
    getAddress(deployer.address) !== getAddress(vendor.address);
  assert.equal(evidence.assertions.distinctActorsVerified, true);

  stage = "SOURCE_STATE";
  const sourceCommit = git(["rev-parse", "HEAD"]).stdout.trim();
  const upstreamCommit = git(["rev-parse", "@{upstream}"]).stdout.trim();
  evidence.publicIdentifiers.sourceCommit = sourceCommit;
  evidence.publicIdentifiers.upstreamCommit = upstreamCommit;
  evidence.assertions.worktreeClean =
    git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout === "";
  evidence.assertions.upstreamSynchronized =
    sourceCommit === upstreamCommit;
  evidence.assertions.environmentFileUntracked =
    git(
      ["ls-files", "--error-unmatch", ".env.local"],
      { allowFailure: true },
    ).status !== 0;
  assert.equal(evidence.assertions.worktreeClean, true);
  assert.equal(evidence.assertions.upstreamSynchronized, true);
  assert.equal(evidence.assertions.environmentFileUntracked, true);

  stage = "ARTIFACTS";
  for (const definition of artifactDefinitions) {
    const artifact = readJson(
      resolve(auctionHouseRoot, definition.path),
    );
    const buildArtifact = definition.buildFrom
      ? readJson(resolve(auctionHouseRoot, definition.buildFrom))
      : artifact;
    assert.ok(artifact.contractName);
    const buildInputPath = resolve(
      auctionHouseRoot,
      `artifacts/build-info/${buildArtifact.buildInfoId}.json`,
    );
    const buildInput = readFileSync(buildInputPath, "utf8");
    const buildOutput = readJson(
      resolve(
        auctionHouseRoot,
        `artifacts/build-info/${buildArtifact.buildInfoId}.output.json`,
      ),
    );
    const creationCode =
      buildOutput.output.contracts[`project/${artifact.sourceName}`][
        artifact.contractName
      ].evm.bytecode.object;
    assert.ok(/^[0-9a-f]+$/i.test(creationCode));
    assert.ok(creationCode.length > 0);
    const contractIdentifier =
      `${artifact.sourceName}:${artifact.contractName}`;
    evidence.publicIdentifiers.artifactCreationCodeHashes[
      contractIdentifier
    ] = keccak256(`0x${creationCode}`);
    evidence.publicIdentifiers.buildInputHashes[contractIdentifier] =
      sha256(buildInput);
  }
  evidence.assertions.artifactsCompiled = true;

  stage = "MANIFEST";
  if (!existsSync(deploymentPath)) {
    evidence.assertions.releaseManifestSafe = true;
  } else {
    const deployment = readJson(deploymentPath);
    evidence.assertions.releaseManifestSafe =
      deployment.kind === "release" &&
      deployment.verified === false &&
      deployment.sourceCommit === sourceCommit &&
      getAddress(deployment.deployedBy) === getAddress(deployer.address);
  }
  assert.equal(evidence.assertions.releaseManifestSafe, true);

  stage = "NETWORK";
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  evidence.assertions.chainIdVerified =
    (await publicClient.getChainId()) === sepolia.id;
  assert.equal(evidence.assertions.chainIdVerified, true);
  evidence.publicIdentifiers.latestBlock = (
    await publicClient.getBlockNumber()
  ).toString();
  const [deployerBalance, vendorBalance] = await Promise.all([
    publicClient.getBalance({ address: deployer.address }),
    publicClient.getBalance({ address: vendor.address }),
  ]);
  evidence.assertions.deployerBalanceSufficient =
    deployerBalance >= minimumDeployerBalance;
  evidence.assertions.vendorBalanceSufficient =
    vendorBalance >= minimumVendorBalance;
  assert.equal(evidence.assertions.deployerBalanceSufficient, true);
  assert.equal(evidence.assertions.vendorBalanceSufficient, true);

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: noWrite
        ? null
        : "evidence/sepolia/release-preflight.json",
      assertions: evidence.assertions,
      publicIdentifiers: evidence.publicIdentifiers,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `RELEASE_PREFLIGHT_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`Preflight stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
