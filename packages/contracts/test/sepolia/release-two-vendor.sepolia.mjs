import { strict as assert } from "node:assert";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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
import receiptArtifact from "../../artifacts/contracts/receipt/VeilBidAwardReceipt.sol/VeilBidAwardReceipt.json" with {
  type: "json",
};
import moduleArtifact from "../../artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json" with {
  type: "json",
};

const root = resolve(import.meta.dirname, "../../../..");
const deploymentPath = resolve(
  root,
  "packages/contracts/deployments/sepolia.release.json",
);
const outputPath = resolve(
  root,
  "evidence/sepolia/release-two-vendor.json",
);
const budget = 100_000_000n;
const firstPrice = 61_000_000n;
const secondPrice = 37_000_000n;
const zeroBytes32 = `0x${"0".repeat(64)}`;
const disclosureOnly = process.argv.includes("--disclosure-only");

let evidence = {
  schemaVersion: 1,
  suite: "release-two-vendor-lifecycle",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "safe-1.4.1-and-official-nox-testnet",
  },
  publicIdentifiers: {
    sourceCommit: null,
    owner: null,
    safe: null,
    vendors: [],
    tenderId: null,
    metadataHash: null,
    bidDeadline: null,
    moduleNonce: null,
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    verifiedReleaseReused: false,
    releaseSafeOperational: false,
    safePreparationAndFundingVerified: false,
    atomicSafeBatchVerified: false,
    exactFundingProofOpenedTender: false,
    twoDistinctVendorsSubmitted: false,
    perVendorBidAclVerified: false,
    bothVendorBidsDecryptedInMemory: false,
    deadlineEnforced: false,
    earlyCloseAfterAllVendorsVerified: false,
    winnerOnlyPublicDecryptionVerified: false,
    lowerSecondBidSelectedByProof: false,
    confidentialWinnerSettlementVerifiedInMemory: false,
    losingVendorBalanceUnchangedInMemory: false,
    awardReceiptVerified: false,
    reviewViewerBoundAtCreation: false,
    openReviewViewerDenied: false,
    automaticPostFinalizeReviewVerifiedInMemory: false,
    replayRejected: false,
    releaseSafeStatePreserved: false,
  },
  blockers: [],
  notes: [
    "Bid prices, confidential balances, handles, proofs, signatures, RPC credentials, and wallet secrets are asserted only in memory and omitted.",
    "The Safe owner also acts as the first approved vendor EOA; the buyer remains the distinct Safe address and the second vendor is a separate EOA.",
    "The lower second bid must become the proof-derived public winner while both bid values remain confidential by default.",
    "The release module and Safe-to-Market operator authorization remain enabled after this lifecycle.",
  ],
};
if (disclosureOnly) {
  if (!existsSync(outputPath)) {
    throw new Error("DISCLOSURE_EVIDENCE_MISSING");
  }
  evidence = JSON.parse(readFileSync(outputPath, "utf8"));
  evidence.blockers = [];
  evidence.notes = evidence.notes.filter(
    (note) =>
      !note.startsWith("The live run stopped during"),
  );
  evidence.notes.push(
    "The corrected bid-2 Safe disclosure checkpoint resumed without replaying the completed tender lifecycle.",
  );
}

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

function accountFromEnvironment(name) {
  const raw = requiredEnvironment(name);
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`${name}_INVALID`);
  }
  return { account: privateKeyToAccount(key), key };
}

async function retry(operation, code, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch {
      if (attempt === attempts - 1) throw new Error(code);
      await new Promise((resolve) => setTimeout(resolve, 4_000));
    }
  }
  throw new Error(code);
}

