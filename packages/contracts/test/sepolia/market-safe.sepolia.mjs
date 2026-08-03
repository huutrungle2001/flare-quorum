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
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import underlyingArtifact from "../../artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidTestUSDC.json" with {
  type: "json",
};
import wrapperArtifact from "../../artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidConfidentialUSDC.json" with {
  type: "json",
};
import marketArtifact from "../../artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json" with {
  type: "json",
};
import moduleArtifact from "../../artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json" with {
  type: "json",
};

const root = resolve(import.meta.dirname, "../../../..");
const marketEvidencePath = resolve(root, "evidence/sepolia/market-eoa.json");
const safeEvidencePath = resolve(root, "evidence/sepolia/gate-e-safe.json");
const outputPath = resolve(root, "evidence/sepolia/market-safe.json");
const budget = 30_000_000n;
const maxUint48 = (1n << 48n) - 1n;

const evidence = {
  schemaVersion: 1,
  suite: "production-market-safe",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "safe-1.4.1-and-official-nox-testnet",
  },
  publicIdentifiers: {
    owner: null,
    safe: null,
    tenderId: null,
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    productionModuleDeployed: false,
    moduleEnabledBySafe: false,
    marketConfiguredBySafe: false,
    marketOperatorAuthorizedBySafe: false,
    fullTenderTermsBound: false,
    wrongActionRejected: false,
    preparationDidNotMoveFunds: false,
    directOwnerCreateRejected: false,
    safeThresholdCreateFunded: false,
    exactFundingProofOpenedTender: false,
    safeThresholdCancelExecuted: false,
    preparedInputReplayRejected: false,
    safeAuthorityPreserved: false,
    cleanupRevokedModuleAndOperator: false,
  },
  blockers: [],
  notes: [
    "Balances, handles, proofs, signatures, RPC credentials, and wallet secrets were omitted.",
    "The threshold-1 Safe is the documented browser-demo configuration; all spending calls still used normal Safe transactions.",
    "The production module and wrapper operator permission were removed after the suite.",
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
  const value = requiredEnvironment("SEPOLIA_PRIVATE_KEY");
  const key = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("SEPOLIA_PRIVATE_KEY_INVALID");
  }
  return key;
}

async function retry(operation, code) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await operation();
    } catch {
      if (attempt === 11) throw new Error(code);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error(code);
}

