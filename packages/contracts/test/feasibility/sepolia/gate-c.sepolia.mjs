import { strict as assert } from "node:assert";
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { createViemHandleClient } from "@iexec-nox/handle";
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  parseEther,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts";
import { sepolia } from "viem/chains";
import artifact from "../../../artifacts/contracts/feasibility/WinnerProofSpike.sol/WinnerProofSpike.json" with {
  type: "json",
};

const root = resolve(import.meta.dirname, "../../../../..");
const envPath = resolve(root, ".env.local");
const outputPath = resolve(root, "evidence/sepolia/gate-c.json");

const evidence = {
  schemaVersion: 1,
  gate: "C",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "official-nox-testnet",
  },
  publicIdentifiers: {
    deployer: null,
    secondVendor: null,
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    contractsDeployed: false,
    winnerOnlyPubliclyDecryptable: false,
    correctProofVerified: false,
    tamperedProofRejected: false,
    wrongTenderRejected: false,
    replayRejected: false,
    reloadRecoveryVerified: false,
    storedWinnerVerified: false,
  },
  blockers: [],
  notes: [
    "Confidential inputs, handles, decrypted values, proofs, signatures, and wallet secrets were kept out of this artifact.",
    "The secondary test wallet secret is stored only in ignored local environment configuration.",
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

function secondaryPrivateKey() {
  const configured = process.env.SEPOLIA_VENDOR_PRIVATE_KEY?.trim();
  if (configured) return normalizePrivateKey(configured);

  const generated = generatePrivateKey();
  appendFileSync(envPath, `\nSEPOLIA_VENDOR_PRIVATE_KEY=${generated}\n`, {
    mode: 0o600,
  });
  chmodSync(envPath, 0o600);
  return generated;
}

function tamper(proof) {
  const finalByte = proof.slice(-2);
  return `${proof.slice(0, -2)}${finalByte === "00" ? "01" : "00"}`;
}

async function publicDecryptEventually(handleClient, encryptedResult) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await handleClient.publicDecrypt(encryptedResult);
    } catch (error) {
      if (attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error("PUBLIC_DECRYPT_RETRY_EXHAUSTED");
}

async function main() {
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const primaryAccount = privateKeyToAccount(
    normalizePrivateKey(requiredEnvironment("SEPOLIA_PRIVATE_KEY")),
  );
  const vendorAccount = privateKeyToAccount(secondaryPrivateKey());
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const primaryWallet = createWalletClient({
    account: primaryAccount,
    chain: sepolia,
    transport,
  });
  const vendorWallet = createWalletClient({
    account: vendorAccount,
    chain: sepolia,
    transport,
  });
  const primaryHandles = await createViemHandleClient(primaryWallet);
  const vendorHandles = await createViemHandleClient(vendorWallet);
  evidence.publicIdentifiers.deployer = primaryAccount.address;
  evidence.publicIdentifiers.secondVendor = vendorAccount.address;

  stage = "SECONDARY_WALLET_FUNDING";
  if (
    (await publicClient.getBalance({ address: vendorAccount.address })) <
    parseEther("0.005")
  ) {
    const fundingHash = await primaryWallet.sendTransaction({
      account: primaryAccount,
      to: vendorAccount.address,
      value: parseEther("0.01"),
    });
    const fundingReceipt = await publicClient.waitForTransactionReceipt({
      hash: fundingHash,
    });
    assert.equal(fundingReceipt.status, "success");
    evidence.publicIdentifiers.transactions.fundSecondVendor = fundingHash;
    evidence.publicIdentifiers.blocks.fundSecondVendor =
      fundingReceipt.blockNumber.toString();
  }

  stage = "CONTRACT_DEPLOYMENTS";
  for (const [name, tenderId] of [
    ["primaryTender", 11n],
    ["bindingTender", 12n],
  ]) {
    const deployHash = await primaryWallet.deployContract({
      abi: artifact.abi,
      account: primaryAccount,
      args: [tenderId, 100n],
      bytecode: artifact.bytecode,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
    });
    assert.equal(receipt.status, "success");
    assert.ok(receipt.contractAddress);
    evidence.publicIdentifiers.contracts[name] = receipt.contractAddress;
    evidence.publicIdentifiers.transactions[`deploy${name}`] = deployHash;
    evidence.publicIdentifiers.blocks[`deploy${name}`] =
      receipt.blockNumber.toString();
    saveEvidence();
  }
  evidence.assertions.contractsDeployed = true;

  const primaryTender = getContract({
    address: evidence.publicIdentifiers.contracts.primaryTender,
    abi: artifact.abi,
    client: { public: publicClient, wallet: primaryWallet },
  });
  const vendorPrimaryTender = getContract({
    address: evidence.publicIdentifiers.contracts.primaryTender,
    abi: artifact.abi,
    client: { public: publicClient, wallet: vendorWallet },
  });
  const bindingTender = getContract({
    address: evidence.publicIdentifiers.contracts.bindingTender,
    abi: artifact.abi,
    client: { public: publicClient, wallet: primaryWallet },
  });

  stage = "PRIMARY_TENDER_BIDS";
  const firstBid = await primaryHandles.encryptInput(
    70n,
    "uint256",
    primaryTender.address,
  );
  const firstBidHash = await primaryTender.write.submitBid([
    firstBid.handle,
    firstBid.handleProof,
  ]);
  const firstBidReceipt = await publicClient.waitForTransactionReceipt({
    hash: firstBidHash,
  });
  assert.equal(firstBidReceipt.status, "success");
  evidence.publicIdentifiers.transactions.primaryBidOne = firstBidHash;
  evidence.publicIdentifiers.blocks.primaryBidOne =
    firstBidReceipt.blockNumber.toString();

  const secondBid = await vendorHandles.encryptInput(
    40n,
    "uint256",
    primaryTender.address,
  );
  const secondBidHash = await vendorPrimaryTender.write.submitBid([
    secondBid.handle,
    secondBid.handleProof,
  ]);
  const secondBidReceipt = await publicClient.waitForTransactionReceipt({
    hash: secondBidHash,
  });
  assert.equal(secondBidReceipt.status, "success");
  evidence.publicIdentifiers.transactions.primaryBidTwo = secondBidHash;
  evidence.publicIdentifiers.blocks.primaryBidTwo =
    secondBidReceipt.blockNumber.toString();

  stage = "BINDING_TENDER_BID";
  const bindingBid = await primaryHandles.encryptInput(
    50n,
    "uint256",
    bindingTender.address,
  );
  const bindingBidHash = await bindingTender.write.submitBid([
    bindingBid.handle,
    bindingBid.handleProof,
  ]);
  const bindingBidReceipt = await publicClient.waitForTransactionReceipt({
    hash: bindingBidHash,
  });
  assert.equal(bindingBidReceipt.status, "success");
  evidence.publicIdentifiers.transactions.bindingBid = bindingBidHash;
  evidence.publicIdentifiers.blocks.bindingBid =
    bindingBidReceipt.blockNumber.toString();

  stage = "CLOSE";
  for (const [name, tender] of [
    ["primary", primaryTender],
    ["binding", bindingTender],
  ]) {
    const closeHash = await tender.write.close();
    const closeReceipt = await publicClient.waitForTransactionReceipt({
      hash: closeHash,
    });
    assert.equal(closeReceipt.status, "success");
    evidence.publicIdentifiers.transactions[`${name}Close`] = closeHash;
    evidence.publicIdentifiers.blocks[`${name}Close`] =
      closeReceipt.blockNumber.toString();
  }
  saveEvidence();

  evidence.assertions.winnerOnlyPubliclyDecryptable =
    (await primaryTender.read.winnerIdIsPubliclyDecryptable()) === true &&
    (await primaryTender.read.bestPriceIsPubliclyDecryptable()) === false;
  assert.equal(evidence.assertions.winnerOnlyPubliclyDecryptable, true);

  stage = "PROOF_RECOVERY_AFTER_RELOAD";
  const reloadedPrimaryTender = getContract({
    address: primaryTender.address,
    abi: artifact.abi,
    client: { public: publicClient, wallet: primaryWallet },
  });
  const publicResult = await publicDecryptEventually(
    primaryHandles,
    await reloadedPrimaryTender.read.encryptedWinnerBidIdHandle(),
  );
  assert.equal(publicResult.value, 2n);
  evidence.assertions.reloadRecoveryVerified = true;

  stage = "TAMPER_REJECTION";
  await assert.rejects(
    reloadedPrimaryTender.write.finalize([
      tamper(publicResult.decryptionProof),
    ]),
  );
  evidence.assertions.tamperedProofRejected = true;

  stage = "WRONG_TENDER_REJECTION";
  await assert.rejects(
    bindingTender.write.finalize([publicResult.decryptionProof]),
  );
  evidence.assertions.wrongTenderRejected = true;

  stage = "CORRECT_FINALIZATION";
  const finalizeHash = await reloadedPrimaryTender.write.finalize([
    publicResult.decryptionProof,
  ]);
  const finalizeReceipt = await publicClient.waitForTransactionReceipt({
    hash: finalizeHash,
  });
  assert.equal(finalizeReceipt.status, "success");
  evidence.publicIdentifiers.transactions.finalize = finalizeHash;
  evidence.publicIdentifiers.blocks.finalize =
    finalizeReceipt.blockNumber.toString();
  evidence.assertions.correctProofVerified = true;
  evidence.assertions.storedWinnerVerified =
    (await reloadedPrimaryTender.read.winnerBidId()) === 2n &&
    (
      await reloadedPrimaryTender.read.winner()
    ).toLowerCase() === vendorAccount.address.toLowerCase();
  assert.equal(evidence.assertions.storedWinnerVerified, true);

  stage = "REPLAY_REJECTION";
  await assert.rejects(
    reloadedPrimaryTender.write.finalize([publicResult.decryptionProof]),
  );
  evidence.assertions.replayRejected = true;

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/gate-c.json",
      contracts: evidence.publicIdentifiers.contracts,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SEPOLIA_GATE_C_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
