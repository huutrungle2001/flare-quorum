import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  getContract,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const auctionHouseRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(auctionHouseRoot, "../..");
const deploymentPath = resolve(
  auctionHouseRoot,
  "deployments/sepolia.release.json",
);
const temporaryDeploymentPath = `${deploymentPath}.tmp`;
const artifactPath = resolve(
  auctionHouseRoot,
  "artifacts/contracts/safe/VeilBidSafeUnwrapPreparation.sol/VeilBidSafeUnwrapPreparation.json",
);
const dryRun = process.argv.includes("--dry-run");

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function privateKeyFromEnvironment() {
  const raw = requiredEnvironment("SEPOLIA_PRIVATE_KEY");
  const value = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("SEPOLIA_PRIVATE_KEY_INVALID");
  }
  return value;
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("GIT_COMMAND_FAILED");
  return result.stdout.trim();
}

function assertPublishedSourceState() {
  assert.equal(
    git(["status", "--porcelain=v1", "--untracked-files=all"]),
    "",
    "WORKTREE_NOT_CLEAN",
  );
  assert.equal(
    git(["rev-parse", "HEAD"]),
    git(["rev-parse", "@{upstream}"]),
    "UPSTREAM_NOT_SYNCHRONIZED",
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveManifest(manifest) {
  writeFileSync(
    temporaryDeploymentPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o644 },
  );
  renameSync(temporaryDeploymentPath, deploymentPath);
}

async function main() {
  assertPublishedSourceState();
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const privateKey = privateKeyFromEnvironment();
  const account = privateKeyToAccount(privateKey);
  const manifest = readJson(deploymentPath);
  const artifact = readJson(artifactPath);
  assert.equal(manifest.chainId, sepolia.id);
  assert.equal(manifest.kind, "release");
  assert.equal(manifest.deploymentState, "configured");
  assert.equal(manifest.blockers.length, 0);
  const wrapper = getAddress(
    manifest.contracts.VeilBidConfidentialUSDC.address,
  );

  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });
  assert.equal(await publicClient.getChainId(), sepolia.id);
  assert.equal(
    getAddress(manifest.deployedBy),
    getAddress(account.address),
    "DEPLOYER_MISMATCH",
  );

  const existing = manifest.contracts.VeilBidSafeUnwrapPreparation;
  if (existing?.address) {
    const address = getAddress(existing.address);
    const code = await publicClient.getCode({ address });
    assert.ok(code && code !== "0x", "UNWRAP_PREPARATION_CODE_MISSING");
    const preparation = getContract({
      address,
      abi: artifact.abi,
      client: publicClient,
    });
    assert.equal(getAddress(await preparation.read.wrapper()), wrapper);
    console.log(
      JSON.stringify({ mode: "existing", preparation: address, wrapper }),
    );
    return;
  }

  if (dryRun) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        deployer: account.address,
        wrapper,
        constructorArguments: [wrapper],
      }),
    );
    return;
  }

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    account,
    args: [wrapper],
    bytecode: artifact.bytecode,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 2,
  });
  assert.equal(receipt.status, "success");
  assert.ok(receipt.contractAddress);
  const preparationAddress = getAddress(receipt.contractAddress);
  const preparation = getContract({
    address: preparationAddress,
    abi: artifact.abi,
    client: publicClient,
  });
  assert.equal(getAddress(await preparation.read.wrapper()), wrapper);

  manifest.sourceCommit = git(["rev-parse", "HEAD"]);
  manifest.contracts.VeilBidSafeUnwrapPreparation = {
    address: preparationAddress,
    deploymentTransaction: hash,
    deploymentBlock: receipt.blockNumber.toString(),
  };
  manifest.verified = false;
  manifest.sourceVerification = {
    provider: "sourcify-v2",
    status: "pending",
    checkedAt: null,
  };
  manifest.notes = manifest.notes.filter(
    (note) =>
      !note.startsWith("Safe partial unwrap preparation deployed") &&
      !note.startsWith("Source verification remains pending"),
  );
  manifest.notes.push(
    "Safe partial unwrap preparation deployed without custody or Safe execution authority; every partial unwrap remains one threshold-approved atomic Safe batch.",
  );
  manifest.notes.push(
    "Source verification remains pending for the Safe partial unwrap preparation.",
  );
  saveManifest(manifest);
  console.log(
    JSON.stringify({
      mode: "deployed",
      preparation: preparationAddress,
      wrapper,
      deploymentTransaction: hash,
      deploymentBlock: receipt.blockNumber.toString(),
      sourceCommit: manifest.sourceCommit,
    }),
  );
}

main().catch((error) => {
  const blocker =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "SAFE_UNWRAP_PREPARATION_DEPLOYMENT_FAILED";
  console.error(JSON.stringify({ blocker }));
  process.exitCode = 1;
});
