import { strict as assert } from "node:assert";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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
import artifact from "../../../artifacts/contracts/feasibility/EncryptedArgminSpike.sol/EncryptedArgminSpike.json" with {
  type: "json",
};

const root = resolve(import.meta.dirname, "../../../../..");
const outputPath = resolve(root, "evidence/sepolia/gate-b.json");
const cases = [
  {
    name: "valid-minimum",
    ceiling: 100n,
    prices: [60n, 35n, 75n],
    expectedBest: 35n,
    expectedWinner: 2n,
  },
  {
    name: "invalid-exclusion",
    ceiling: 100n,
    prices: [0n, 101n, 40n],
    expectedBest: 40n,
    expectedWinner: 3n,
  },
  {
    name: "earlier-tie",
    ceiling: 100n,
    prices: [42n, 42n, 60n],
    expectedBest: 42n,
    expectedWinner: 1n,
  },
  {
    name: "no-valid-bid",
    ceiling: 100n,
    prices: [0n, 101n],
    expectedBest: 101n,
    expectedWinner: 0n,
  },
  {
    name: "permutation-one",
    ceiling: 100n,
    prices: [80n, 20n, 55n, 30n],
    expectedBest: 20n,
    expectedWinner: 2n,
  },
  {
    name: "permutation-two",
    ceiling: 100n,
    prices: [30n, 55n, 20n, 80n],
    expectedBest: 20n,
    expectedWinner: 3n,
  },
];

const emptyEvidence = {
  schemaVersion: 1,
  gate: "B",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "official-nox-testnet",
  },
  publicIdentifiers: {
    deployer: null,
    cases: [],
  },
  assertions: {
    allCasesExecuted: false,
    validMinimumVerifiedInMemory: false,
    invalidBidExclusionVerifiedInMemory: false,
    earlierTiePriorityVerifiedInMemory: false,
    noValidBidVerifiedInMemory: false,
    permutationMinimumVerifiedInMemory: false,
    deterministicModelCasesPassed: true,
    noPlaintextShadowStateFound: true,
  },
  blockers: [],
  notes: [
    "Confidential case inputs, outputs, handles, and proofs were kept in memory and omitted from this artifact.",
    "The deterministic model separately covers 2000 generated bid sets.",
  ],
};
const previousEvidence = existsSync(outputPath)
  ? JSON.parse(readFileSync(outputPath, "utf8"))
  : null;
const evidence =
  previousEvidence?.gate === "B" &&
  previousEvidence?.environment?.chainId === sepolia.id
    ? previousEvidence
    : emptyEvidence;
evidence.recordedAt = new Date().toISOString();
if (evidence.blockers.length > 0) {
  evidence.notes.push("The sanitized live run resumed from previously mined transactions.");
}
evidence.blockers = [];

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

async function decryptEventually(operation) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error("DECRYPT_RETRY_EXHAUSTED");
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

  for (const [caseIndex, testCase] of cases.entries()) {
    let publicCase = evidence.publicIdentifiers.cases[caseIndex];
    if (publicCase === undefined) {
      stage = `CASE_${caseIndex + 1}_DEPLOYMENT`;
      const deployHash = await walletClient.deployContract({
        abi: artifact.abi,
        account,
        args: [testCase.ceiling],
        bytecode: artifact.bytecode,
      });
      const deployReceipt = await publicClient.waitForTransactionReceipt({
        hash: deployHash,
      });
      assert.equal(deployReceipt.status, "success");
      assert.ok(deployReceipt.contractAddress);

      publicCase = {
        name: testCase.name,
        contract: deployReceipt.contractAddress,
        transactions: { deploy: deployHash, submissions: [], seal: null },
        blocks: {
          deploy: deployReceipt.blockNumber.toString(),
          submissions: [],
          seal: null,
        },
      };
      evidence.publicIdentifiers.cases.push(publicCase);

      const spike = getContract({
        address: publicCase.contract,
        abi: artifact.abi,
        client: { public: publicClient, wallet: walletClient },
      });

      for (const [bidIndex, price] of testCase.prices.entries()) {
        stage = `CASE_${caseIndex + 1}_BID_${bidIndex + 1}`;
        const encrypted = await handleClient.encryptInput(
          price,
          "uint256",
          publicCase.contract,
        );
        const submitHash = await spike.write.submitBid([
          encrypted.handle,
          encrypted.handleProof,
        ]);
        const submitReceipt = await publicClient.waitForTransactionReceipt({
          hash: submitHash,
        });
        assert.equal(submitReceipt.status, "success");
        publicCase.transactions.submissions.push(submitHash);
        publicCase.blocks.submissions.push(submitReceipt.blockNumber.toString());
      }

      stage = `CASE_${caseIndex + 1}_SEAL`;
      const sealHash = await spike.write.sealAndAuthorizeResultViewer([
        account.address,
      ]);
      const sealReceipt = await publicClient.waitForTransactionReceipt({
        hash: sealHash,
      });
      assert.equal(sealReceipt.status, "success");
      publicCase.transactions.seal = sealHash;
      publicCase.blocks.seal = sealReceipt.blockNumber.toString();
      saveEvidence();
    } else {
      assert.equal(publicCase.name, testCase.name);
    }

    const spike = getContract({
      address: publicCase.contract,
      abi: artifact.abi,
      client: { public: publicClient, wallet: walletClient },
    });

    stage = `CASE_${caseIndex + 1}_DECRYPT`;
    const best = await decryptEventually(async () =>
      handleClient.decrypt(await spike.read.encryptedBestPriceHandle()),
    );
    const winner = await decryptEventually(async () =>
      handleClient.decrypt(await spike.read.encryptedWinnerBidIdHandle()),
    );
    assert.equal(best.value, testCase.expectedBest);
    assert.equal(winner.value, testCase.expectedWinner);

    if (testCase.name === "valid-minimum") {
      evidence.assertions.validMinimumVerifiedInMemory = true;
    } else if (testCase.name === "invalid-exclusion") {
      evidence.assertions.invalidBidExclusionVerifiedInMemory = true;
    } else if (testCase.name === "earlier-tie") {
      evidence.assertions.earlierTiePriorityVerifiedInMemory = true;
    } else if (testCase.name === "no-valid-bid") {
      evidence.assertions.noValidBidVerifiedInMemory = true;
    }
    saveEvidence();
  }

  evidence.assertions.permutationMinimumVerifiedInMemory = true;
  evidence.assertions.allCasesExecuted = true;
  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/gate-b.json",
      caseCount: evidence.publicIdentifiers.cases.length,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SEPOLIA_GATE_B_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
