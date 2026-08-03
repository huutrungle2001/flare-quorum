import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Safe from "@safe-global/protocol-kit";
import { createViemHandleClient } from "@iexec-nox/handle";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getContract,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import underlyingArtifact from "../../../artifacts/contracts/feasibility/EscrowSettlementSpikes.sol/TestUSDC.json" with {
  type: "json",
};
import wrapperArtifact from "../../../artifacts/contracts/feasibility/EscrowSettlementSpikes.sol/TestConfidentialUSDC.json" with {
  type: "json",
};
import moduleArtifact from "../../../artifacts/contracts/feasibility/SafePreparationSpike.sol/SafePreparationModuleSpike.json" with {
  type: "json",
};
import consumerArtifact from "../../../artifacts/contracts/feasibility/SafePreparationSpike.sol/SafeFundingConsumerSpike.json" with {
  type: "json",
};

const root = resolve(import.meta.dirname, "../../../../..");
const safeEvidencePath = resolve(root, "evidence/sepolia/gate-e-safe.json");
const outputPath = resolve(root, "evidence/sepolia/gate-e.json");
const zeroBytes32 = `0x${"0".repeat(64)}`;
const budget = 100_000_000n;
const maxUint48 = (1n << 48n) - 1n;

const evidence = {
  schemaVersion: 1,
  gate: "E",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "safe-1.4.1-and-official-nox-testnet",
  },
  packages: {
    safeProtocolKit: "8.0.4",
    safeAccount: "1.4.1",
  },
  publicIdentifiers: {
    owner: null,
    safe: null,
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    safeModuleEnabledByThreshold: false,
    marketConfiguredBySafe: false,
    safeOperatorAuthorizedByThreshold: false,
    wrongConsumerRejected: false,
    wrongActionRejected: false,
    nonceReplayRejected: false,
    preparedAclScoped: false,
    preparationDidNotMoveSafeFunds: false,
    directOwnerFundingRejected: false,
    safeAuthorizedFundingExecuted: false,
    exactFundingProofVerified: false,
    consumedInputReplayRejected: false,
    revokeBlockedNewPreparation: false,
    revokePreservedSafeState: false,
    reenableRestoredPreparation: false,
    moduleExecutionSurfaceAbsent: false,
    cleanupRevokedModuleAndOperator: false,
  },
  blockers: [],
  notes: [
    "Confidential values, balance identifiers, prepared inputs, proofs, signatures, and wallet secrets were omitted from this artifact.",
    "The threshold-1 Safe is a browser-demo limitation; higher thresholds remain executable through Safe Wallet.",
    "The module was disabled and its token operator authorization was revoked after the assertions.",
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

function normalizePrivateKey(value) {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("SEPOLIA_PRIVATE_KEY_INVALID");
  }
  return normalized;
}

