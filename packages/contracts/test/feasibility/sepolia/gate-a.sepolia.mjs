import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createViemHandleClient } from "@iexec-nox/handle";
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import artifact from "../../../artifacts/contracts/feasibility/PersistentHandleSpike.sol/PersistentHandleSpike.json" with {
  type: "json",
};

const root = resolve(import.meta.dirname, "../../../../..");
const outputPath = resolve(root, "evidence/sepolia/gate-a.json");
const zeroBytes32 = `0x${"0".repeat(64)}`;

const evidence = {
  schemaVersion: 1,
  gate: "A",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "official-nox-testnet",
  },
  publicIdentifiers: {
    deployer: null,
    contract: null,
    transactions: {},
    blocks: {},
  },
  assertions: {
    noxDeploymentPresent: false,
    contractDeployed: false,
    storedInLaterBlock: false,
    contractAclPersisted: false,
    vendorViewerPersisted: false,
    vendorDecryptVerifiedInMemory: false,
    encryptedComparisonVerifiedInMemory: false,
  },
  blockers: [],
  notes: [
    "Confidential test values, handles, and proofs were kept in memory and omitted from this artifact.",
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
  if (!value) {
    throw new Error(`${name}_MISSING`);
  }
  return value;
}

async function main() {
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const rawPrivateKey = requiredEnvironment("SEPOLIA_PRIVATE_KEY");
  const privateKey = rawPrivateKey.startsWith("0x")
    ? rawPrivateKey
    : `0x${rawPrivateKey}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("SEPOLIA_PRIVATE_KEY_INVALID");
  }

  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });
  const handleClient = await createViemHandleClient(walletClient);
  evidence.publicIdentifiers.deployer = account.address;

  stage = "NOX_DEPLOYMENT_CHECK";
  const noxCode = await publicClient.getCode({
    address: "0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf",
  });
  assert.ok(noxCode && noxCode !== "0x");
  evidence.assertions.noxDeploymentPresent = true;

  stage = "CONTRACT_DEPLOYMENT";
  const deployHash = await walletClient.deployContract({
    abi: artifact.abi,
    account,
    bytecode: artifact.bytecode,
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({
    hash: deployHash,
  });
  assert.equal(deployReceipt.status, "success");
  assert.ok(deployReceipt.contractAddress);
  evidence.publicIdentifiers.contract = deployReceipt.contractAddress;
  evidence.publicIdentifiers.transactions.deploy = deployHash;
  evidence.publicIdentifiers.blocks.deploy = deployReceipt.blockNumber.toString();
  evidence.assertions.contractDeployed = true;

  const spike = getContract({
    address: deployReceipt.contractAddress,
    abi: artifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });

  stage = "INPUT_ENCRYPTION";
  const privateBid = 37n;
  const encrypted = await handleClient.encryptInput(
    privateBid,
    "uint256",
    deployReceipt.contractAddress,
  );

  stage = "BID_SUBMISSION";
  const submitHash = await spike.write.submitBid([
    encrypted.handle,
    encrypted.handleProof,
  ]);
  const submitReceipt = await publicClient.waitForTransactionReceipt({
    hash: submitHash,
  });
  assert.equal(submitReceipt.status, "success");
  evidence.publicIdentifiers.transactions.submit = submitHash;
  evidence.publicIdentifiers.blocks.submit = submitReceipt.blockNumber.toString();

  stage = "INITIAL_ACL_AND_DECRYPTION";
  const storedBid = await spike.read.storedBidHandle();
  assert.notEqual(storedBid, zeroBytes32);
  assert.equal(
    await spike.read.storedBidAllowedFor([deployReceipt.contractAddress]),
    true,
  );
  assert.equal(
    await spike.read.storedBidViewableBy([account.address]),
    true,
  );
  const decrypted = await handleClient.decrypt(storedBid);
  assert.equal(decrypted.value, privateBid);
  evidence.assertions.vendorDecryptVerifiedInMemory = true;

  stage = "LATER_BLOCK_COMPARISON";
  const compareHash = await spike.write.compareStoredBid([50n]);
  const compareReceipt = await publicClient.waitForTransactionReceipt({
    hash: compareHash,
  });
  assert.equal(compareReceipt.status, "success");
  assert.ok(compareReceipt.blockNumber > submitReceipt.blockNumber);
  evidence.publicIdentifiers.transactions.compare = compareHash;
  evidence.publicIdentifiers.blocks.compare = compareReceipt.blockNumber.toString();
  evidence.assertions.storedInLaterBlock = true;

  stage = "PERSISTED_ACL";
  evidence.assertions.contractAclPersisted =
    await spike.read.storedBidAllowedFor([deployReceipt.contractAddress]);
  evidence.assertions.vendorViewerPersisted =
    await spike.read.storedBidViewableBy([account.address]);
  assert.equal(evidence.assertions.contractAclPersisted, true);
  assert.equal(evidence.assertions.vendorViewerPersisted, true);

  stage = "PUBLIC_COMPARISON_PROOF";
  const comparison = await handleClient.publicDecrypt(
    await spike.read.comparisonResultHandle(),
  );
  assert.equal(comparison.value, 1n);
  evidence.assertions.encryptedComparisonVerifiedInMemory = true;

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/gate-a.json",
      contract: evidence.publicIdentifiers.contract,
      transactions: evidence.publicIdentifiers.transactions,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SEPOLIA_GATE_A_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
