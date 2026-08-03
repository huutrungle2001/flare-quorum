import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createViemHandleClient } from "@iexec-nox/handle";
import Safe from "@safe-global/protocol-kit";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  getContract,
  http,
  keccak256,
  parseEventLogs,
  toHex,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import preparationArtifact from "../../artifacts/contracts/safe/VeilBidSafeUnwrapPreparation.sol/VeilBidSafeUnwrapPreparation.json" with {
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
const outputPath = resolve(
  root,
  "evidence/sepolia/safe-unwrap.json",
);
const fundedAmount = 3_000_000n;
const partialAmount = 1_000_000n;
const safeExecutionSuccessTopic = keccak256(
  toHex("ExecutionSuccess(bytes32,uint256)"),
);

const evidence = {
  schemaVersion: 1,
  suite: "safe-confidential-unwrap",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "safe-1.4.1-and-official-nox-testnet",
  },
  publicIdentifiers: {
    owner: null,
    safe: null,
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    releaseManifestVerified: false,
    preparationBoundToCanonicalWrapper: false,
    safeAuthorityVerified: false,
    fundingUsedSafeThresholdBatch: false,
    partialPreparationAndUnwrapAtomic: false,
    partialNonceAndHandleReplayProtected: false,
    partialRequestCreated: false,
    partialAmountVerifiedInMemory: false,
    partialFinalizationReleasedExactAmount: false,
    fullUnwrapUsedSafeThresholdBatch: false,
    fullRequestCreated: false,
    fullAmountVerifiedPositiveInMemory: false,
    fullFinalizationReleasedExactAmount: false,
    safeAuthorityPreserved: false,
  },
  blockers: [],
  notes: [
    "A threshold-authorized Safe batch funds test vcUSDC before exercising partial and full unwrap.",
    "Partial unwrap validates an owner-encrypted amount through the dedicated preparation adapter and consumes it atomically in the same Safe transaction.",
    "Full unwrap consumes the Safe's current confidential balance handle without first revealing the balance.",
    "Decrypted amounts are asserted only in memory. Balances, handles, proofs, signatures, RPC credentials, and private keys are omitted.",
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
  assert.equal(release.kind, "release");
  assert.equal(release.verified, true);
  evidence.assertions.releaseManifestVerified = true;

  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const privateKey = privateKeyFromEnvironment();
  const owner = privateKeyToAccount(privateKey);
  const safeAddress = getAddress(
    release.contracts.VeilBidDemoSafe.address,
  );
  const tokenAddress = getAddress(
    release.contracts.VeilBidTestUSDC.address,
  );
  const wrapperAddress = getAddress(
    release.contracts.VeilBidConfidentialUSDC.address,
  );
  const preparationAddress = getAddress(
    release.contracts.VeilBidSafeUnwrapPreparation.address,
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
  const ownersBefore = await safeKit.getOwners();
  const thresholdBefore = await safeKit.getThreshold();
  assert.equal(await safeKit.isOwner(owner.address), true);
  evidence.assertions.safeAuthorityVerified =
    ownersBefore.some(
      (candidate) =>
        getAddress(candidate) === getAddress(owner.address),
    ) && thresholdBefore > 0;
  assert.equal(evidence.assertions.safeAuthorityVerified, true);

  const token = getContract({
    address: tokenAddress,
    abi: tokenArtifact.abi,
    client: publicClient,
  });
  const wrapper = getContract({
    address: wrapperAddress,
    abi: wrapperArtifact.abi,
    client: publicClient,
  });
  const preparation = getContract({
    address: preparationAddress,
    abi: preparationArtifact.abi,
    client: publicClient,
  });
  evidence.publicIdentifiers.owner = owner.address;
  evidence.publicIdentifiers.safe = safeAddress;
  evidence.publicIdentifiers.contracts = {
    Token: tokenAddress,
    Wrapper: wrapperAddress,
    SafeUnwrapPreparation: preparationAddress,
  };
  evidence.assertions.preparationBoundToCanonicalWrapper =
    getAddress(await preparation.read.wrapper()) === wrapperAddress;
  assert.equal(
    evidence.assertions.preparationBoundToCanonicalWrapper,
    true,
  );

  async function executeSafeBatch(label, transactions) {
    const safeTransaction = await safeKit.createTransaction({
      transactions,
    });
    const result = await safeKit.executeTransaction(safeTransaction);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: result.hash,
    });
    assert.equal(receipt.status, "success");
    assert.equal(
      receipt.logs.some(
        (log) =>
          getAddress(log.address) === safeAddress &&
          log.topics[0]?.toLowerCase() ===
            safeExecutionSuccessTopic.toLowerCase(),
      ),
      true,
      "SAFE_INTERNAL_EXECUTION_FAILED",
    );
    evidence.publicIdentifiers.transactions[label] = result.hash;
    evidence.publicIdentifiers.blocks[label] =
      receipt.blockNumber.toString();
    saveEvidence();
    return receipt;
  }

  async function finalizeRequest(label, requestHandle) {
    const revealed = await handleClient.publicDecrypt(requestHandle);
    assert.equal(typeof revealed.value, "bigint");
    assert.ok(revealed.value > 0n);
    const simulation = await publicClient.simulateContract({
      account: owner,
      address: wrapperAddress,
      abi: wrapperArtifact.abi,
      functionName: "finalizeUnwrap",
      args: [requestHandle, revealed.decryptionProof],
    });
    const transactionHash = await walletClient.writeContract(
      simulation.request,
    );
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = transactionHash;
    evidence.publicIdentifiers.blocks[label] =
      receipt.blockNumber.toString();
    saveEvidence();
    return revealed.value;
  }

  function unwrapRequest(receipt) {
    const requests = parseEventLogs({
      abi: wrapperArtifact.abi,
      eventName: "UnwrapRequested",
      logs: receipt.logs,
    });
    assert.equal(requests.length, 1);
    assert.equal(getAddress(requests[0].args.receiver), owner.address);
    return requests[0].args.amount;
  }

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
        args: [wrapperAddress, fundedAmount],
      }),
    },
    {
      to: wrapperAddress,
      value: "0",
      data: encodeFunctionData({
        abi: wrapperArtifact.abi,
        functionName: "wrap",
        args: [safeAddress, fundedAmount],
      }),
    },
  ]);
  evidence.assertions.fundingUsedSafeThresholdBatch = true;

  stage = "PARTIAL_UNWRAP";
  const balanceHandleBeforePartial =
    await wrapper.read.confidentialBalanceOf([safeAddress]);
  assert.notEqual(balanceHandleBeforePartial, zeroHash);
  let nonce = BigInt(Date.now());
  while (await preparation.read.usedNonces([safeAddress, nonce])) {
    nonce += 1n;
  }
  const encryptedPartial = await handleClient.encryptInput(
    partialAmount,
    "uint256",
    preparationAddress,
  );
  const publicBalanceBeforePartial = await token.read.balanceOf([
    owner.address,
  ]);
  const partialReceipt = await executeSafeBatch("partialUnwrapSafe", [
    {
      to: preparationAddress,
      value: "0",
      data: encodeFunctionData({
        abi: preparationArtifact.abi,
        functionName: "preparePartialUnwrap",
        args: [
          encryptedPartial.handle,
          encryptedPartial.handleProof,
          owner.address,
          balanceHandleBeforePartial,
          nonce,
        ],
      }),
    },
    {
      to: wrapperAddress,
      value: "0",
      data: encodeFunctionData({
        abi: wrapperArtifact.abi,
        functionName: "unwrap",
        args: [safeAddress, owner.address, encryptedPartial.handle],
      }),
    },
  ]);
  evidence.assertions.partialPreparationAndUnwrapAtomic = true;
  evidence.assertions.partialNonceAndHandleReplayProtected =
    (await preparation.read.usedNonces([safeAddress, nonce])) === true &&
    (await preparation.read.usedHandles([
      safeAddress,
      encryptedPartial.handle,
    ])) === true;
  assert.equal(
    evidence.assertions.partialNonceAndHandleReplayProtected,
    true,
  );
  const partialRequestHandle = unwrapRequest(partialReceipt);
  evidence.assertions.partialRequestCreated = true;
  const partialPlaintext = await finalizeRequest(
    "partialFinalize",
    partialRequestHandle,
  );
  evidence.assertions.partialAmountVerifiedInMemory =
    partialPlaintext === partialAmount;
  evidence.assertions.partialFinalizationReleasedExactAmount =
    (await token.read.balanceOf([owner.address])) -
      publicBalanceBeforePartial ===
    partialAmount;
  assert.equal(evidence.assertions.partialAmountVerifiedInMemory, true);
  assert.equal(
    evidence.assertions.partialFinalizationReleasedExactAmount,
    true,
  );

  stage = "FULL_UNWRAP";
  const balanceHandleBeforeFull =
    await wrapper.read.confidentialBalanceOf([safeAddress]);
  assert.notEqual(balanceHandleBeforeFull, balanceHandleBeforePartial);
  const publicBalanceBeforeFull = await token.read.balanceOf([
    owner.address,
  ]);
  const fullReceipt = await executeSafeBatch("fullUnwrapSafe", [
    {
      to: wrapperAddress,
      value: "0",
      data: encodeFunctionData({
        abi: wrapperArtifact.abi,
        functionName: "unwrap",
        args: [safeAddress, owner.address, balanceHandleBeforeFull],
      }),
    },
  ]);
  evidence.assertions.fullUnwrapUsedSafeThresholdBatch = true;
  const fullRequestHandle = unwrapRequest(fullReceipt);
  evidence.assertions.fullRequestCreated = true;
  const fullPlaintext = await finalizeRequest(
    "fullFinalize",
    fullRequestHandle,
  );
  evidence.assertions.fullAmountVerifiedPositiveInMemory =
    fullPlaintext > 0n;
  evidence.assertions.fullFinalizationReleasedExactAmount =
    (await token.read.balanceOf([owner.address])) -
      publicBalanceBeforeFull ===
    fullPlaintext;
  assert.equal(
    evidence.assertions.fullAmountVerifiedPositiveInMemory,
    true,
  );
  assert.equal(
    evidence.assertions.fullFinalizationReleasedExactAmount,
    true,
  );

  evidence.assertions.safeAuthorityPreserved =
    JSON.stringify(await safeKit.getOwners()) ===
      JSON.stringify(ownersBefore) &&
    (await safeKit.getThreshold()) === thresholdBefore;
  assert.equal(evidence.assertions.safeAuthorityPreserved, true);
  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/safe-unwrap.json",
      safe: safeAddress,
      contracts: evidence.publicIdentifiers.contracts,
      transactions: evidence.publicIdentifiers.transactions,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const blocker =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SAFE_UNWRAP_${stage}_FAILED`;
  evidence.blockers.push(blocker);
  evidence.notes.push(`Verification stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker }));
  process.exitCode = 1;
});
