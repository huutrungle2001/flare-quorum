import { strict as assert } from "node:assert";
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
const deploymentPath = resolve(
  auctionHouseRoot,
  "deployments/sepolia.release.json",
);
const temporaryDeploymentPath = `${deploymentPath}.tmp`;
const artifactPath = resolve(
  auctionHouseRoot,
  "artifacts/contracts/safe/VeilBidSafeModuleFactory.sol/VeilBidSafeModuleFactory.json",
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
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const privateKey = privateKeyFromEnvironment();
  const account = privateKeyToAccount(privateKey);
  const manifest = readJson(deploymentPath);
  const artifact = readJson(artifactPath);
  assert.equal(manifest.chainId, sepolia.id);
  assert.equal(manifest.kind, "release");
  assert.equal(manifest.deploymentState, "configured");
  const market = getAddress(manifest.contracts.VeilBidMarket.address);

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

  const existing = manifest.contracts.VeilBidSafeModuleFactory;
  if (existing?.address) {
    const code = await publicClient.getCode({
      address: getAddress(existing.address),
    });
    assert.ok(code && code !== "0x", "FACTORY_CODE_MISSING");
    const factory = getContract({
      address: getAddress(existing.address),
      abi: artifact.abi,
      client: publicClient,
    });
    assert.equal(getAddress(await factory.read.market()), market);
    console.log(JSON.stringify({
      mode: "existing",
      factory: getAddress(existing.address),
      market,
    }));
    return;
  }

  if (dryRun) {
    console.log(JSON.stringify({
      mode: "dry-run",
      deployer: account.address,
      market,
      constructorArguments: [market],
    }));
    return;
  }

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    account,
    args: [market],
    bytecode: artifact.bytecode,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 2,
  });
  assert.equal(receipt.status, "success");
  assert.ok(receipt.contractAddress);
  const factoryAddress = getAddress(receipt.contractAddress);
  const factory = getContract({
    address: factoryAddress,
    abi: artifact.abi,
    client: publicClient,
  });
  assert.equal(getAddress(await factory.read.market()), market);

  manifest.contracts.VeilBidSafeModuleFactory = {
    address: factoryAddress,
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
      !note.startsWith("Generic Safe module factory deployed"),
  );
  manifest.notes.push(
    "Generic Safe module factory deployed for deterministic, per-Safe preparation modules; every setup still requires the selected Safe threshold.",
  );
  manifest.notes.push(
    "Source verification remains pending for the generic Safe module factory.",
  );
  saveManifest(manifest);
  console.log(JSON.stringify({
    mode: "deployed",
    factory: factoryAddress,
    market,
    deploymentTransaction: hash,
    deploymentBlock: receipt.blockNumber.toString(),
  }));
}

main().catch((error) => {
  const blocker =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "SAFE_MODULE_FACTORY_DEPLOYMENT_FAILED";
  console.error(JSON.stringify({ blocker }));
  process.exitCode = 1;
});
