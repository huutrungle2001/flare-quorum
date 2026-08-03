import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createViemHandleClient } from "@iexec-nox/handle";
import {
  createPublicClient,
  createWalletClient,
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

const root = resolve(import.meta.dirname, "../../../..");
const deploymentEvidencePath = resolve(
  root,
  "evidence/sepolia/market-eoa.json",
);
const outputPath = resolve(root, "evidence/sepolia/market-refund.json");
const zeroBytes32 = `0x${"0".repeat(64)}`;
const refundCeiling = 50_000_000n;
const cancelCeiling = 20_000_000n;

const evidence = {
  schemaVersion: 1,
  suite: "production-market-refund",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "official-nox-testnet",
  },
  publicIdentifiers: {
    buyer: null,
    vendor: null,
    tenderIds: {},
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    canonicalTestDeploymentReused: false,
    invalidBidAcceptedWithoutPrivateBranch: false,
    buyerCannotCancelAfterBid: false,
    noValidWinnerProofVerified: false,
    fullConfidentialRefundVerifiedInMemory: false,
    refundReplayRejected: false,
    closedTenderCannotCancel: false,
    preBidBuyerCancellationVerified: false,
    cancellationRefundVerifiedInMemory: false,
    cancellationReplayRejected: false,
  },
  blockers: [],
  notes: [
    "Bid prices, balances, handles, proofs, signatures, RPC credentials, and wallet secrets were kept in memory and omitted.",
    "This suite reuses the production-contract test deployment in market-eoa.json; it is not a canonical release deployment.",
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
  return privateKeyToAccount(key);
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
  const buyer = accountFromEnvironment("SEPOLIA_PRIVATE_KEY");
  const vendor = accountFromEnvironment("SEPOLIA_VENDOR_PRIVATE_KEY");
  const deployed = JSON.parse(readFileSync(deploymentEvidencePath, "utf8"));
  const { Market: marketAddress, Underlying: underlyingAddress, Wrapper: wrapperAddress } =
    deployed.publicIdentifiers.contracts;
  assert.ok(marketAddress && underlyingAddress && wrapperAddress);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const buyerWallet = createWalletClient({
    account: buyer,
    chain: sepolia,
    transport,
  });
  const vendorWallet = createWalletClient({
    account: vendor,
    chain: sepolia,
    transport,
  });
  const buyerHandles = await createViemHandleClient(buyerWallet);
  const vendorHandles = await createViemHandleClient(vendorWallet);
  evidence.publicIdentifiers.buyer = buyer.address;
  evidence.publicIdentifiers.vendor = vendor.address;
  evidence.publicIdentifiers.contracts = {
    Market: marketAddress,
    Underlying: underlyingAddress,
    Wrapper: wrapperAddress,
  };

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
  evidence.assertions.canonicalTestDeploymentReused =
    (await publicClient.getCode({ address: marketAddress })) !== undefined;
  assert.equal(evidence.assertions.canonicalTestDeploymentReused, true);

  async function recordTransaction(label, promise) {
    const hash = await promise;
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    evidence.publicIdentifiers.transactions[label] = hash;
    evidence.publicIdentifiers.blocks[label] = receipt.blockNumber.toString();
    saveEvidence();
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

  async function balance(address, handles) {
    const encrypted = await wrapper.read.confidentialBalanceOf([address]);
    if (encrypted === zeroBytes32) return 0n;
    return (
      await retry(
        () => handles.decrypt(encrypted),
        "CONFIDENTIAL_BALANCE_DECRYPT_TIMEOUT",
      )
    ).value;
  }

  async function createAndOpen(label, ceiling, deadline) {
    await recordTransaction(
      `${label}Create`,
      market.write.createTender([
        keccak256(toHex(`veilbid-${label}-v1`)),
        ceiling,
        deadline,
        [vendor.address],
      ]),
    );
    const tenderId = await market.read.tenderCount();
    evidence.publicIdentifiers.tenderIds[label] = tenderId.toString();
    const pending = await market.read.getTender([tenderId]);
    const funding = await retry(
      () => buyerHandles.publicDecrypt(pending.fundingCheckHandle),
      "FUNDING_PUBLIC_DECRYPT_TIMEOUT",
    );
    assert.equal(funding.value, true);
    await recordTransaction(
      `${label}ConfirmFunding`,
      market.write.confirmTenderFunding([
        tenderId,
        funding.decryptionProof,
      ]),
    );
    return tenderId;
  }

  stage = "ASSET_SETUP";
  await recordTransaction("faucet", underlying.write.faucet());
  await recordTransaction(
    "approveWrapper",
    underlying.write.approve([
      wrapperAddress,
      refundCeiling + cancelCeiling,
    ]),
  );
  await recordTransaction(
    "wrapConfidential",
    wrapper.write.wrap([
      buyer.address,
      refundCeiling + cancelCeiling,
    ]),
  );

  stage = "NO_VALID_BID";
  const buyerBeforeRefund = await balance(buyer.address, buyerHandles);
  const vendorBeforeRefund = await balance(vendor.address, vendorHandles);
  const refundDeadline = (await publicClient.getBlock()).timestamp + 120n;
  const refundTenderId = await createAndOpen(
    "refund",
    refundCeiling,
    refundDeadline,
  );
  const invalidBid = await vendorHandles.encryptInput(
    0n,
    "uint256",
    marketAddress,
  );
  await recordTransaction(
    "refundSubmitInvalidBid",
    vendorMarket.write.submitBid([
      refundTenderId,
      invalidBid.handle,
      invalidBid.handleProof,
    ]),
  );
  evidence.assertions.invalidBidAcceptedWithoutPrivateBranch = true;
  await expectRevert(buyer, "cancelTender", [refundTenderId]);
  evidence.assertions.buyerCannotCancelAfterBid = true;

  while ((await publicClient.getBlock()).timestamp < refundDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
  }
  await recordTransaction(
    "refundClose",
    market.write.closeTender([refundTenderId]),
  );
  await expectRevert(buyer, "cancelTender", [refundTenderId]);
  evidence.assertions.closedTenderCannotCancel = true;
  const closed = await market.read.getTender([refundTenderId]);
  const winner = await retry(
    () =>
      buyerHandles.publicDecrypt(
        closed.encryptedWinnerBidIdHandle,
      ),
    "WINNER_PUBLIC_DECRYPT_TIMEOUT",
  );
  assert.equal(winner.value, 0n);
  evidence.assertions.noValidWinnerProofVerified = true;
  await recordTransaction(
    "refundFinalize",
    market.write.finalizeTender([
      refundTenderId,
      winner.decryptionProof,
    ]),
  );
  assert.equal((await market.read.getTender([refundTenderId])).status, 4);
  assert.equal(await balance(buyer.address, buyerHandles), buyerBeforeRefund);
  assert.equal(await balance(vendor.address, vendorHandles), vendorBeforeRefund);
  evidence.assertions.fullConfidentialRefundVerifiedInMemory = true;
  await expectRevert(buyer, "finalizeTender", [
    refundTenderId,
    winner.decryptionProof,
  ]);
  evidence.assertions.refundReplayRejected = true;

  stage = "PRE_BID_CANCELLATION";
  const buyerBeforeCancel = await balance(buyer.address, buyerHandles);
  const cancelDeadline = (await publicClient.getBlock()).timestamp + 600n;
  const cancelTenderId = await createAndOpen(
    "cancel",
    cancelCeiling,
    cancelDeadline,
  );
  await recordTransaction(
    "cancelTender",
    market.write.cancelTender([cancelTenderId]),
  );
  assert.equal((await market.read.getTender([cancelTenderId])).status, 5);
  evidence.assertions.preBidBuyerCancellationVerified = true;
  assert.equal(await balance(buyer.address, buyerHandles), buyerBeforeCancel);
  evidence.assertions.cancellationRefundVerifiedInMemory = true;
  await expectRevert(buyer, "cancelTender", [cancelTenderId]);
  evidence.assertions.cancellationReplayRejected = true;

  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/market-refund.json",
      tenderIds: evidence.publicIdentifiers.tenderIds,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SEPOLIA_MARKET_REFUND_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
