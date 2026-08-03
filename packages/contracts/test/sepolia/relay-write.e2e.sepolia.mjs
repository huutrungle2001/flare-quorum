import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
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
import marketArtifact from "../../artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json" with {
  type: "json",
};
import moduleArtifact from "../../artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json" with {
  type: "json",
};
import wrapperArtifact from "../../artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidConfidentialUSDC.json" with {
  type: "json",
};
import deployment from "../../deployments/sepolia.release.json" with {
  type: "json",
};
import {
  loadRelayConfig,
  LiveRelay,
  runRelayActions,
} from "../../../../apps/relay/dist/index.js";

const root = resolve(import.meta.dirname, "../../../..");
const outputPath = resolve(root, "evidence/sepolia/relay-write-e2e.json");
const budget = 1_000_000n;
const bid = 700_000n;
const maxUint48 = (1n << 48n) - 1n;

const evidence = {
  schemaVersion: 1,
  suite: "relay-write-e2e",
  recordedAt: new Date().toISOString(),
  network: "ethereum-sepolia",
  chainId: sepolia.id,
  deploymentKind: deployment.kind,
  deploymentVerified: deployment.verified,
  publicIdentifiers: {
    safe: deployment.contracts.VeilBidDemoSafe.address,
    market: deployment.contracts.VeilBidMarket.address,
    tenderId: null,
    transactions: {},
    blocks: {},
  },
  assertions: {
    releaseModuleEnabled: false,
    releaseMarketOperatorEnabled: false,
    safeCreatedTender: false,
    atomicSafeBatchVerified: false,
    exactFundingConfirmed: false,
    relayFundingSubmitted: false,
    vendorBidSubmitted: false,
    relayCloseSubmitted: false,
    relayFinalizeSubmitted: false,
    proofDerivedAward: false,
    relayWriteLifecycleCompleted: false,
  },
  blockers: [],
  notes: [
    "This is a real Sepolia write test using the canonical release contracts and a disposable Safe-funded tender.",
    "Bid values, balances, handles, proofs, signatures, RPC credentials, and wallet secrets were kept in memory and omitted.",
  ],
};

let stage = "initialization";

function saveEvidence() {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
}

function accountFromEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  const key = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${name}_INVALID`);
  return privateKeyToAccount(key);
}

async function main() {
  stage = "configuration";
  if (deployment.chainId !== sepolia.id || !deployment.verified) {
    throw new Error("RELEASE_DEPLOYMENT_NOT_VERIFIED");
  }
  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL_MISSING");
  const owner = accountFromEnvironment("SEPOLIA_PRIVATE_KEY");
  const vendor = accountFromEnvironment("SEPOLIA_VENDOR_PRIVATE_KEY");
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const ownerWallet = createWalletClient({
    account: owner,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const vendorWallet = createWalletClient({
    account: vendor,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const handles = await createViemHandleClient(ownerWallet);
  const vendorHandles = await createViemHandleClient(vendorWallet);
  const safe = deployment.contracts.VeilBidDemoSafe.address;
  const marketAddress = deployment.contracts.VeilBidMarket.address;
  const moduleAddress = deployment.contracts.VeilBidSafePreparationModule.address;
  const wrapperAddress = deployment.contracts.VeilBidConfidentialUSDC.address;
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
  const wrapper = getContract({
    address: wrapperAddress,
    abi: wrapperArtifact.abi,
    client: { public: publicClient, wallet: ownerWallet },
  });
  const safeKit = await Safe.init({
    provider: rpcUrl,
    signer: process.env.SEPOLIA_PRIVATE_KEY,
    safeAddress: safe,
  });
  assert.equal(await safeKit.isSafeDeployed(), true);
  evidence.assertions.releaseModuleEnabled =
    await safeKit.isModuleEnabled(moduleAddress);
  evidence.assertions.releaseMarketOperatorEnabled =
    await wrapper.read.isOperator([safe, marketAddress]);
  assert.equal(evidence.assertions.releaseModuleEnabled, true);
  assert.equal(evidence.assertions.releaseMarketOperatorEnabled, true);

  async function record(label, hash) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = hash;
    evidence.publicIdentifiers.blocks[label] = receipt.blockNumber.toString();
    saveEvidence();
  }

  const latest = await publicClient.getBlock({ blockTag: "latest" });
  // Safe Protocol Kit submission can take several confirmations on Sepolia;
  // leave enough runway for the vendor write before the relay close window.
  const deadline = latest.timestamp + 180n;
  const vendors = [vendor.address];
  const metadataHash = keccak256(
    toHex(`veilbid-relay-write-${Date.now()}`),
  );
  const nonce = BigInt(Date.now());
  const actionDataHash = await market.read.hashTenderAction([
    safe,
    owner.address,
    metadataHash,
    budget,
    deadline,
    vendors,
  ]);
  const module = getContract({
    address: moduleAddress,
    abi: moduleArtifact.abi,
    client: { public: publicClient, wallet: ownerWallet },
  });
  const actionHash = await module.read.computeActionHash([
    actionDataHash,
    nonce,
  ]);
  const encryptedBudget = await handles.encryptInput(
    budget,
    "uint256",
    moduleAddress,
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
      nonce,
    ],
  });
  const createTenderData = encodeFunctionData({
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
  });
  const safeTransaction = await safeKit.createTransaction({
    transactions: [
      { to: moduleAddress, value: "0", data: prepareInputData },
      { to: marketAddress, value: "0", data: createTenderData },
    ],
  });
  stage = "safe-create-tender";
  const safeExecution = await safeKit.executeTransaction(safeTransaction);
  await record("safeCreateTender", safeExecution.hash);
  const tenderId = await market.read.tenderCount();
  evidence.publicIdentifiers.tenderId = tenderId.toString();
  evidence.assertions.safeCreatedTender =
    (await market.read.getTender([tenderId])).status === 0;
  evidence.assertions.atomicSafeBatchVerified =
    (await module.read.preparedConsumed([actionHash])) === true;
  assert.equal(evidence.assertions.safeCreatedTender, true);
  assert.equal(evidence.assertions.atomicSafeBatchVerified, true);

  const pending = await market.read.getTender([tenderId]);
  stage = "confirm-funding";
  const relayConfig = loadRelayConfig(["once"], process.env);
  const relay = new LiveRelay(relayConfig);
  const fundingSummary = await runRelayActions({
    actions: [{ kind: "confirm-funding", tenderId }],
    budget: 1,
    adapter: relay.adapter(),
  });
  const fundingResult = fundingSummary.results[0];
  assert.equal(fundingResult.outcome, "submitted");
  evidence.assertions.relayFundingSubmitted = true;
  await record("relayFunding", fundingResult.transactionHash);
  evidence.assertions.exactFundingConfirmed =
    (await market.read.getTender([tenderId])).status === 1;
  assert.equal(evidence.assertions.exactFundingConfirmed, true);

  const encryptedBid = await vendorHandles.encryptInput(
    bid,
    "uint256",
    marketAddress,
  );
  stage = "submit-bid";
  await record(
    "submitBid",
    await vendorMarket.write.submitBid([
      tenderId,
      encryptedBid.handle,
      encryptedBid.handleProof,
    ]),
  );
  evidence.assertions.vendorBidSubmitted = true;
  saveEvidence();

  stage = "relay-close";
  // Scope the live adapter to the disposable tender directly. The production
  // planner intentionally indexes finalized blocks and can lag a just-mined
  // E2E write by several Sepolia confirmations.
  const closeActions = [{ kind: "close", tenderId }];
  const closeSummary = await runRelayActions({
    actions: closeActions,
    budget: 1,
    adapter: relay.adapter(),
  });
  const closeResult = closeSummary.results[0];
  assert.equal(closeResult.outcome, "submitted");
  assert.match(closeResult.transactionHash, /^0x[0-9a-f]{64}$/i);
  evidence.assertions.relayCloseSubmitted = true;
  await record("relayClose", closeResult.transactionHash);

  stage = "relay-finalize";
  const finalizeActions = [{ kind: "finalize", tenderId }];
  const finalizeSummary = await runRelayActions({
    actions: finalizeActions,
    budget: 1,
    adapter: relay.adapter(),
  });
  const finalizeResult = finalizeSummary.results[0];
  assert.equal(finalizeResult.outcome, "submitted");
  assert.match(finalizeResult.transactionHash, /^0x[0-9a-f]{64}$/i);
  evidence.assertions.relayFinalizeSubmitted = true;
  await record("relayFinalize", finalizeResult.transactionHash);
  const awarded = await market.read.getTender([tenderId]);
  evidence.assertions.proofDerivedAward =
    awarded.status === 3 &&
    awarded.winnerBidId === 1n &&
    getAddress(awarded.winner) === getAddress(vendor.address);
  assert.equal(evidence.assertions.proofDerivedAward, true);
  evidence.assertions.relayWriteLifecycleCompleted = true;
  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/relay-write-e2e.json",
      tenderId: tenderId.toString(),
      assertions: evidence.assertions,
      transactions: evidence.publicIdentifiers.transactions,
    }),
  );
}

main().catch((error) => {
  const code =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "RELAY_WRITE_E2E_FAILED";
  evidence.blockers.push(code);
  saveEvidence();
  console.error(JSON.stringify({ blocker: code, stage, errorName: error?.name ?? "Error" }));
  process.exitCode = 1;
});