async function main() {
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const { account: owner, key: ownerKey } =
    accountFromEnvironment("SEPOLIA_PRIVATE_KEY");
  const { account: secondVendor } = accountFromEnvironment(
    "SEPOLIA_VENDOR_PRIVATE_KEY",
  );
  assert.notEqual(
    getAddress(owner.address),
    getAddress(secondVendor.address),
  );
  const deployment = JSON.parse(
    readFileSync(deploymentPath, "utf8"),
  );
  assert.equal(deployment.kind, "release");
  assert.equal(deployment.verified, true);
  assert.equal(deployment.deploymentState, "configured");

  const underlyingAddress =
    deployment.contracts.VeilBidTestUSDC.address;
  const wrapperAddress =
    deployment.contracts.VeilBidConfidentialUSDC.address;
  const marketAddress = deployment.contracts.VeilBidMarket.address;
  const receiptAddress =
    deployment.contracts.VeilBidAwardReceipt.address;
  const safeAddress = deployment.contracts.VeilBidDemoSafe.address;
  const moduleAddress =
    deployment.contracts.VeilBidSafePreparationModule.address;
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport,
  });
  const ownerWallet = createWalletClient({
    account: owner,
    chain: sepolia,
    transport,
  });
  const secondVendorWallet = createWalletClient({
    account: secondVendor,
    chain: sepolia,
    transport,
  });
  const ownerHandles = await createViemHandleClient(ownerWallet);
  const secondVendorHandles =
    await createViemHandleClient(secondVendorWallet);
  const safeKit = await retry(
    () =>
      Safe.init({
        provider: rpcUrl,
        signer: ownerKey,
        safeAddress,
      }),
    "SAFE_CONNECTION_FAILED",
  );
  const ownersBefore = await retry(
    () => safeKit.getOwners(),
    "SAFE_OWNERS_UNAVAILABLE",
  );
  const thresholdBefore = await retry(
    () => safeKit.getThreshold(),
    "SAFE_THRESHOLD_UNAVAILABLE",
  );

  evidence.publicIdentifiers.sourceCommit =
    deployment.sourceCommit;
  evidence.publicIdentifiers.owner = owner.address;
  evidence.publicIdentifiers.safe = safeAddress;
  evidence.publicIdentifiers.vendors = [
    owner.address,
    secondVendor.address,
  ];
  evidence.publicIdentifiers.contracts = {
    VeilBidTestUSDC: underlyingAddress,
    VeilBidConfidentialUSDC: wrapperAddress,
    VeilBidMarket: marketAddress,
    VeilBidAwardReceipt: receiptAddress,
    VeilBidDemoSafe: safeAddress,
    VeilBidSafePreparationModule: moduleAddress,
  };

  const underlying = getContract({
    address: underlyingAddress,
    abi: underlyingArtifact.abi,
    client: { public: publicClient, wallet: ownerWallet },
  });
  const wrapper = getContract({
    address: wrapperAddress,
    abi: wrapperArtifact.abi,
    client: { public: publicClient, wallet: ownerWallet },
  });
  const market = getContract({
    address: marketAddress,
    abi: marketArtifact.abi,
    client: { public: publicClient, wallet: ownerWallet },
  });
  const secondVendorMarket = getContract({
    address: marketAddress,
    abi: marketArtifact.abi,
    client: {
      public: publicClient,
      wallet: secondVendorWallet,
    },
  });
  const module = getContract({
    address: moduleAddress,
    abi: moduleArtifact.abi,
    client: { public: publicClient, wallet: ownerWallet },
  });
  const receipt = getContract({
    address: receiptAddress,
    abi: receiptArtifact.abi,
    client: publicClient,
  });

  evidence.assertions.verifiedReleaseReused =
    (await retry(
      () => publicClient.getChainId(),
      "CHAIN_ID_UNAVAILABLE",
    )) === sepolia.id &&
    getAddress(
      await retry(
        () => market.read.paymentToken(),
        "PAYMENT_TOKEN_UNAVAILABLE",
      ),
    ) === getAddress(wrapperAddress) &&
    getAddress(
      await retry(
        () => market.read.awardReceipt(),
        "RECEIPT_ADDRESS_UNAVAILABLE",
      ),
    ) === getAddress(receiptAddress);
  assert.equal(evidence.assertions.verifiedReleaseReused, true);
  evidence.assertions.releaseSafeOperational =
    (await retry(
      () => safeKit.isModuleEnabled(moduleAddress),
      "SAFE_MODULE_STATE_UNAVAILABLE",
    )) === true &&
    getAddress(
      await retry(
        () => module.read.market(),
        "MODULE_MARKET_UNAVAILABLE",
      ),
    ) === getAddress(marketAddress) &&
    (await retry(
      () => wrapper.read.isOperator([safeAddress, marketAddress]),
      "OPERATOR_STATE_UNAVAILABLE",
    )) === true;
  assert.equal(evidence.assertions.releaseSafeOperational, true);

  async function record(label, operation) {
    const hash = await retry(
      operation,
      `${label.toUpperCase()}_SUBMISSION_FAILED`,
    );
    evidence.publicIdentifiers.transactions[label] = hash;
    saveEvidence();
    const transactionReceipt = await retry(
      () =>
        publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 2,
        }),
      `${label.toUpperCase()}_RECEIPT_UNAVAILABLE`,
    );
    assert.equal(transactionReceipt.status, "success");
    evidence.publicIdentifiers.blocks[label] =
      transactionReceipt.blockNumber.toString();
    saveEvidence();
  }

  async function safeBatch(label, transactions) {
    const transaction = await retry(
      () =>
        safeKit.createTransaction({
          transactions,
        }),
      `${label.toUpperCase()}_SAFE_TX_CREATION_FAILED`,
    );
    const result = await retry(
      () =>
        safeKit.executeTransaction(transaction, {
          gasLimit: 1_000_000n,
        }),
      `${label.toUpperCase()}_SAFE_TX_SUBMISSION_FAILED`,
    );
    evidence.publicIdentifiers.transactions[label] = result.hash;
    saveEvidence();
    const transactionReceipt = await retry(
      () =>
        publicClient.waitForTransactionReceipt({
          hash: result.hash,
          confirmations: 2,
        }),
      `${label.toUpperCase()}_RECEIPT_UNAVAILABLE`,
    );
    assert.equal(transactionReceipt.status, "success");
    evidence.publicIdentifiers.blocks[label] =
      transactionReceipt.blockNumber.toString();
    saveEvidence();
  }

  async function safeCall(label, to, data) {
    await safeBatch(label, [{ data, to, value: "0" }]);
  }

  async function expectMarketRevert(account, functionName, args) {
    await assert.rejects(
      publicClient.simulateContract({
        abi: marketArtifact.abi,
        account,
        address: marketAddress,
        args,
        functionName,
      }),
    );
  }

  async function confidentialBalance(address, handles) {
    const encrypted = await retry(
      () => wrapper.read.confidentialBalanceOf([address]),
      "CONFIDENTIAL_BALANCE_UNAVAILABLE",
    );
    if (encrypted === zeroBytes32) return 0n;
    return (
      await retry(
        () => handles.decrypt(encrypted),
        "CONFIDENTIAL_BALANCE_DECRYPT_TIMEOUT",
        12,
      )
    ).value;
  }

  async function verifyAutomaticReview(tenderId, targetBid) {
    stage = "AUTOMATIC_REVIEW";
    evidence.assertions.automaticPostFinalizeReviewVerifiedInMemory =
      (await retry(
        () =>
          market.read.bidViewableBy([
            tenderId,
            2n,
            owner.address,
          ]),
        "GRANTED_VIEWER_ACL_UNAVAILABLE",
      )) === true &&
      (
        await retry(
          () =>
            ownerHandles.decrypt(
              targetBid.encryptedPriceHandle,
            ),
          "CROSS_BID_DECRYPT_TIMEOUT",
          12,
        )
      ).value === secondPrice;
    assert.equal(
      evidence.assertions.automaticPostFinalizeReviewVerifiedInMemory,
      true,
    );
  }

  async function verifyReleaseState() {
    stage = "RELEASE_STATE";
    evidence.assertions.releaseSafeStatePreserved =
      (await retry(
        () => safeKit.getThreshold(),
        "FINAL_SAFE_THRESHOLD_UNAVAILABLE",
      )) === thresholdBefore &&
      JSON.stringify(
        (
          await retry(
            () => safeKit.getOwners(),
            "FINAL_SAFE_OWNERS_UNAVAILABLE",
          )
        ).map((address) => address.toLowerCase()),
      ) ===
        JSON.stringify(
          ownersBefore.map((address) => address.toLowerCase()),
        ) &&
      (await retry(
        () => safeKit.isModuleEnabled(moduleAddress),
        "FINAL_SAFE_MODULE_STATE_UNAVAILABLE",
      )) === true &&
      (await retry(
        () =>
          wrapper.read.isOperator([
            safeAddress,
            marketAddress,
          ]),
        "FINAL_OPERATOR_STATE_UNAVAILABLE",
      )) === true;
    assert.equal(
      evidence.assertions.releaseSafeStatePreserved,
      true,
    );
  }

  if (disclosureOnly) {
    const tenderId = BigInt(evidence.publicIdentifiers.tenderId);
    const targetBid = await retry(
      () => market.read.getBid([tenderId, 2n]),
      "SECOND_BID_UNAVAILABLE",
    );
    await verifyAutomaticReview(tenderId, targetBid);
    await verifyReleaseState();
    saveEvidence();
    console.log(
      JSON.stringify({
        evidence: "evidence/sepolia/release-two-vendor.json",
        tenderId: evidence.publicIdentifiers.tenderId,
        resumed: "automatic-review",
        assertions: evidence.assertions,
      }),
    );
    return;
  }

  stage = "SAFE_ASSET_SETUP";
  await record("faucet", () => underlying.write.faucet());
  await record("approveWrapper", () =>
    underlying.write.approve([wrapperAddress, budget]),
  );
  await record("wrapToSafe", () =>
    wrapper.write.wrap([safeAddress, budget]),
  );

  stage = "SAFE_PREPARATION";
  const latestBlock = await retry(
    () => publicClient.getBlock(),
    "LATEST_BLOCK_UNAVAILABLE",
  );
  const bidDeadline = latestBlock.timestamp + 240n;
  const metadataHash = keccak256(
    toHex("veilbid-canonical-release-two-vendor-v1"),
  );
  const moduleNonce = latestBlock.number;
  evidence.publicIdentifiers.metadataHash = metadataHash;
  evidence.publicIdentifiers.bidDeadline =
    bidDeadline.toString();
  evidence.publicIdentifiers.moduleNonce =
    moduleNonce.toString();
  saveEvidence();

  const vendors = [owner.address, secondVendor.address];
  const actionDataHash = await retry(
    () =>
      market.read.hashTenderAction([
        safeAddress,
        owner.address,
        metadataHash,
        budget,
        bidDeadline,
        vendors,
      ]),
    "ACTION_DATA_HASH_UNAVAILABLE",
  );
  const actionHash = await retry(
    () => module.read.computeActionHash([actionDataHash, moduleNonce]),
    "ACTION_HASH_UNAVAILABLE",
  );
  const encryptedBudget = await retry(
    () =>
      ownerHandles.encryptInput(
        budget,
        "uint256",
        moduleAddress,
      ),
    "BUDGET_ENCRYPTION_FAILED",
  );
  const prepareInputData = encodeFunctionData({
    abi: moduleArtifact.abi,
    functionName: "prepareInputForSafe",
    args: [
      encryptedBudget.handle,
      encryptedBudget.handleProof,
      owner.address,
      marketAddress,
      actionDataHash,
      actionHash,
      moduleNonce,
    ],
  });
  const createTenderData = encodeFunctionData({
      abi: marketArtifact.abi,
      functionName: "createTenderAuthorized",
      args: [
        metadataHash,
        budget,
        bidDeadline,
        vendors,
        owner.address,
        moduleAddress,
        moduleNonce,
      ],
  });
  await safeBatch("safeCreateTender", [
    { data: prepareInputData, to: moduleAddress, value: "0" },
    { data: createTenderData, to: marketAddress, value: "0" },
  ]);
  const tenderId = await retry(
    () => market.read.tenderCount(),
    "TENDER_COUNT_UNAVAILABLE",
  );
  evidence.publicIdentifiers.tenderId = tenderId.toString();
  saveEvidence();
  const pending = await retry(
    () => market.read.getTender([tenderId]),
    "PENDING_TENDER_UNAVAILABLE",
  );
  evidence.assertions.safePreparationAndFundingVerified =
    pending.status === 0 &&
    getAddress(pending.buyer) === getAddress(safeAddress) &&
    (await retry(
      () => module.read.preparedConsumed([actionHash]),
      "PREPARED_STATE_UNAVAILABLE",
    )) === true;
  assert.equal(
    evidence.assertions.safePreparationAndFundingVerified,
    true,
  );
  evidence.assertions.reviewViewerBoundAtCreation =
    getAddress(pending.reviewViewer) === getAddress(owner.address);
  assert.equal(evidence.assertions.reviewViewerBoundAtCreation, true);
  evidence.assertions.atomicSafeBatchVerified = true;
  const funding = await retry(
    () =>
      ownerHandles.publicDecrypt(pending.fundingCheckHandle),
    "FUNDING_PUBLIC_DECRYPT_TIMEOUT",
    12,
  );
  assert.equal(funding.value, true);
  await record("confirmFunding", () =>
    market.write.confirmTenderFunding([
      tenderId,
      funding.decryptionProof,
    ]),
  );
  evidence.assertions.exactFundingProofOpenedTender =
    (
      await retry(
        () => market.read.getTender([tenderId]),
        "OPEN_TENDER_UNAVAILABLE",
      )
    ).status === 1;
  assert.equal(
    evidence.assertions.exactFundingProofOpenedTender,
    true,
  );

  stage = "TWO_VENDOR_BIDS";
  const firstVendorBefore = await confidentialBalance(
    owner.address,
    ownerHandles,
  );
  const secondVendorBefore = await confidentialBalance(
    secondVendor.address,
    secondVendorHandles,
  );
  const encryptedFirstBid = await retry(
    () =>
      ownerHandles.encryptInput(
        firstPrice,
        "uint256",
        marketAddress,
      ),
    "FIRST_BID_ENCRYPTION_FAILED",
  );
  await record("submitFirstBid", () =>
    market.write.submitBid([
      tenderId,
      encryptedFirstBid.handle,
      encryptedFirstBid.handleProof,
    ]),
  );
  assert.equal(
    await retry(
      () => market.read.canClose([tenderId]),
      "PARTIAL_VENDOR_CLOSE_READ_UNAVAILABLE",
    ),
    false,
  );
  evidence.assertions.deadlineEnforced = true;
  const encryptedSecondBid = await retry(
    () =>
      secondVendorHandles.encryptInput(
        secondPrice,
        "uint256",
        marketAddress,
      ),
    "SECOND_BID_ENCRYPTION_FAILED",
  );
  await record("submitSecondBid", () =>
    secondVendorMarket.write.submitBid([
      tenderId,
      encryptedSecondBid.handle,
      encryptedSecondBid.handleProof,
    ]),
  );
  const [firstBid, secondBid] = await Promise.all([
    retry(
      () => market.read.getBid([tenderId, 1n]),
      "FIRST_BID_UNAVAILABLE",
    ),
    retry(
      () => market.read.getBid([tenderId, 2n]),
      "SECOND_BID_UNAVAILABLE",
    ),
  ]);
  evidence.assertions.twoDistinctVendorsSubmitted =
    getAddress(firstBid.vendor) === getAddress(owner.address) &&
    getAddress(secondBid.vendor) ===
      getAddress(secondVendor.address) &&
    getAddress(firstBid.vendor) !== getAddress(secondBid.vendor);
  assert.equal(
    evidence.assertions.twoDistinctVendorsSubmitted,
    true,
  );
  evidence.assertions.perVendorBidAclVerified =
    (await retry(
      () =>
        market.read.bidViewableBy([
          tenderId,
          1n,
          owner.address,
        ]),
      "FIRST_VENDOR_ACL_UNAVAILABLE",
    )) === true &&
    (await retry(
      () =>
        market.read.bidViewableBy([
          tenderId,
          1n,
          secondVendor.address,
        ]),
      "FIRST_CROSS_VENDOR_ACL_UNAVAILABLE",
    )) === false &&
    (await retry(
      () =>
        market.read.bidViewableBy([
          tenderId,
          2n,
          secondVendor.address,
        ]),
      "SECOND_VENDOR_ACL_UNAVAILABLE",
    )) === true &&
    (await retry(
      () =>
        market.read.bidViewableBy([
          tenderId,
          2n,
          owner.address,
        ]),
      "SECOND_CROSS_VENDOR_ACL_UNAVAILABLE",
    )) === false &&
    (await retry(
      () =>
        market.read.bidViewableBy([
          tenderId,
          1n,
          safeAddress,
        ]),
      "OPEN_BUYER_ACL_UNAVAILABLE",
    )) === false;
  assert.equal(evidence.assertions.perVendorBidAclVerified, true);
  evidence.assertions.openReviewViewerDenied =
    (await retry(
      () =>
        market.read.bidViewableBy([
          tenderId,
          2n,
          owner.address,
        ]),
      "OPEN_REVIEW_VIEWER_ACL_UNAVAILABLE",
    )) === false;
  assert.equal(evidence.assertions.openReviewViewerDenied, true);
  evidence.assertions.bothVendorBidsDecryptedInMemory =
    (
      await retry(
        () => ownerHandles.decrypt(firstBid.encryptedPriceHandle),
        "FIRST_BID_DECRYPT_TIMEOUT",
        12,
      )
    ).value === firstPrice &&
    (
      await retry(
        () =>
          secondVendorHandles.decrypt(
            secondBid.encryptedPriceHandle,
          ),
        "SECOND_BID_DECRYPT_TIMEOUT",
        12,
      )
    ).value === secondPrice;
  assert.equal(
    evidence.assertions.bothVendorBidsDecryptedInMemory,
    true,
  );

  stage = "DEADLINE";
  assert.equal(
    await retry(
      () => market.read.canClose([tenderId]),
      "CAN_CLOSE_UNAVAILABLE",
    ),
    true,
  );
  evidence.assertions.earlyCloseAfterAllVendorsVerified = true;

  stage = "CLOSE_AND_FINALIZE";
  await record("closeTender", () =>
    market.write.closeTender([tenderId]),
  );
  evidence.assertions.winnerOnlyPublicDecryptionVerified =
    (await retry(
      () =>
        market.read.winnerIdIsPubliclyDecryptable([tenderId]),
      "WINNER_ACL_UNAVAILABLE",
    )) === true &&
    (await retry(
      () => market.read.bestPriceIsPubliclyDecryptable([tenderId]),
      "BEST_PRICE_ACL_UNAVAILABLE",
    )) === false;
  assert.equal(
    evidence.assertions.winnerOnlyPublicDecryptionVerified,
    true,
  );
  const closed = await retry(
    () => market.read.getTender([tenderId]),
    "CLOSED_TENDER_UNAVAILABLE",
  );
  const winner = await retry(
    () =>
      ownerHandles.publicDecrypt(
        closed.encryptedWinnerBidIdHandle,
      ),
    "WINNER_PUBLIC_DECRYPT_TIMEOUT",
    12,
  );
  assert.equal(winner.value, 2n);
  await record("finalizeTender", () =>
    market.write.finalizeTender([
      tenderId,
      winner.decryptionProof,
    ]),
  );
  const awarded = await retry(
    () => market.read.getTender([tenderId]),
    "AWARDED_TENDER_UNAVAILABLE",
  );
  evidence.assertions.lowerSecondBidSelectedByProof =
    awarded.status === 3 &&
    awarded.winnerBidId === 2n &&
    getAddress(awarded.winner) ===
      getAddress(secondVendor.address);
  assert.equal(
    evidence.assertions.lowerSecondBidSelectedByProof,
    true,
  );
  const firstVendorAfter = await confidentialBalance(
    owner.address,
    ownerHandles,
  );
  const secondVendorAfter = await confidentialBalance(
    secondVendor.address,
    secondVendorHandles,
  );
  evidence.assertions.confidentialWinnerSettlementVerifiedInMemory =
    secondVendorAfter === secondVendorBefore + secondPrice;
  evidence.assertions.losingVendorBalanceUnchangedInMemory =
    firstVendorAfter === firstVendorBefore;
  assert.equal(
    evidence.assertions.confidentialWinnerSettlementVerifiedInMemory,
    true,
  );
  assert.equal(
    evidence.assertions.losingVendorBalanceUnchangedInMemory,
    true,
  );
  evidence.assertions.awardReceiptVerified =
    getAddress(
      await retry(
        () => receipt.read.ownerOf([tenderId]),
        "RECEIPT_OWNER_UNAVAILABLE",
      ),
    ) === getAddress(secondVendor.address) &&
    (
      await retry(
        () => receipt.read.getAward([tenderId]),
        "AWARD_RECORD_UNAVAILABLE",
      )
    ).tenderId === tenderId;
  assert.equal(evidence.assertions.awardReceiptVerified, true);

  await expectMarketRevert(owner, "finalizeTender", [
    tenderId,
    winner.decryptionProof,
  ]);
  evidence.assertions.replayRejected = true;

  await verifyAutomaticReview(tenderId, secondBid);
  await verifyReleaseState();

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/release-two-vendor.json",
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
      : `RELEASE_TWO_VENDOR_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
