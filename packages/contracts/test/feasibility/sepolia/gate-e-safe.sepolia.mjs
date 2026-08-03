import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Safe from "@safe-global/protocol-kit";
import {
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const root = resolve(import.meta.dirname, "../../../../..");
const outputPath = resolve(root, "evidence/sepolia/gate-e-safe.json");
const saltNonce = "2026072501";

const evidence = {
  schemaVersion: 1,
  gate: "E",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "safe-protocol-kit-8.0.4",
  },
  packages: {
    safeProtocolKit: "8.0.4",
    safeAccount: "1.4.1",
  },
  publicIdentifiers: {
    owner: null,
    safe: null,
    transactions: {},
    blocks: {},
  },
  assertions: {
    safeDeployed: false,
    safeVersionVerified: false,
    ownerSetVerified: false,
    thresholdOneVerified: false,
  },
  blockers: [],
  notes: [
    "This is a separate VeilBid threshold-1 demo Safe deployed through the official Protocol Kit.",
    "Wallet secrets and Safe transaction signatures were omitted from this artifact.",
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

async function main() {
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const rawPrivateKey = requiredEnvironment("SEPOLIA_PRIVATE_KEY");
  const privateKey = rawPrivateKey.startsWith("0x")
    ? rawPrivateKey
    : `0x${rawPrivateKey}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("SEPOLIA_PRIVATE_KEY_INVALID");
  }

  const owner = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account: owner,
    chain: sepolia,
    transport,
  });
  evidence.publicIdentifiers.owner = owner.address;

  stage = "SAFE_INITIALIZATION";
  const predictedKit = await Safe.init({
    provider: rpcUrl,
    signer: privateKey,
    predictedSafe: {
      safeAccountConfig: {
        owners: [owner.address],
        threshold: 1,
      },
      safeDeploymentConfig: {
        safeVersion: "1.4.1",
        saltNonce,
      },
    },
  });
  const safeAddress = await predictedKit.getAddress();
  evidence.publicIdentifiers.safe = safeAddress;

  stage = "SAFE_DEPLOYMENT";
  if (!(await predictedKit.isSafeDeployed())) {
    const deployment = await predictedKit.createSafeDeploymentTransaction();
    const deployHash = await walletClient.sendTransaction({
      account: owner,
      data: deployment.data,
      to: deployment.to,
      value: BigInt(deployment.value),
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
    });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions.deploySafe = deployHash;
    evidence.publicIdentifiers.blocks.deploySafe =
      receipt.blockNumber.toString();
  }

  stage = "SAFE_VERIFICATION";
  const safe = await predictedKit.connect({ safeAddress });
  evidence.assertions.safeDeployed = await safe.isSafeDeployed();
  evidence.assertions.safeVersionVerified =
    safe.getContractVersion() === "1.4.1";
  const owners = await safe.getOwners();
  evidence.assertions.ownerSetVerified =
    owners.length === 1 &&
    owners[0].toLowerCase() === owner.address.toLowerCase();
  evidence.assertions.thresholdOneVerified =
    (await safe.getThreshold()) === 1;
  assert.equal(Object.values(evidence.assertions).every(Boolean), true);

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/gate-e-safe.json",
      safe: safeAddress,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SEPOLIA_GATE_E_SAFE_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