async function publicDecryptEventually(handleClient, encryptedValue) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await handleClient.publicDecrypt(encryptedValue);
    } catch (error) {
      if (attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error("PUBLIC_DECRYPT_RETRY_EXHAUSTED");
}

async function main() {
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const privateKey = normalizePrivateKey(
    requiredEnvironment("SEPOLIA_PRIVATE_KEY"),
  );
  const unrelatedPrivateKey = normalizePrivateKey(
    requiredEnvironment("SEPOLIA_VENDOR_PRIVATE_KEY"),
  );
  const owner = privateKeyToAccount(privateKey);
  const unrelated = privateKeyToAccount(unrelatedPrivateKey);
  const safeDeploymentEvidence = JSON.parse(
    readFileSync(safeEvidencePath, "utf8"),
  );
  const safeAddress = safeDeploymentEvidence.publicIdentifiers.safe;
  assert.ok(safeAddress);

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
  assert.equal(await safeKit.isSafeDeployed(), true);
  assert.equal(safeKit.getContractVersion(), "1.4.1");
  evidence.publicIdentifiers.owner = owner.address;
  evidence.publicIdentifiers.safe = safeAddress;

  async function recordTransaction(label, transactionPromise) {
    const transactionHash = await transactionPromise;
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = transactionHash;
    evidence.publicIdentifiers.blocks[label] = receipt.blockNumber.toString();
    saveEvidence();
    return receipt;
  }

  async function deploy(label, artifact, args = []) {
    const receipt = await recordTransaction(
      `deploy${label}`,
      walletClient.deployContract({
        abi: artifact.abi,
        account: owner,
        args,
        bytecode: artifact.bytecode,
      }),
    );
    assert.ok(receipt.contractAddress);
    evidence.publicIdentifiers.contracts[label] = receipt.contractAddress;
    saveEvidence();
    return receipt.contractAddress;
  }

  async function executeSafeTransaction(label, safeTransaction) {
    const result = await safeKit.executeTransaction(safeTransaction);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: result.hash,
    });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = result.hash;
    evidence.publicIdentifiers.blocks[label] = receipt.blockNumber.toString();
    saveEvidence();
    return receipt;
  }

  async function executeSafeCall(label, to, data) {
    const safeTransaction = await safeKit.createTransaction({
      transactions: [{ data, to, value: "0" }],
    });
    return executeSafeTransaction(label, safeTransaction);
  }

  async function expectOwnerCallRevert(
    artifact,
    address,
    functionName,
    args = [],
  ) {
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

  stage = "CONTRACT_DEPLOYMENT";
  const underlyingAddress = await deploy("Underlying", underlyingArtifact);
  const wrapperAddress = await deploy("Wrapper", wrapperArtifact, [
    underlyingAddress,
  ]);
  const moduleAddress = await deploy("Module", moduleArtifact, [safeAddress]);
  const consumerAddress = await deploy("Consumer", consumerArtifact, [
    safeAddress,
    moduleAddress,
    wrapperAddress,
    budget,
  ]);
  const underlying = getContract({
    address: underlyingAddress,
    abi: underlyingArtifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });
  const wrapper = getContract({
    address: wrapperAddress,
    abi: wrapperArtifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });
  const module = getContract({
    address: moduleAddress,
    abi: moduleArtifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });
  const consumer = getContract({
    address: consumerAddress,
    abi: consumerArtifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });

  evidence.assertions.moduleExecutionSurfaceAbsent = !moduleArtifact.abi.some(
    ({ type, name }) =>
      type === "function" &&
      [
        "execTransactionFromModule",
        "execTransactionFromModuleReturnData",
        "execute",
        "executeTransaction",
      ].includes(name),
  );
  assert.equal(evidence.assertions.moduleExecutionSurfaceAbsent, true);

  stage = "SAFE_ASSET_SETUP";
  await recordTransaction(
    "mintUnderlying",
    underlying.write.mint([owner.address, budget]),
  );
  await recordTransaction(
    "approveWrapper",
    underlying.write.approve([wrapperAddress, budget]),
  );
  await recordTransaction(
    "wrapToSafe",
    wrapper.write.wrap([safeAddress, budget]),
  );
  const safeBalanceBeforePreparation =
    await wrapper.read.confidentialBalanceOf([safeAddress]);
  assert.notEqual(safeBalanceBeforePreparation, zeroBytes32);

  stage = "ENABLE_MODULE";
  await executeSafeTransaction(
    "enableModule",
    await safeKit.createEnableModuleTx(moduleAddress),
  );
  evidence.assertions.safeModuleEnabledByThreshold =
    await safeKit.isModuleEnabled(moduleAddress);
  assert.equal(evidence.assertions.safeModuleEnabledByThreshold, true);

  stage = "CONFIGURE_MARKET";
  await executeSafeCall(
    "configureMarket",
    moduleAddress,
    encodeFunctionData({
      abi: moduleArtifact.abi,
      args: [consumerAddress],
      functionName: "configureMarket",
    }),
  );
  evidence.assertions.marketConfiguredBySafe =
    (await module.read.market()).toLowerCase() === consumerAddress.toLowerCase();
  assert.equal(evidence.assertions.marketConfiguredBySafe, true);

  stage = "AUTHORIZE_OPERATOR";
  await executeSafeCall(
    "authorizeOperator",
    wrapperAddress,
    encodeFunctionData({
      abi: wrapperArtifact.abi,
      args: [consumerAddress, maxUint48],
      functionName: "setOperator",
    }),
  );
  evidence.assertions.safeOperatorAuthorizedByThreshold =
    await wrapper.read.isOperator([safeAddress, consumerAddress]);
  assert.equal(
    evidence.assertions.safeOperatorAuthorizedByThreshold,
    true,
  );

  const ownersBefore = await safeKit.getOwners();
  const thresholdBefore = await safeKit.getThreshold();

  stage = "PREPARATION_BINDING";
  const nonce = 1n;
  const actionHash = await module.read.computeActionHash([nonce]);
  const encryptedBudget = await handleClient.encryptInput(
    budget,
    "uint256",
    moduleAddress,
  );
  await expectOwnerCallRevert(
    moduleArtifact,
    moduleAddress,
    "prepareInput",
    [
      encryptedBudget.handle,
      encryptedBudget.handleProof,
      unrelated.address,
      actionHash,
      nonce,
    ],
  );
  evidence.assertions.wrongConsumerRejected = true;
  const wrongActionHash = `0x${"11".repeat(32)}`;
  await expectOwnerCallRevert(
    moduleArtifact,
    moduleAddress,
    "prepareInput",
    [
      encryptedBudget.handle,
      encryptedBudget.handleProof,
      consumerAddress,
      wrongActionHash,
      nonce,
    ],
  );
  evidence.assertions.wrongActionRejected = true;

  await recordTransaction(
    "prepareInput",
    module.write.prepareInput([
      encryptedBudget.handle,
      encryptedBudget.handleProof,
      consumerAddress,
      actionHash,
      nonce,
    ]),
  );
  const safeBalanceAfterPreparation =
    await wrapper.read.confidentialBalanceOf([safeAddress]);
  evidence.assertions.preparationDidNotMoveSafeFunds =
    safeBalanceAfterPreparation === safeBalanceBeforePreparation;
  assert.equal(evidence.assertions.preparationDidNotMoveSafeFunds, true);

  evidence.assertions.preparedAclScoped =
    (await module.read.preparedAllowedFor([actionHash, moduleAddress])) ===
      true &&
    (await module.read.preparedAllowedFor([actionHash, safeAddress])) === true &&
    (await module.read.preparedAllowedFor([actionHash, consumerAddress])) ===
      true &&
    (await module.read.preparedAllowedFor([actionHash, unrelated.address])) ===
      false;
  assert.equal(evidence.assertions.preparedAclScoped, true);

  await expectOwnerCallRevert(
    moduleArtifact,
    moduleAddress,
    "prepareInput",
    [
      encryptedBudget.handle,
      encryptedBudget.handleProof,
      consumerAddress,
      actionHash,
      nonce,
    ],
  );
  evidence.assertions.nonceReplayRejected = true;

  stage = "DIRECT_OWNER_FUNDING_REJECTION";
  await expectOwnerCallRevert(
    consumerArtifact,
    consumerAddress,
    "fundFromSafe",
    [actionHash],
  );
  evidence.assertions.directOwnerFundingRejected = true;

  stage = "SAFE_AUTHORIZED_FUNDING";
  await executeSafeCall(
    "safeAuthorizedFunding",
    consumerAddress,
    encodeFunctionData({
      abi: consumerArtifact.abi,
      args: [actionHash],
      functionName: "fundFromSafe",
    }),
  );
  const safeBalanceAfterFunding =
    await wrapper.read.confidentialBalanceOf([safeAddress]);
  assert.notEqual(safeBalanceAfterFunding, safeBalanceAfterPreparation);
  assert.notEqual(await consumer.read.escrowedBudgetHandle(), zeroBytes32);
  assert.equal(await module.read.preparedConsumed([actionHash]), true);
  evidence.assertions.safeAuthorizedFundingExecuted = true;

  stage = "EXACT_FUNDING_PROOF";
  const fundingResult = await publicDecryptEventually(
    handleClient,
    await consumer.read.fundingCheckHandle(),
  );
  assert.equal(fundingResult.value, true);
  await recordTransaction(
    "confirmFunding",
    consumer.write.confirmFunding([fundingResult.decryptionProof]),
  );
  assert.equal(await consumer.read.funded(), true);
  evidence.assertions.exactFundingProofVerified = true;

  await expectOwnerCallRevert(
    consumerArtifact,
    consumerAddress,
    "fundFromSafe",
    [actionHash],
  );
  evidence.assertions.consumedInputReplayRejected = true;

  stage = "MODULE_REVOKE";
  const balanceBeforeRevoke =
    await wrapper.read.confidentialBalanceOf([safeAddress]);
  await executeSafeTransaction(
    "disableModule",
    await safeKit.createDisableModuleTx(moduleAddress),
  );
  assert.equal(await safeKit.isModuleEnabled(moduleAddress), false);

  const secondNonce = 2n;
  const secondActionHash = await module.read.computeActionHash([secondNonce]);
  const secondEncryptedBudget = await handleClient.encryptInput(
    budget,
    "uint256",
    moduleAddress,
  );
  await expectOwnerCallRevert(
    moduleArtifact,
    moduleAddress,
    "prepareInput",
    [
      secondEncryptedBudget.handle,
      secondEncryptedBudget.handleProof,
      consumerAddress,
      secondActionHash,
      secondNonce,
    ],
  );
  evidence.assertions.revokeBlockedNewPreparation = true;
  evidence.assertions.revokePreservedSafeState =
    (await wrapper.read.confidentialBalanceOf([safeAddress])) ===
      balanceBeforeRevoke &&
    (await safeKit.getThreshold()) === thresholdBefore &&
    JSON.stringify(
      (await safeKit.getOwners()).map((address) => address.toLowerCase()),
    ) ===
      JSON.stringify(ownersBefore.map((address) => address.toLowerCase()));
  assert.equal(evidence.assertions.revokePreservedSafeState, true);

  stage = "MODULE_REENABLE";
  await executeSafeTransaction(
    "reenableModule",
    await safeKit.createEnableModuleTx(moduleAddress),
  );
  assert.equal(await safeKit.isModuleEnabled(moduleAddress), true);
  await recordTransaction(
    "prepareAfterReenable",
    module.write.prepareInput([
      secondEncryptedBudget.handle,
      secondEncryptedBudget.handleProof,
      consumerAddress,
      secondActionHash,
      secondNonce,
    ]),
  );
  evidence.assertions.reenableRestoredPreparation =
    (await module.read.usedNonces([secondNonce])) === true &&
    (await wrapper.read.confidentialBalanceOf([safeAddress])) ===
      balanceBeforeRevoke;
  assert.equal(evidence.assertions.reenableRestoredPreparation, true);

  stage = "FINAL_CLEANUP";
  await executeSafeTransaction(
    "finalDisableModule",
    await safeKit.createDisableModuleTx(moduleAddress),
  );
  await executeSafeCall(
    "revokeOperator",
    wrapperAddress,
    encodeFunctionData({
      abi: wrapperArtifact.abi,
      args: [consumerAddress, 0],
      functionName: "setOperator",
    }),
  );
  evidence.assertions.cleanupRevokedModuleAndOperator =
    (await safeKit.isModuleEnabled(moduleAddress)) === false &&
    (await wrapper.read.isOperator([safeAddress, consumerAddress])) === false;
  assert.equal(
    evidence.assertions.cleanupRevokedModuleAndOperator,
    true,
  );

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/gate-e.json",
      safe: safeAddress,
      contracts: evidence.publicIdentifiers.contracts,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SEPOLIA_GATE_E_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
