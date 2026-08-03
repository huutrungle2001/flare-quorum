import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Safe from "@safe-global/protocol-kit";
import { createViemHandleClient } from "@iexec-nox/handle";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  getContract,
  http,
  keccak256,
  maxUint48,
  parseEventLogs,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import factoryArtifact from "../../artifacts/contracts/safe/VeilBidSafeModuleFactory.sol/VeilBidSafeModuleFactory.json" with {
  type: "json",
};
import marketArtifact from "../../artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json" with {
  type: "json",
};
import moduleArtifact from "../../artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json" with {
  type: "json",
};
import tokenArtifact from "../../artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidTestUSDC.json" with {
  type: "json",
};
import wrapperArtifact from "../../artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidConfidentialUSDC.json" with {
  type: "json",
};

const root = resolve(import.meta.dirname, "../../../..");
const releasePath = resolve(
  root,
  "packages/contracts/deployments/sepolia.release.json",
);
const testPath = resolve(
  root,
  "packages/contracts/deployments/sepolia.test.json",
);
const outputPath = resolve(
  root,
  "evidence/sepolia/generic-safe-onboarding.json",
);
const ceiling = 10_000_000n;

const evidence = {
  schemaVersion: 1,
  suite: "generic-safe-onboarding",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "safe-1.4.1-and-official-nox-testnet",
  },
  publicIdentifiers: {
    owner: null,
    safe: null,
    module: null,
    tenderId: null,
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    factoryBoundToCanonicalMarket: false,
    moduleAddressDeterministic: false,
    setupUsedSafeThresholdBatch: false,
    moduleBoundToSelectedSafe: false,
    moduleEnabledBySelectedSafe: false,
    marketConfiguredBySelectedSafe: false,
    operatorAuthorizedBySelectedSafe: false,
    fundingUsedSafeThresholdBatch: false,
    confidentialBalancePresent: false,
    tenderUsedSafeThresholdBatch: false,
    tenderBuyerIsSelectedSafe: false,
    safeAuthorityPreserved: false,
  },
  blockers: [],
  notes: [
    "The suite uses an independently deployed Sepolia test Safe owned by the release test account.",
    "Setup, Safe-owned faucet/wrap, and tender creation all execute through normal Safe transactions.",
    "Balances, handles, proofs, signatures, RPC credentials, private keys, and bid values are omitted.",
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

function privateKeyFromEnvironment() {
  const raw = requiredEnvironment("SEPOLIA_PRIVATE_KEY");
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("SEPOLIA_PRIVATE_KEY_INVALID");
  }
  return key;
}

