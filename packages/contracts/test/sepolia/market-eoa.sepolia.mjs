import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createViemHandleClient } from "@iexec-nox/handle";
import {
  createPublicClient,
  createWalletClient,
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
import receiptArtifact from "../../artifacts/contracts/receipt/VeilBidAwardReceipt.sol/VeilBidAwardReceipt.json" with {
  type: "json",
};

const root = resolve(import.meta.dirname, "../../../..");
const outputPath = resolve(root, "evidence/sepolia/market-eoa.json");
const zeroBytes32 = `0x${"0".repeat(64)}`;
const publicCeiling = 100_000_000n;
const winningPrice = 37_000_000n;
const maxUint48 = (1n << 48n) - 1n;
const metadataHash = keccak256(toHex("veilbid-production-eoa-e2e-v1"));

const evidence = {
  schemaVersion: 1,
  suite: "production-market-eoa",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "official-nox-testnet",
  },
  publicIdentifiers: {
    buyer: null,
    vendor: null,
    tenderId: null,
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    productionContractsDeployed: false,
    officialWrapperUsed: false,
    exactFundingProofOpenedTender: false,
    fundingProofReplayRejected: false,
    unapprovedVendorRejected: false,
    duplicateVendorRejected: false,
    vendorOnlyOpenBidAclVerified: false,
    vendorBidDecryptionVerifiedInMemory: false,
    deadlineEnforced: false,
    winnerOnlyPublicDecryptionVerified: false,
    proofDerivedWinnerVerified: false,
    confidentialSettlementVerifiedInMemory: false,
    awardReceiptVerified: false,
    finalizeReplayRejected: false,
    postCloseBuyerGrantVerifiedInMemory: false,
  },
  blockers: [],
  notes: [
    "Bid prices, balances, handles, proofs, signatures, RPC credentials, and wallet secrets were kept in memory and omitted.",
    "This suite uses the canonical Auction House production contracts rather than feasibility contracts.",
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

function normalizePrivateKey(value, name) {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`${name}_INVALID`);
  }
  return normalized;
}

async function retry(operation, code) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 11) throw new Error(code);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error(code);
}

