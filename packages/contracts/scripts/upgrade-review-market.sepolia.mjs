import { strict as assert } from "node:assert";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import Safe from "@safe-global/protocol-kit";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  getContract,
  http,
  keccak256,
  maxUint48,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const contractsRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(contractsRoot, "../..");
const deploymentPath = resolve(
  contractsRoot,
  "deployments/sepolia.release.json",
);
const temporaryDeploymentPath = `${deploymentPath}.tmp`;
const dryRun = process.argv.includes("--dry-run");
const artifactPaths = {
  market:
    "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
  module:
    "artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json",
  factory:
    "artifacts/contracts/safe/VeilBidSafeModuleFactory.sol/VeilBidSafeModuleFactory.json",
  wrapper:
    "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidConfidentialUSDC.json",
};
const executionSuccessTopic = keccak256(
  toHex("ExecutionSuccess(bytes32,uint256)"),
);

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

function git(args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("GIT_COMMAND_FAILED");
  return result.stdout.trim();
}

function assertCleanPushedSource() {
  assert.equal(git(["rev-parse", "HEAD"]), git(["rev-parse", "@{upstream}"]));
  assert.equal(git(["status", "--porcelain=v1"]), "", "WORKTREE_NOT_CLEAN");
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
  assertCleanPushedSource();
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const privateKey = privateKeyFromEnvironment();
  const account = privateKeyToAccount(privateKey);
  const currentCommit = git(["rev-parse", "HEAD"]);
  const previous = readJson(deploymentPath);
  assert.equal(previous.kind, "release");
  assert.equal(previous.verified, true, "CURRENT_RELEASE_NOT_VERIFIED");
  assert.equal(getAddress(previous.deployedBy), getAddress(account.address));

  const wrapperAddress = getAddress(
    previous.contracts.VeilBidConfidentialUSDC.address,
  );
  const safeAddress = getAddress(previous.contracts.VeilBidDemoSafe.address);
  const artifacts = Object.fromEntries(
    Object.entries(artifactPaths).map(([name, path]) => [
      name,
      readJson(resolve(contractsRoot, path)),
    ]),
  );

  if (dryRun) {
    console.log(JSON.stringify({
      mode: "dry-run",
      sourceCommit: currentCommit,
      reusedWrapper: wrapperAddress,
      reusedSafe: safeAddress,
      operations: [
        "deploy upgraded VeilBidMarket and embedded receipt",
        "deploy a new preparation module for the release Safe",
        "deploy a new per-Safe module factory bound to the upgraded Market",
        "enable and configure the new module through the Safe",
        "authorize the upgraded Market through the Safe",
        "promote an unverified manifest pending source publication and verification",
      ],
    }));
    return;
  }

  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });
  assert.equal(await publicClient.getChainId(), sepolia.id);
  const safeKit = await Safe.init({
    provider: rpcUrl,
    signer: privateKey,
    safeAddress,
  });
  assert.equal(await safeKit.isOwner(account.address), true);

  async function receipt(hash) {
    const confirmed = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 2,
    });
    assert.equal(confirmed.status, "success");
    return confirmed;
  }

  async function deploy(artifact, args = []) {
    const transactionHash = await walletClient.deployContract({
      abi: artifact.abi,
      account,
      args,
      bytecode: artifact.bytecode,
    });
    const confirmed = await receipt(transactionHash);
    assert.ok(confirmed.contractAddress);
    return {
      address: getAddress(confirmed.contractAddress),
      deploymentTransaction: transactionHash,
      deploymentBlock: confirmed.blockNumber.toString(),
    };
  }

  async function executeSafe(label, transaction) {
    const execution = await safeKit.executeTransaction(transaction, {
      gasLimit: 700_000n,
    });
    const confirmed = await receipt(execution.hash);
    assert.equal(
      confirmed.logs.some(
        (log) =>
          log.address.toLowerCase() === safeAddress.toLowerCase() &&
          log.topics[0]?.toLowerCase() === executionSuccessTopic.toLowerCase(),
      ),
      true,
      `${label}_SAFE_EXECUTION_FAILED`,
    );
    return {
      transactionHash: execution.hash,
      block: confirmed.blockNumber.toString(),
    };
  }

  async function safeCall(to, data) {
    return safeKit.createTransaction({
      transactions: [{ to, value: "0", data }],
    });
  }

  const marketDeployment = await deploy(artifacts.market, [wrapperAddress]);
  const market = getContract({
    address: marketDeployment.address,
    abi: artifacts.market.abi,
    client: publicClient,
  });
  const receiptAddress = getAddress(await market.read.awardReceipt());
  const receiptCode = await publicClient.getCode({ address: receiptAddress });
  assert.ok(receiptCode && receiptCode !== "0x");

  const moduleDeployment = await deploy(artifacts.module, [safeAddress]);
  const factoryDeployment = await deploy(artifacts.factory, [
    marketDeployment.address,
  ]);

  const enableModule = await executeSafe(
    "ENABLE_MODULE",
    await safeKit.createEnableModuleTx(moduleDeployment.address),
  );
  const configureMarket = await executeSafe(
    "CONFIGURE_MARKET",
    await safeCall(
      moduleDeployment.address,
      encodeFunctionData({
        abi: artifacts.module.abi,
        functionName: "configureMarket",
        args: [marketDeployment.address],
      }),
    ),
  );
  const authorizeMarket = await executeSafe(
    "AUTHORIZE_MARKET",
    await safeCall(
      wrapperAddress,
      encodeFunctionData({
        abi: artifacts.wrapper.abi,
        functionName: "setOperator",
        args: [marketDeployment.address, maxUint48],
      }),
    ),
  );

  const module = getContract({
    address: moduleDeployment.address,
    abi: artifacts.module.abi,
    client: publicClient,
  });
  const factory = getContract({
    address: factoryDeployment.address,
    abi: artifacts.factory.abi,
    client: publicClient,
  });
  const wrapper = getContract({
    address: wrapperAddress,
    abi: artifacts.wrapper.abi,
    client: publicClient,
  });
  assert.equal(await safeKit.isModuleEnabled(moduleDeployment.address), true);
  assert.equal(
    getAddress(await module.read.market()),
    marketDeployment.address,
  );
  assert.equal(
    getAddress(await factory.read.market()),
    marketDeployment.address,
  );
  assert.equal(
    await wrapper.read.isOperator([safeAddress, marketDeployment.address]),
    true,
  );

  const manifest = structuredClone(previous);
  manifest.sourceCommit = currentCommit;
  manifest.deploymentState = "configured";
  manifest.verified = false;
  manifest.contracts.VeilBidMarket = marketDeployment;
  manifest.contracts.VeilBidAwardReceipt = {
    address: receiptAddress,
    deploymentTransaction: marketDeployment.deploymentTransaction,
    deploymentBlock: marketDeployment.deploymentBlock,
  };
  manifest.contracts.VeilBidSafePreparationModule = {
    ...moduleDeployment,
    enabled: true,
  };
  manifest.contracts.VeilBidSafeModuleFactory = factoryDeployment;
  manifest.configurationTransactions = {
    enableModule,
    configureMarket,
    authorizeMarket,
  };
  manifest.sourceVerification = {
    provider: "sourcify-v2",
    status: "pending",
    checkedAt: null,
  };
  manifest.blockers = [];
  manifest.evidence = [];
  manifest.notes = [
    "This is VeilBid's canonical Ethereum Sepolia release deployment.",
    "The verified test token, confidential wrapper, release Safe, and unwrap adapter were preserved across the automatic-review Market upgrade.",
    "The review wallet is threshold-bound at Safe tender creation and receives per-bid viewer ACL only after proof-derived finalization.",
    `The previous verified Market ${previous.contracts.VeilBidMarket.address}, module ${previous.contracts.VeilBidSafePreparationModule.address}, and factory ${previous.contracts.VeilBidSafeModuleFactory.address} remain historical Sepolia deployments.`,
    "The new Market, embedded receipt, module, and factory remain unverified until exact source publication and the release verifier pass.",
  ];
  saveManifest(manifest);

  console.log(JSON.stringify({
    status: "configured-unverified",
    sourceCommit: currentCommit,
    market: marketDeployment.address,
    receipt: receiptAddress,
    module: moduleDeployment.address,
    factory: factoryDeployment.address,
    reusedWrapper: wrapperAddress,
    reusedSafe: safeAddress,
  }));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  console.error(JSON.stringify({
    status: "failed",
    blocker: /^[A-Z0-9_]+$/.test(message)
      ? message
      : "REVIEW_MARKET_UPGRADE_FAILED",
  }));
  process.exitCode = 1;
});