async function main() {
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const privateKey = privateKeyFromEnvironment();
  const owner = privateKeyToAccount(privateKey);
  const marketEvidence = JSON.parse(readFileSync(marketEvidencePath, "utf8"));
  const safeEvidence = JSON.parse(readFileSync(safeEvidencePath, "utf8"));
  const {
    Market: marketAddress,
    Underlying: underlyingAddress,
    Wrapper: wrapperAddress,
  } = marketEvidence.publicIdentifiers.contracts;
  const safeAddress = safeEvidence.publicIdentifiers.safe;
  assert.ok(marketAddress && underlyingAddress && wrapperAddress && safeAddress);

  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({
    account: owner,
    chain: sepolia,
    transport,
  });
  const handles = await createViemHandleClient(wallet);
  const safeKit = await Safe.init({
    provider: rpcUrl,
    signer: privateKey,
    safeAddress,
  });
  assert.equal(await safeKit.isSafeDeployed(), true);
  const ownersBefore = await safeKit.getOwners();
  const thresholdBefore = await safeKit.getThreshold();
  evidence.publicIdentifiers.owner = owner.address;
  evidence.publicIdentifiers.safe = safeAddress;
  evidence.publicIdentifiers.contracts = {
    Market: marketAddress,
    Underlying: underlyingAddress,
    Wrapper: wrapperAddress,
  };

  async function record(label, promise) {
    const hash = await promise;
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = hash;
    evidence.publicIdentifiers.blocks[label] = receipt.blockNumber.toString();
    saveEvidence();
    return receipt;
  }

  async function safeTransaction(label, transaction) {
    const result = await safeKit.executeTransaction(transaction);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: result.hash,
    });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = result.hash;
    evidence.publicIdentifiers.blocks[label] = receipt.blockNumber.toString();
    saveEvidence();
  }

  async function safeCall(label, to, data) {
    await safeTransaction(
      label,
      await safeKit.createTransaction({
        transactions: [{ data, to, value: "0" }],
      }),
    );
  }

  async function ownerSimulationReverts(artifact, address, functionName, args) {
    await assert.rejects(
      publicClient.simulateContract({
        abi: artifact.abi,
        account: owner,
        address,
        args,
        functionName,
      }),
    );
  }

  const underlying = getContract({
    address: underlyingAddress,
    abi: underlyingArtifact.abi,
    client: { public: publicClient, wallet },
  });
  const wrapper = getContract({
    address: wrapperAddress,
    abi: wrapperArtifact.abi,
    client: { public: publicClient, wallet },
  });
  const market = getContract({
    address: marketAddress,
    abi: marketArtifact.abi,
    client: { public: publicClient, wallet },
  });

  stage = "MODULE_DEPLOYMENT";
  const moduleReceipt = await record(
    "deployModule",
    wallet.deployContract({
      abi: moduleArtifact.abi,
      account: owner,
      args: [safeAddress],
      bytecode: moduleArtifact.bytecode,
    }),
  );
  const moduleAddress = moduleReceipt.contractAddress;
  assert.ok(moduleAddress);
  evidence.publicIdentifiers.contracts.Module = moduleAddress;
  const module = getContract({
    address: moduleAddress,
    abi: moduleArtifact.abi,
    client: { public: publicClient, wallet },
  });
  evidence.assertions.productionModuleDeployed = true;
  saveEvidence();

  stage = "SAFE_CONFIGURATION";
  await safeTransaction(
    "enableModule",
    await safeKit.createEnableModuleTx(moduleAddress),
  );
  evidence.assertions.moduleEnabledBySafe =
    await safeKit.isModuleEnabled(moduleAddress);
  assert.equal(evidence.assertions.moduleEnabledBySafe, true);
  await safeCall(
    "configureMarket",
    moduleAddress,
    encodeFunctionData({
      abi: moduleArtifact.abi,
      functionName: "configureMarket",
      args: [marketAddress],
    }),
  );
  evidence.assertions.marketConfiguredBySafe =
    getAddress(await module.read.market()) === getAddress(marketAddress);
  assert.equal(evidence.assertions.marketConfiguredBySafe, true);
  await safeCall(
    "authorizeMarket",
    wrapperAddress,
    encodeFunctionData({
      abi: wrapperArtifact.abi,
      functionName: "setOperator",
      args: [marketAddress, maxUint48],
    }),
  );
  evidence.assertions.marketOperatorAuthorizedBySafe =
    await wrapper.read.isOperator([safeAddress, marketAddress]);
  assert.equal(evidence.assertions.marketOperatorAuthorizedBySafe, true);

  stage = "SAFE_ASSET_SETUP";
  await record("faucet", underlying.write.faucet());
  await record(
    "approveWrapper",
    underlying.write.approve([wrapperAddress, budget]),
  );
  await record(
    "wrapToSafe",
    wrapper.write.wrap([safeAddress, budget]),
  );
  const safeBalanceBeforePreparation =
    await wrapper.read.confidentialBalanceOf([safeAddress]);

  stage = "PREPARATION";
  const deadline = (await publicClient.getBlock()).timestamp + 600n;
  const vendors = [owner.address];
  const metadataHash = keccak256(toHex("veilbid-production-safe-v1"));
  const nonce = 1n;
  const actionDataHash = await market.read.hashTenderAction([
    safeAddress,
    owner.address,
    metadataHash,
    budget,
    deadline,
    vendors,
  ]);
  const actionHash = await module.read.computeActionHash([
    actionDataHash,
    nonce,
  ]);
  evidence.assertions.fullTenderTermsBound = actionHash !== actionDataHash;
  assert.equal(evidence.assertions.fullTenderTermsBound, true);
  const encryptedBudget = await handles.encryptInput(
    budget,
    "uint256",
    moduleAddress,
  );
  await ownerSimulationReverts(
    moduleArtifact,
    moduleAddress,
    "prepareInput",
    [
      encryptedBudget.handle,
      encryptedBudget.handleProof,
      marketAddress,
      actionDataHash,
      `0x${"11".repeat(32)}`,
      nonce,
    ],
  );
  evidence.assertions.wrongActionRejected = true;
  await record(
    "prepareInput",
    module.write.prepareInput([
      encryptedBudget.handle,
      encryptedBudget.handleProof,
      marketAddress,
      actionDataHash,
      actionHash,
      nonce,
    ]),
  );
  evidence.assertions.preparationDidNotMoveFunds =
    (await wrapper.read.confidentialBalanceOf([safeAddress])) ===
    safeBalanceBeforePreparation;
  assert.equal(evidence.assertions.preparationDidNotMoveFunds, true);

  await ownerSimulationReverts(
    marketArtifact,
    marketAddress,
    "createTenderAuthorized",
    [metadataHash, budget, deadline, vendors, owner.address, moduleAddress, nonce],
  );
  evidence.assertions.directOwnerCreateRejected = true;

  stage = "SAFE_CREATE";
  await safeCall(
    "safeCreateTender",
    marketAddress,
    encodeFunctionData({
      abi: marketArtifact.abi,
      functionName: "createTenderAuthorized",
      args: [
        metadataHash,
        budget,
        deadline,
        vendors,
        owner.address,
        moduleAddress,
        nonce,
      ],
    }),
  );
  const tenderId = await market.read.tenderCount();
  evidence.publicIdentifiers.tenderId = tenderId.toString();
  const pending = await market.read.getTender([tenderId]);
  evidence.assertions.safeThresholdCreateFunded =
    pending.status === 0 &&
    getAddress(pending.buyer) === getAddress(safeAddress) &&
    (await module.read.preparedConsumed([actionHash])) === true &&
    (await wrapper.read.confidentialBalanceOf([safeAddress])) !==
      safeBalanceBeforePreparation;
  assert.equal(evidence.assertions.safeThresholdCreateFunded, true);

  const funding = await retry(
    () => handles.publicDecrypt(pending.fundingCheckHandle),
    "FUNDING_PUBLIC_DECRYPT_TIMEOUT",
  );
  assert.equal(funding.value, true);
  await record(
    "confirmFunding",
    market.write.confirmTenderFunding([
      tenderId,
      funding.decryptionProof,
    ]),
  );
  evidence.assertions.exactFundingProofOpenedTender =
    (await market.read.getTender([tenderId])).status === 1;
  assert.equal(evidence.assertions.exactFundingProofOpenedTender, true);

  stage = "SAFE_CANCEL";
  await safeCall(
    "safeCancelTender",
    marketAddress,
    encodeFunctionData({
      abi: marketArtifact.abi,
      functionName: "cancelTender",
      args: [tenderId],
    }),
  );
  evidence.assertions.safeThresholdCancelExecuted =
    (await market.read.getTender([tenderId])).status === 5;
  assert.equal(evidence.assertions.safeThresholdCancelExecuted, true);
  await ownerSimulationReverts(
    moduleArtifact,
    moduleAddress,
    "prepareInput",
    [
      encryptedBudget.handle,
      encryptedBudget.handleProof,
      marketAddress,
      actionDataHash,
      actionHash,
      nonce,
    ],
  );
  evidence.assertions.preparedInputReplayRejected = true;

  stage = "CLEANUP";
  await safeTransaction(
    "disableModule",
    await safeKit.createDisableModuleTx(moduleAddress),
  );
  await safeCall(
    "revokeMarketOperator",
    wrapperAddress,
    encodeFunctionData({
      abi: wrapperArtifact.abi,
      functionName: "setOperator",
      args: [marketAddress, 0],
    }),
  );
  evidence.assertions.cleanupRevokedModuleAndOperator =
    (await safeKit.isModuleEnabled(moduleAddress)) === false &&
    (await wrapper.read.isOperator([safeAddress, marketAddress])) === false;
  assert.equal(
    evidence.assertions.cleanupRevokedModuleAndOperator,
    true,
  );
  evidence.assertions.safeAuthorityPreserved =
    (await safeKit.getThreshold()) === thresholdBefore &&
    JSON.stringify(
      (await safeKit.getOwners()).map((address) => address.toLowerCase()),
    ) ===
      JSON.stringify(ownersBefore.map((address) => address.toLowerCase()));
  assert.equal(evidence.assertions.safeAuthorityPreserved, true);

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/market-safe.json",
      tenderId: evidence.publicIdentifiers.tenderId,
      contracts: evidence.publicIdentifiers.contracts,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SEPOLIA_MARKET_SAFE_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