async function main() {
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const buyerAccount = privateKeyToAccount(
    normalizePrivateKey(
      requiredEnvironment("SEPOLIA_PRIVATE_KEY"),
      "SEPOLIA_PRIVATE_KEY",
    ),
  );
  const vendorAccount = privateKeyToAccount(
    normalizePrivateKey(
      requiredEnvironment("SEPOLIA_VENDOR_PRIVATE_KEY"),
      "SEPOLIA_VENDOR_PRIVATE_KEY",
    ),
  );
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const buyerWallet = createWalletClient({
    account: buyerAccount,
    chain: sepolia,
    transport,
  });
  const vendorWallet = createWalletClient({
    account: vendorAccount,
    chain: sepolia,
    transport,
  });
  const buyerHandles = await createViemHandleClient(buyerWallet);
  const vendorHandles = await createViemHandleClient(vendorWallet);
  evidence.publicIdentifiers.buyer = buyerAccount.address;
  evidence.publicIdentifiers.vendor = vendorAccount.address;

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
      buyerWallet.deployContract({
        abi: artifact.abi,
        account: buyerAccount,
        args,
        bytecode: artifact.bytecode,
      }),
    );
    assert.ok(receipt.contractAddress);
    evidence.publicIdentifiers.contracts[label] = receipt.contractAddress;
    saveEvidence();
    return receipt.contractAddress;
  }

  async function expectSimulationRevert({
    account,
    address,
    args = [],
    artifact,
    functionName,
  }) {
    await assert.rejects(
      publicClient.simulateContract({
        abi: artifact.abi,
        account,
        address,
        args,
        functionName,
      }),
    );
  }

  async function confidentialBalance(address, handles, wrapper) {
    const encryptedBalance = await wrapper.read.confidentialBalanceOf([address]);
    if (encryptedBalance === zeroBytes32) return 0n;
    return (
      await retry(
        () => handles.decrypt(encryptedBalance),
        "CONFIDENTIAL_BALANCE_DECRYPT_TIMEOUT",
      )
    ).value;
  }

  stage = "DEPLOYMENT";
  const underlyingAddress = await deploy("Underlying", underlyingArtifact);
  const wrapperAddress = await deploy("Wrapper", wrapperArtifact, [
    underlyingAddress,
  ]);
  const marketAddress = await deploy("Market", marketArtifact, [
    wrapperAddress,
  ]);
  const underlying = getContract({
    address: underlyingAddress,
    abi: underlyingArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  const wrapper = getContract({
    address: wrapperAddress,
    abi: wrapperArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  const market = getContract({
    address: marketAddress,
    abi: marketArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  const vendorMarket = getContract({
    address: marketAddress,
    abi: marketArtifact.abi,
    client: { public: publicClient, wallet: vendorWallet },
  });
  const receiptAddress = await market.read.awardReceipt();
  evidence.publicIdentifiers.contracts.Receipt = receiptAddress;
  evidence.assertions.productionContractsDeployed = true;
  evidence.assertions.officialWrapperUsed =
    getAddress(await wrapper.read.underlying()) ===
    getAddress(underlyingAddress);
  assert.equal(evidence.assertions.officialWrapperUsed, true);
  saveEvidence();

  stage = "ASSET_SETUP";
  await recordTransaction("faucet", underlying.write.faucet());
  await recordTransaction(
    "approveWrapper",
    underlying.write.approve([wrapperAddress, publicCeiling]),
  );
  await recordTransaction(
    "wrapConfidential",
    wrapper.write.wrap([buyerAccount.address, publicCeiling]),
  );
  await recordTransaction(
    "authorizeMarket",
    wrapper.write.setOperator([marketAddress, maxUint48]),
  );
  const buyerBefore = await confidentialBalance(
    buyerAccount.address,
    buyerHandles,
    wrapper,
  );
  const vendorBefore = await confidentialBalance(
    vendorAccount.address,
    vendorHandles,
    wrapper,
  );
  assert.equal(buyerBefore, publicCeiling);

  stage = "TENDER_CREATION";
  const latestBlock = await publicClient.getBlock();
  const bidDeadline = latestBlock.timestamp + 150n;
  await recordTransaction(
    "createTender",
    market.write.createTender([
      metadataHash,
      publicCeiling,
      bidDeadline,
      [vendorAccount.address],
    ]),
  );
  const tenderId = await market.read.tenderCount();
  evidence.publicIdentifiers.tenderId = tenderId.toString();
  saveEvidence();

  const fundingPending = await market.read.getTender([tenderId]);
  assert.equal(fundingPending.status, 0);
  const fundingResult = await retry(
    () => buyerHandles.publicDecrypt(fundingPending.fundingCheckHandle),
    "FUNDING_PUBLIC_DECRYPT_TIMEOUT",
  );
  assert.equal(fundingResult.value, true);
  await recordTransaction(
    "confirmFunding",
    market.write.confirmTenderFunding([
      tenderId,
      fundingResult.decryptionProof,
    ]),
  );
  assert.equal((await market.read.getTender([tenderId])).status, 1);
  evidence.assertions.exactFundingProofOpenedTender = true;
  await expectSimulationRevert({
    account: buyerAccount,
    address: marketAddress,
    artifact: marketArtifact,
    functionName: "confirmTenderFunding",
    args: [tenderId, fundingResult.decryptionProof],
  });
  evidence.assertions.fundingProofReplayRejected = true;

  stage = "BID_SUBMISSION";
  const encryptedBid = await vendorHandles.encryptInput(
    winningPrice,
    "uint256",
    marketAddress,
  );
  await expectSimulationRevert({
    account: buyerAccount,
    address: marketAddress,
    artifact: marketArtifact,
    functionName: "submitBid",
    args: [tenderId, encryptedBid.handle, encryptedBid.handleProof],
  });
  evidence.assertions.unapprovedVendorRejected = true;
  await recordTransaction(
    "submitBid",
    vendorMarket.write.submitBid([
      tenderId,
      encryptedBid.handle,
      encryptedBid.handleProof,
    ]),
  );
  await expectSimulationRevert({
    account: vendorAccount,
    address: marketAddress,
    artifact: marketArtifact,
    functionName: "submitBid",
    args: [tenderId, encryptedBid.handle, encryptedBid.handleProof],
  });
  evidence.assertions.duplicateVendorRejected = true;

  const bid = await market.read.getBid([tenderId, 1n]);
  evidence.assertions.vendorOnlyOpenBidAclVerified =
    (await market.read.bidViewableBy([
      tenderId,
      1n,
      vendorAccount.address,
    ])) === true &&
    (await market.read.bidViewableBy([
      tenderId,
      1n,
      buyerAccount.address,
    ])) === false;
  assert.equal(evidence.assertions.vendorOnlyOpenBidAclVerified, true);
  assert.equal(
    (
      await retry(
        () => vendorHandles.decrypt(bid.encryptedPriceHandle),
        "VENDOR_BID_DECRYPT_TIMEOUT",
      )
    ).value,
    winningPrice,
  );
  evidence.assertions.vendorBidDecryptionVerifiedInMemory = true;

  stage = "DEADLINE_WAIT";
  assert.equal(await market.read.canClose([tenderId]), false);
  await expectSimulationRevert({
    account: buyerAccount,
    address: marketAddress,
    artifact: marketArtifact,
    functionName: "closeTender",
    args: [tenderId],
  });
  evidence.assertions.deadlineEnforced = true;
  while ((await publicClient.getBlock()).timestamp < bidDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
  }

  stage = "CLOSE_AND_PROOF";
  await recordTransaction("closeTender", market.write.closeTender([tenderId]));
  evidence.assertions.winnerOnlyPublicDecryptionVerified =
    (await market.read.winnerIdIsPubliclyDecryptable([tenderId])) === true &&
    (await market.read.bestPriceIsPubliclyDecryptable([tenderId])) === false;
  assert.equal(
    evidence.assertions.winnerOnlyPublicDecryptionVerified,
    true,
  );
  const closedTender = await market.read.getTender([tenderId]);
  const winnerResult = await retry(
    () =>
      buyerHandles.publicDecrypt(
        closedTender.encryptedWinnerBidIdHandle,
      ),
    "WINNER_PUBLIC_DECRYPT_TIMEOUT",
  );
  assert.equal(winnerResult.value, 1n);

  stage = "FINALIZE";
  await recordTransaction(
    "finalizeTender",
    market.write.finalizeTender([
      tenderId,
      winnerResult.decryptionProof,
    ]),
  );
  const awarded = await market.read.getTender([tenderId]);
  evidence.assertions.proofDerivedWinnerVerified =
    awarded.status === 3 &&
    awarded.winnerBidId === 1n &&
    getAddress(awarded.winner) === getAddress(vendorAccount.address);
  assert.equal(evidence.assertions.proofDerivedWinnerVerified, true);

  const buyerAfter = await confidentialBalance(
    buyerAccount.address,
    buyerHandles,
    wrapper,
  );
  const vendorAfter = await confidentialBalance(
    vendorAccount.address,
    vendorHandles,
    wrapper,
  );
  evidence.assertions.confidentialSettlementVerifiedInMemory =
    buyerAfter === buyerBefore - winningPrice &&
    vendorAfter === vendorBefore + winningPrice &&
    buyerAfter + vendorAfter === buyerBefore + vendorBefore;
  assert.equal(
    evidence.assertions.confidentialSettlementVerifiedInMemory,
    true,
  );

  const receipt = getContract({
    address: receiptAddress,
    abi: receiptArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  evidence.assertions.awardReceiptVerified =
    getAddress(await receipt.read.ownerOf([tenderId])) ===
      getAddress(vendorAccount.address) &&
    (await receipt.read.getAward([tenderId])).tenderId === tenderId;
  assert.equal(evidence.assertions.awardReceiptVerified, true);

  await expectSimulationRevert({
    account: buyerAccount,
    address: marketAddress,
    artifact: marketArtifact,
    functionName: "finalizeTender",
    args: [tenderId, winnerResult.decryptionProof],
  });
  evidence.assertions.finalizeReplayRejected = true;

  stage = "POST_CLOSE_VIEWER_GRANT";
  await recordTransaction(
    "grantBuyerViewer",
    market.write.grantBidViewer([
      tenderId,
      1n,
      buyerAccount.address,
    ]),
  );
  assert.equal(
    await market.read.bidViewableBy([
      tenderId,
      1n,
      buyerAccount.address,
    ]),
    true,
  );
  assert.equal(
    (
      await retry(
        () => buyerHandles.decrypt(bid.encryptedPriceHandle),
        "BUYER_BID_DECRYPT_TIMEOUT",
      )
    ).value,
    winningPrice,
  );
  evidence.assertions.postCloseBuyerGrantVerifiedInMemory = true;

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/market-eoa.json",
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
      : `SEPOLIA_MARKET_EOA_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
