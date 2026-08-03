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
const safeEvidencePath = resolve(root, "evidence/sepolia/market-safe.json");
const outputPath = resolve(
  root,
  "evidence/sepolia/market-safe-viewer.json",
);
const budget = 30_000_000n;
const bidPrice = 10_000_000n;
const maxUint48 = (1n << 48n) - 1n;
const zeroBytes32 = `0x${"0".repeat(64)}`;

const evidence = {
  schemaVersion: 1,
  suite: "production-market-safe-viewer",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "safe-1.4.1-and-official-nox-testnet",
  },
  publicIdentifiers: {
    owner: null,
    safe: null,
    vendor: null,
    tenderId: null,
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    existingProductionDeploymentReused: false,
    safePreparationAndFundingVerified: false,
    exactFundingProofOpenedTender: false,
    vendorBidAclAndDecryptionVerifiedInMemory: false,
    openBuyerViewerGrantRejected: false,
    proofDerivedSafeAwardVerified: false,
    vendorSettlementVerifiedInMemory: false,
    ownerDirectViewerGrantRejected: false,
    safeThresholdViewerGrantVerifiedInMemory: false,
    safeAuthorityPreserved: false,
    cleanupRevokedModuleAndOperator: false,
  },
  blockers: [],
  notes: [
    "Bid prices, balances, handles, proofs, signatures, RPC credentials, and wallet secrets were omitted.",
    "The viewer grant was executed by a normal threshold-authorized Safe transaction after award.",
    "The production module and market operator permission were disabled again after the suite.",
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

function accountFromEnvironment(name) {
  const value = requiredEnvironment(name);
  const key = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`${name}_INVALID`);
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
  const { account: owner, key: ownerKey } =
    accountFromEnvironment("SEPOLIA_PRIVATE_KEY");
  const { account: vendor } = accountFromEnvironment(
    "SEPOLIA_VENDOR_PRIVATE_KEY",
  );
  const marketEvidence = JSON.parse(readFileSync(marketEvidencePath, "utf8"));
  const safeEvidence = JSON.parse(readFileSync(safeEvidencePath, "utf8"));
  const marketAddress = marketEvidence.publicIdentifiers.contracts.Market;
  const wrapperAddress = marketEvidence.publicIdentifiers.contracts.Wrapper;
  const safeAddress = safeEvidence.publicIdentifiers.safe;
  const moduleAddress = safeEvidence.publicIdentifiers.contracts.Module;
  assert.ok(marketAddress && wrapperAddress && safeAddress && moduleAddress);

  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const ownerWallet = createWalletClient({
    account: owner,
    chain: sepolia,
    transport,
  });
  const vendorWallet = createWalletClient({
    account: vendor,
    chain: sepolia,
    transport,
  });
  const ownerHandles = await createViemHandleClient(ownerWallet);
  const vendorHandles = await createViemHandleClient(vendorWallet);
  const safeKit = await Safe.init({
    provider: rpcUrl,
    signer: ownerKey,
    safeAddress,
  });
  const ownersBefore = await safeKit.getOwners();
  const thresholdBefore = await safeKit.getThreshold();
  evidence.publicIdentifiers.owner = owner.address;
  evidence.publicIdentifiers.safe = safeAddress;
  evidence.publicIdentifiers.vendor = vendor.address;
  evidence.publicIdentifiers.contracts = {
    Market: marketAddress,
    Wrapper: wrapperAddress,
    Module: moduleAddress,
  };

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
  const vendorMarket = getContract({
    address: marketAddress,
    abi: marketArtifact.abi,
    client: { public: publicClient, wallet: vendorWallet },
  });
  const module = getContract({
    address: moduleAddress,
    abi: moduleArtifact.abi,
    client: { public: publicClient, wallet: ownerWallet },
  });
  evidence.assertions.existingProductionDeploymentReused =
    getAddress(await module.read.market()) === getAddress(marketAddress) &&
    getAddress(await module.read.safe()) === getAddress(safeAddress) &&
    (await safeKit.isModuleEnabled(moduleAddress)) === false;
  assert.equal(
    evidence.assertions.existingProductionDeploymentReused,
    true,
  );

  async function record(label, promise) {
    const hash = await promise;
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = hash;
    evidence.publicIdentifiers.blocks[label] = receipt.blockNumber.toString();
    saveEvidence();
  }

  async function executeSafe(label, transaction) {
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
    await executeSafe(
      label,
      await safeKit.createTransaction({
        transactions: [{ data, to, value: "0" }],
      }),
    );
  }

  async function expectRevert(account, functionName, args) {
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

  async function vendorBalance() {
    const encrypted = await wrapper.read.confidentialBalanceOf([
      vendor.address,
    ]);
    if (encrypted === zeroBytes32) return 0n;
    return (
      await retry(
        () => vendorHandles.decrypt(encrypted),
        "VENDOR_BALANCE_DECRYPT_TIMEOUT",
      )
    ).value;
  }

  stage = "SAFE_CONFIGURATION";
  await executeSafe(
    "enableModule",
    await safeKit.createEnableModuleTx(moduleAddress),
  );
  await safeCall(
    "authorizeMarket",
    wrapperAddress,
    encodeFunctionData({
      abi: wrapperArtifact.abi,
      functionName: "setOperator",
      args: [marketAddress, maxUint48],
    }),
  );

  stage = "SAFE_PREPARATION";
  const deadline = (await publicClient.getBlock()).timestamp + 150n;
  const metadataHash = keccak256(toHex("veilbid-safe-viewer-award-v1"));
  const vendors = [vendor.address];
  const nonce = 2n;
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
  const encryptedBudget = await ownerHandles.encryptInput(
    budget,
    "uint256",
    moduleAddress,
  );
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
  evidence.assertions.safePreparationAndFundingVerified =
    pending.status === 0 &&
    getAddress(pending.buyer) === getAddress(safeAddress) &&
    (await module.read.preparedConsumed([actionHash])) === true;
  assert.equal(evidence.assertions.safePreparationAndFundingVerified, true);
  const funding = await retry(
    () => ownerHandles.publicDecrypt(pending.fundingCheckHandle),
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

  stage = "VENDOR_BID";
  const vendorBefore = await vendorBalance();
  const encryptedBid = await vendorHandles.encryptInput(
    bidPrice,
    "uint256",
    marketAddress,
  );
  await record(
    "submitBid",
    vendorMarket.write.submitBid([
      tenderId,
      encryptedBid.handle,
      encryptedBid.handleProof,
    ]),
  );
  const bid = await market.read.getBid([tenderId, 1n]);
  evidence.assertions.vendorBidAclAndDecryptionVerifiedInMemory =
    (await market.read.bidViewableBy([
      tenderId,
      1n,
      vendor.address,
    ])) === true &&
    (await market.read.bidViewableBy([
      tenderId,
      1n,
      safeAddress,
    ])) === false &&
    (
      await retry(
        () => vendorHandles.decrypt(bid.encryptedPriceHandle),
        "VENDOR_BID_DECRYPT_TIMEOUT",
      )
    ).value === bidPrice;
  assert.equal(
    evidence.assertions.vendorBidAclAndDecryptionVerifiedInMemory,
    true,
  );
  await expectRevert(safeAddress, "grantBidViewer", [
    tenderId,
    1n,
    owner.address,
  ]);
  evidence.assertions.openBuyerViewerGrantRejected = true;

  stage = "AWARD";
  while ((await publicClient.getBlock()).timestamp < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
  }
  await record("closeTender", market.write.closeTender([tenderId]));
  const closed = await market.read.getTender([tenderId]);
  const winner = await retry(
    () =>
      ownerHandles.publicDecrypt(
        closed.encryptedWinnerBidIdHandle,
      ),
    "WINNER_PUBLIC_DECRYPT_TIMEOUT",
  );
  assert.equal(winner.value, 1n);
  await record(
    "finalizeTender",
    market.write.finalizeTender([
      tenderId,
      winner.decryptionProof,
    ]),
  );
  const awarded = await market.read.getTender([tenderId]);
  evidence.assertions.proofDerivedSafeAwardVerified =
    awarded.status === 3 &&
    getAddress(awarded.buyer) === getAddress(safeAddress) &&
    getAddress(awarded.winner) === getAddress(vendor.address);
  assert.equal(evidence.assertions.proofDerivedSafeAwardVerified, true);
  evidence.assertions.vendorSettlementVerifiedInMemory =
    (await vendorBalance()) === vendorBefore + bidPrice;
  assert.equal(evidence.assertions.vendorSettlementVerifiedInMemory, true);

  stage = "SAFE_VIEWER_GRANT";
  await expectRevert(owner, "grantBidViewer", [
    tenderId,
    1n,
    owner.address,
  ]);
  evidence.assertions.ownerDirectViewerGrantRejected = true;
  await safeCall(
    "safeGrantViewer",
    marketAddress,
    encodeFunctionData({
      abi: marketArtifact.abi,
      functionName: "grantBidViewer",
      args: [tenderId, 1n, owner.address],
    }),
  );
  evidence.assertions.safeThresholdViewerGrantVerifiedInMemory =
    (await market.read.bidViewableBy([
      tenderId,
      1n,
      owner.address,
    ])) === true &&
    (
      await retry(
        () => ownerHandles.decrypt(bid.encryptedPriceHandle),
        "OWNER_BID_DECRYPT_TIMEOUT",
      )
    ).value === bidPrice;
  assert.equal(
    evidence.assertions.safeThresholdViewerGrantVerifiedInMemory,
    true,
  );

  stage = "CLEANUP";
  await executeSafe(
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
      evidence: "evidence/sepolia/market-safe-viewer.json",
      tenderId: evidence.publicIdentifiers.tenderId,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SEPOLIA_SAFE_VIEWER_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
