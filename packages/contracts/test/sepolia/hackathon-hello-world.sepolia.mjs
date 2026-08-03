import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createViemHandleClient } from "@iexec-nox/handle";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const root = resolve(import.meta.dirname, "../../../..");
const artifactPath = resolve(
  root,
  "packages/contracts/artifacts/contracts/feasibility/HackathonHelloWorldPiggyBank.sol/HackathonHelloWorldPiggyBank.json",
);
const outputPath = resolve(
  root,
  "evidence/sepolia/hackathon-hello-world.json",
);
const evidence = {
  schemaVersion: 1,
  suite: "iexec-nox-hackathon-hello-world",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "official-nox-testnet",
  },
  publicIdentifiers: {
    wallet: null,
    publicKey: null,
    contract: null,
    transactions: {},
    blocks: {},
    runtimeCodeHash: null,
  },
  assertions: {
    contractDeployed: false,
    ownerMatchesJourneyWallet: false,
    encryptedDepositConfirmed: false,
    ownerDecryptedDepositResult: false,
    encryptedWithdrawalConfirmed: false,
    ownerDecryptedWithdrawalResult: false,
  },
  blockers: [],
  notes: [
    "This follows the official iExec Nox Hello World confidential piggy-bank journey.",
    "The public wallet and transaction identifiers are retained for organizer verification.",
    "Private keys, plaintext amounts, encrypted handles, input proofs, signatures, RPC credentials, and decrypted values are omitted.",
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

function journeyAccount() {
  const raw = requiredEnvironment("SEPOLIA_TEST_VENDOR_PRIVATE_KEY");
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("SEPOLIA_TEST_VENDOR_PRIVATE_KEY_INVALID");
  }
  return { account: privateKeyToAccount(key), key };
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
  const { account } = journeyAccount();
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });
  const handles = await createViemHandleClient(walletClient);
  assert.equal(await publicClient.getChainId(), sepolia.id);
  evidence.publicIdentifiers.wallet = account.address;
  evidence.publicIdentifiers.publicKey = account.publicKey;

  async function confirmed(label, hash) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = hash;
    evidence.publicIdentifiers.blocks[label] =
      receipt.blockNumber.toString();
    saveEvidence();
    return receipt;
  }

  stage = "DEPLOYMENT";
  const deploymentHash = await walletClient.deployContract({
    abi: artifact.abi,
    account,
    bytecode: artifact.bytecode,
  });
  const deploymentReceipt = await confirmed(
    "deploy",
    deploymentHash,
  );
  assert.ok(deploymentReceipt.contractAddress);
  const contractAddress = getAddress(deploymentReceipt.contractAddress);
  const runtimeCode = await publicClient.getCode({
    address: contractAddress,
  });
  assert.ok(runtimeCode && runtimeCode !== "0x");
  evidence.publicIdentifiers.contract = contractAddress;
  evidence.publicIdentifiers.runtimeCodeHash = keccak256(runtimeCode);
  evidence.assertions.contractDeployed = true;
  evidence.assertions.ownerMatchesJourneyWallet =
    getAddress(await publicClient.readContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "owner",
    })) === getAddress(account.address);
  assert.equal(evidence.assertions.ownerMatchesJourneyWallet, true);

  async function encryptedWrite(label, functionName, amount) {
    const encrypted = await handles.encryptInput(
      amount,
      "uint256",
      contractAddress,
    );
    const simulation = await publicClient.simulateContract({
      account,
      address: contractAddress,
      abi: artifact.abi,
      functionName,
      args: [encrypted.handle, encrypted.handleProof],
    });
    const hash = await walletClient.writeContract(simulation.request);
    await confirmed(label, hash);
  }

  async function decryptBalance(expected) {
    const handle = await publicClient.readContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "balance",
    });
    const decrypted = await retry(
      () => handles.decrypt(handle),
      "NOX_DECRYPTION_UNAVAILABLE",
    );
    assert.equal(decrypted.value, expected);
  }

  stage = "ENCRYPTED_DEPOSIT";
  await encryptedWrite("deposit", "deposit", 7n);
  evidence.assertions.encryptedDepositConfirmed = true;
  await decryptBalance(7n);
  evidence.assertions.ownerDecryptedDepositResult = true;
  saveEvidence();

  stage = "ENCRYPTED_WITHDRAWAL";
  await encryptedWrite("withdraw", "withdraw", 2n);
  evidence.assertions.encryptedWithdrawalConfirmed = true;
  await decryptBalance(5n);
  evidence.assertions.ownerDecryptedWithdrawalResult = true;
  saveEvidence();

  console.log(JSON.stringify({
    evidence: "evidence/sepolia/hackathon-hello-world.json",
    wallet: evidence.publicIdentifiers.wallet,
    publicKey: evidence.publicIdentifiers.publicKey,
    contract: evidence.publicIdentifiers.contract,
    transactions: evidence.publicIdentifiers.transactions,
    assertions: evidence.assertions,
  }));
}

main().catch((error) => {
  const blocker =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `HELLO_WORLD_${stage}_FAILED`;
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