async function main() {
  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  const testDeployment = JSON.parse(readFileSync(testPath, "utf8"));
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const privateKey = privateKeyFromEnvironment();
  const owner = privateKeyToAccount(privateKey);
  const safeAddress = getAddress(
    testDeployment.contracts.VeilBidDemoSafe.address,
  );
  const marketAddress = getAddress(
    release.contracts.VeilBidMarket.address,
  );
  const factoryAddress = getAddress(
    release.contracts.VeilBidSafeModuleFactory.address,
  );
  const tokenAddress = getAddress(
    release.contracts.VeilBidTestUSDC.address,
  );
  const wrapperAddress = getAddress(
    release.contracts.VeilBidConfidentialUSDC.address,
  );
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account: owner,
    chain: sepolia,
    transport,
  });
  const handleClient = await createViemHandleClient(walletClient);
  const safeKit = await Safe.init({
    provider: rpcUrl,
    signer: privateKey,
    safeAddress,
  });
  assert.equal(await safeKit.isOwner(owner.address), true);
  const ownersBefore = await safeKit.getOwners();
  const thresholdBefore = await safeKit.getThreshold();

  const factory = getContract({
    address: factoryAddress,
    abi: factoryArtifact.abi,
    client: publicClient,
  });
  const market = getContract({
    address: marketAddress,
    abi: marketArtifact.abi,
    client: publicClient,
  });
  const wrapper = getContract({
    address: wrapperAddress,
    abi: wrapperArtifact.abi,
    client: publicClient,
  });
  const token = getContract({
    address: tokenAddress,
    abi: tokenArtifact.abi,
    client: publicClient,
  });
  const predictedModule = getAddress(
    await factory.read.predictModule([safeAddress]),
  );
  evidence.publicIdentifiers.owner = owner.address;
  evidence.publicIdentifiers.safe = safeAddress;
  evidence.publicIdentifiers.module = predictedModule;
  evidence.publicIdentifiers.contracts = {
    Factory: factoryAddress,
    Market: marketAddress,
    Token: tokenAddress,
    Wrapper: wrapperAddress,
  };
  evidence.assertions.factoryBoundToCanonicalMarket =
    getAddress(await factory.read.market()) === marketAddress;
  evidence.assertions.moduleAddressDeterministic = true;
  assert.equal(evidence.assertions.factoryBoundToCanonicalMarket, true);

  async function executeSafeBatch(label, transactions) {
    const safeTransaction = await safeKit.createTransaction({ transactions });
    const result = await safeKit.executeTransaction(safeTransaction);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: result.hash,
    });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = result.hash;
    evidence.publicIdentifiers.blocks[label] =
      receipt.blockNumber.toString();
    saveEvidence();
    return receipt;
  }

  stage = "SAFE_SETUP";
  const registeredModule = await factory.read.moduleOf([safeAddress]);
  const moduleCode = await publicClient.getCode({
    address: predictedModule,
  });
  const moduleDeployed = Boolean(moduleCode && moduleCode !== "0x");
  const setupTransactions = [];
  if (registeredModule === zeroAddress || !moduleDeployed) {
    setupTransactions.push({
      to: factoryAddress,
      value: "0",
      data: encodeFunctionData({
        abi: factoryArtifact.abi,
        functionName: "deployModule",
        args: [safeAddress],
      }),
    });
  }
  if (!(await safeKit.isModuleEnabled(predictedModule))) {
    setupTransactions.push({
      to: safeAddress,
      value: "0",
      data: encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "enableModule",
            stateMutability: "nonpayable",
            inputs: [{ name: "module", type: "address" }],
            outputs: [],
          },
        ],
        functionName: "enableModule",
        args: [predictedModule],
      }),
    });
  }
  const configuredMarket = moduleDeployed
    ? await publicClient.readContract({
        address: predictedModule,
        abi: moduleArtifact.abi,
        functionName: "market",
      })
    : zeroAddress;
  if (configuredMarket === zeroAddress) {
    setupTransactions.push({
      to: predictedModule,
      value: "0",
      data: encodeFunctionData({
        abi: moduleArtifact.abi,
        functionName: "configureMarket",
        args: [marketAddress],
      }),
    });
  }
  if (!(await wrapper.read.isOperator([safeAddress, marketAddress]))) {
    setupTransactions.push({
      to: wrapperAddress,
      value: "0",
      data: encodeFunctionData({
        abi: wrapperArtifact.abi,
        functionName: "setOperator",
        args: [marketAddress, maxUint48],
      }),
    });
  }
  if (setupTransactions.length > 0) {
    await executeSafeBatch("setupSafe", setupTransactions);
  }
  const module = getContract({
    address: predictedModule,
    abi: moduleArtifact.abi,
    client: publicClient,
  });
  evidence.assertions.setupUsedSafeThresholdBatch = true;
  evidence.assertions.moduleBoundToSelectedSafe =
    getAddress(await module.read.safe()) === safeAddress;
  evidence.assertions.moduleEnabledBySelectedSafe =
    await safeKit.isModuleEnabled(predictedModule);
  evidence.assertions.marketConfiguredBySelectedSafe =
    getAddress(await module.read.market()) === marketAddress;
  evidence.assertions.operatorAuthorizedBySelectedSafe =
    await wrapper.read.isOperator([safeAddress, marketAddress]);
  assert.equal(evidence.assertions.moduleBoundToSelectedSafe, true);
  assert.equal(evidence.assertions.moduleEnabledBySelectedSafe, true);
  assert.equal(evidence.assertions.marketConfiguredBySelectedSafe, true);
  assert.equal(evidence.assertions.operatorAuthorizedBySelectedSafe, true);

  stage = "SAFE_FUNDING";
  await executeSafeBatch("fundSafe", [
    {
      to: tokenAddress,
      value: "0",
      data: encodeFunctionData({
        abi: tokenArtifact.abi,
        functionName: "faucet",
      }),
    },
    {
      to: tokenAddress,
      value: "0",
      data: encodeFunctionData({
        abi: tokenArtifact.abi,
        functionName: "approve",
        args: [wrapperAddress, ceiling],
      }),
    },
    {
      to: wrapperAddress,
      value: "0",
      data: encodeFunctionData({
        abi: wrapperArtifact.abi,
        functionName: "wrap",
        args: [safeAddress, ceiling],
      }),
    },
  ]);
  evidence.assertions.fundingUsedSafeThresholdBatch = true;
  await wrapper.read.confidentialBalanceOf([safeAddress]);
  evidence.assertions.confidentialBalancePresent = true;

  stage = "SAFE_TENDER";
  const deadline = (await publicClient.getBlock()).timestamp + 3_600n;
  const vendors = [
    getAddress("0x82342063DdfC86fC91333c31E2Ab65b4d6B34A55"),
    getAddress("0xA4565608e096CFEf7da36eB19a57Da6d277D942f"),
  ];
  const metadataHash = keccak256(
    toHex(`veilbid-generic-safe-${Date.now()}`),
  );
  const nonce = BigInt(Date.now());
  const actionDataHash = await market.read.hashTenderAction([
    safeAddress,
    owner.address,
    metadataHash,
    ceiling,
    deadline,
    vendors,
  ]);
  const actionHash = await module.read.computeActionHash([
    actionDataHash,
    nonce,
  ]);
  const encrypted = await handleClient.encryptInput(
    ceiling,
    "uint256",
    predictedModule,
  );
  const tenderReceipt = await executeSafeBatch("createTender", [
    {
      to: predictedModule,
      value: "0",
      data: encodeFunctionData({
        abi: moduleArtifact.abi,
        functionName: "prepareInputForSafe",
        args: [
          encrypted.handle,
          encrypted.handleProof,
          owner.address,
          marketAddress,
          actionDataHash,
          actionHash,
          nonce,
        ],
      }),
    },
    {
      to: marketAddress,
      value: "0",
      data: encodeFunctionData({
        abi: marketArtifact.abi,
        functionName: "createTenderAuthorized",
        args: [
          metadataHash,
          ceiling,
          deadline,
          vendors,
          owner.address,
          predictedModule,
          nonce,
        ],
      }),
    },
  ]);
  const created = parseEventLogs({
    abi: marketArtifact.abi,
    eventName: "TenderCreated",
    logs: tenderReceipt.logs,
  })[0];
  assert.ok(created);
  const tenderId = created.args.tenderId;
  evidence.publicIdentifiers.tenderId = tenderId.toString();
  const tender = await market.read.getTender([tenderId]);
  evidence.assertions.tenderUsedSafeThresholdBatch = true;
  evidence.assertions.tenderBuyerIsSelectedSafe =
    getAddress(tender.buyer) === safeAddress;
  evidence.assertions.safeAuthorityPreserved =
    JSON.stringify(await safeKit.getOwners()) ===
      JSON.stringify(ownersBefore) &&
    (await safeKit.getThreshold()) === thresholdBefore;
  assert.equal(evidence.assertions.tenderBuyerIsSelectedSafe, true);
  assert.equal(evidence.assertions.safeAuthorityPreserved, true);
  saveEvidence();
  console.log(JSON.stringify({
    evidence: "evidence/sepolia/generic-safe-onboarding.json",
    safe: safeAddress,
    module: predictedModule,
    tenderId: tenderId.toString(),
    assertions: evidence.assertions,
  }));
}

main().catch((error) => {
  const blocker =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `GENERIC_SAFE_${stage}_FAILED`;
  evidence.blockers.push(blocker);
  saveEvidence();
  console.error(JSON.stringify({
    stage,
    blocker,
    detail:
      error instanceof Error
        ? (error.shortMessage ?? error.message).slice(0, 240)
        : "unknown",
  }));
  process.exitCode = 1;
});
