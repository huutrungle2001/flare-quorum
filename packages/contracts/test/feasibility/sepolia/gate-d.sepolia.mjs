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
import underlyingArtifact from "../../../artifacts/contracts/feasibility/EscrowSettlementSpikes.sol/TestUSDC.json" with {
  type: "json",
};
import wrapperArtifact from "../../../artifacts/contracts/feasibility/EscrowSettlementSpikes.sol/TestConfidentialUSDC.json" with {
  type: "json",
};
import singleArtifact from "../../../artifacts/contracts/feasibility/EscrowSettlementSpikes.sol/SingleEscrowSettlementSpike.json" with {
  type: "json",
};
import splitEscrowArtifact from "../../../artifacts/contracts/feasibility/EscrowSettlementSpikes.sol/SplitEscrowSpike.json" with {
  type: "json",
};
import splitMarketArtifact from "../../../artifacts/contracts/feasibility/EscrowSettlementSpikes.sol/SplitMarketSettlementSpike.json" with {
  type: "json",
};

const root = resolve(import.meta.dirname, "../../../../..");
const outputPath = resolve(root, "evidence/sepolia/gate-d.json");
const zeroBytes32 = `0x${"0".repeat(64)}`;
const budget = 100_000_000n;
const winningPrice = 37_000_000n;
const initialWrappedAmount = budget * 4n;
const maxUint48 = (1n << 48n) - 1n;

const evidence = {
  schemaVersion: 1,
  gate: "D",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: sepolia.id,
    runtime: "official-nox-testnet",
  },
  publicIdentifiers: {
    deployer: null,
    winner: null,
    contracts: {},
    transactions: {},
    blocks: {},
  },
  assertions: {
    officialWrapperDeployed: false,
    wrappedBalanceVerifiedInMemory: false,
    exactFundingProofVerified: false,
    underfundedAttemptRejected: false,
    singleWinnerRemainderVerifiedInMemory: false,
    singleFullRefundVerifiedInMemory: false,
    splitTransientAclVerified: false,
    splitWinnerRemainderVerifiedInMemory: false,
    splitFullRefundVerifiedInMemory: false,
    doubleSettlementRejected: false,
    confidentialConservationVerifiedInMemory: false,
  },
  blockers: [],
  notes: [
    "Confidential balances, payment/refund values, handles, proofs, signatures, and wallet secrets were kept in memory and omitted from this artifact.",
    "The official ERC-7984 wrapper is exercised through a VeilBid-owned test subclass; no external deployment address was reused.",
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

function normalizePrivateKey(value) {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("SEPOLIA_PRIVATE_KEY_INVALID");
  }
  return normalized;
}

async function decryptEventually(handleClient, encryptedValue) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await handleClient.decrypt(encryptedValue);
    } catch (error) {
      if (attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error("DECRYPT_RETRY_EXHAUSTED");
}

async function publicDecryptEventually(handleClient, encryptedValue) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await handleClient.publicDecrypt(encryptedValue);
    } catch (error) {
      if (attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error("PUBLIC_DECRYPT_RETRY_EXHAUSTED");
}

async function main() {
  const rpcUrl = requiredEnvironment("SEPOLIA_RPC_URL");
  const buyerAccount = privateKeyToAccount(
    normalizePrivateKey(requiredEnvironment("SEPOLIA_PRIVATE_KEY")),
  );
  const winnerAccount = privateKeyToAccount(
    normalizePrivateKey(requiredEnvironment("SEPOLIA_VENDOR_PRIVATE_KEY")),
  );
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const buyerWallet = createWalletClient({
    account: buyerAccount,
    chain: sepolia,
    transport,
  });
  const buyerHandles = await createViemHandleClient(buyerWallet);
  const winnerWallet = createWalletClient({
    account: winnerAccount,
    chain: sepolia,
    transport,
  });
  const winnerHandles = await createViemHandleClient(winnerWallet);
  evidence.publicIdentifiers.deployer = buyerAccount.address;
  evidence.publicIdentifiers.winner = winnerAccount.address;

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

  async function expectRevert(artifact, address, functionName, args = []) {
    await assert.rejects(
      publicClient.simulateContract({
        abi: artifact.abi,
        account: buyerAccount,
        address,
        args,
        functionName,
      }),
    );
  }

  async function confidentialBalance(address, handleClient, wrapper) {
    const encryptedBalance = await wrapper.read.confidentialBalanceOf([address]);
    if (encryptedBalance === zeroBytes32) return 0n;
    return (await decryptEventually(handleClient, encryptedBalance)).value;
  }

  async function confirmExactFunding(label, settlement) {
    const publicResult = await publicDecryptEventually(
      buyerHandles,
      await settlement.read.fundingCheckHandle(),
    );
    assert.equal(publicResult.value, true);
    await recordTransaction(
      `${label}ConfirmFunding`,
      settlement.write.confirmFunding([publicResult.decryptionProof]),
    );
    assert.equal(await settlement.read.funded(), true);
  }

  stage = "TOKEN_DEPLOYMENT";
  const underlyingAddress = await deploy("Underlying", underlyingArtifact);
  const wrapperAddress = await deploy("Wrapper", wrapperArtifact, [
    underlyingAddress,
  ]);
  evidence.assertions.officialWrapperDeployed = true;
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

  stage = "TOKEN_WRAP";
  await recordTransaction(
    "mintUnderlying",
    underlying.write.mint([buyerAccount.address, initialWrappedAmount]),
  );
  await recordTransaction(
    "approveWrapper",
    underlying.write.approve([wrapperAddress, initialWrappedAmount]),
  );
  await recordTransaction(
    "wrapConfidential",
    wrapper.write.wrap([buyerAccount.address, initialWrappedAmount]),
  );
  assert.equal(
    await confidentialBalance(buyerAccount.address, buyerHandles, wrapper),
    initialWrappedAmount,
  );
  evidence.assertions.wrappedBalanceVerifiedInMemory = true;

  stage = "SINGLE_WINNER";
  const singleWinnerAddress = await deploy("SingleWinner", singleArtifact, [
    wrapperAddress,
    buyerAccount.address,
    budget,
  ]);
  const singleWinner = getContract({
    address: singleWinnerAddress,
    abi: singleArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  await recordTransaction(
    "singleWinnerOperator",
    wrapper.write.setOperator([singleWinnerAddress, maxUint48]),
  );
  const singleBuyerBefore = await confidentialBalance(
    buyerAccount.address,
    buyerHandles,
    wrapper,
  );
  const singleWinnerBefore = await confidentialBalance(
    winnerAccount.address,
    winnerHandles,
    wrapper,
  );
  await recordTransaction("singleWinnerFund", singleWinner.write.fund());
  await confirmExactFunding("singleWinner", singleWinner);
  const singlePrice = await buyerHandles.encryptInput(
    winningPrice,
    "uint256",
    singleWinnerAddress,
  );
  await recordTransaction(
    "singleWinnerSetPrice",
    singleWinner.write.setWinningPrice([
      singlePrice.handle,
      singlePrice.handleProof,
    ]),
  );
  await recordTransaction(
    "singleWinnerSettle",
    singleWinner.write.settleWinner([winnerAccount.address]),
  );
  const singleBuyerAfter = await confidentialBalance(
    buyerAccount.address,
    buyerHandles,
    wrapper,
  );
  const singleWinnerAfter = await confidentialBalance(
    winnerAccount.address,
    winnerHandles,
    wrapper,
  );
  assert.equal(singleBuyerAfter, singleBuyerBefore - winningPrice);
  assert.equal(singleWinnerAfter, singleWinnerBefore + winningPrice);
  evidence.assertions.singleWinnerRemainderVerifiedInMemory = true;
  await expectRevert(
    singleArtifact,
    singleWinnerAddress,
    "settleWinner",
    [winnerAccount.address],
  );
  assert.equal(
    await confidentialBalance(buyerAccount.address, buyerHandles, wrapper),
    singleBuyerAfter,
  );
  assert.equal(
    await confidentialBalance(winnerAccount.address, winnerHandles, wrapper),
    singleWinnerAfter,
  );

  stage = "SINGLE_REFUND";
  const singleRefundAddress = await deploy("SingleRefund", singleArtifact, [
    wrapperAddress,
    buyerAccount.address,
    budget,
  ]);
  const singleRefund = getContract({
    address: singleRefundAddress,
    abi: singleArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  await recordTransaction(
    "singleRefundOperator",
    wrapper.write.setOperator([singleRefundAddress, maxUint48]),
  );
  const singleRefundBefore = await confidentialBalance(
    buyerAccount.address,
    buyerHandles,
    wrapper,
  );
  await recordTransaction("singleRefundFund", singleRefund.write.fund());
  await confirmExactFunding("singleRefund", singleRefund);
  await recordTransaction(
    "singleRefundSettle",
    singleRefund.write.refundNoWinner(),
  );
  assert.equal(
    await confidentialBalance(buyerAccount.address, buyerHandles, wrapper),
    singleRefundBefore,
  );
  evidence.assertions.singleFullRefundVerifiedInMemory = true;
  await expectRevert(
    singleArtifact,
    singleRefundAddress,
    "refundNoWinner",
  );

  stage = "SPLIT_WINNER";
  const splitWinnerEscrowAddress = await deploy(
    "SplitWinnerEscrow",
    splitEscrowArtifact,
    [wrapperAddress, buyerAccount.address, budget],
  );
  const splitWinnerMarketAddress = await deploy(
    "SplitWinnerMarket",
    splitMarketArtifact,
    [buyerAccount.address, splitWinnerEscrowAddress],
  );
  const splitWinnerEscrow = getContract({
    address: splitWinnerEscrowAddress,
    abi: splitEscrowArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  const splitWinnerMarket = getContract({
    address: splitWinnerMarketAddress,
    abi: splitMarketArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  await recordTransaction(
    "splitWinnerConfigure",
    splitWinnerEscrow.write.configureMarket([splitWinnerMarketAddress]),
  );
  await recordTransaction(
    "splitWinnerOperator",
    wrapper.write.setOperator([splitWinnerEscrowAddress, maxUint48]),
  );
  const splitBuyerBefore = await confidentialBalance(
    buyerAccount.address,
    buyerHandles,
    wrapper,
  );
  const splitWinnerBefore = await confidentialBalance(
    winnerAccount.address,
    winnerHandles,
    wrapper,
  );
  await recordTransaction("splitWinnerFund", splitWinnerEscrow.write.fund());
  await confirmExactFunding("splitWinner", splitWinnerEscrow);
  const splitPrice = await buyerHandles.encryptInput(
    winningPrice,
    "uint256",
    splitWinnerMarketAddress,
  );
  await recordTransaction(
    "splitWinnerSetPrice",
    splitWinnerMarket.write.setWinningPrice([
      splitPrice.handle,
      splitPrice.handleProof,
    ]),
  );
  await expectRevert(
    splitMarketArtifact,
    splitWinnerMarketAddress,
    "settleWithoutTransientAccessForTest",
    [winnerAccount.address],
  );
  evidence.assertions.splitTransientAclVerified = true;
  await recordTransaction(
    "splitWinnerSettle",
    splitWinnerMarket.write.settleWinner([winnerAccount.address]),
  );
  const splitBuyerAfter = await confidentialBalance(
    buyerAccount.address,
    buyerHandles,
    wrapper,
  );
  const splitWinnerAfter = await confidentialBalance(
    winnerAccount.address,
    winnerHandles,
    wrapper,
  );
  assert.equal(splitBuyerAfter, splitBuyerBefore - winningPrice);
  assert.equal(splitWinnerAfter, splitWinnerBefore + winningPrice);
  evidence.assertions.splitWinnerRemainderVerifiedInMemory = true;
  await expectRevert(
    splitMarketArtifact,
    splitWinnerMarketAddress,
    "settleWinner",
    [winnerAccount.address],
  );

  stage = "SPLIT_REFUND";
  const splitRefundEscrowAddress = await deploy(
    "SplitRefundEscrow",
    splitEscrowArtifact,
    [wrapperAddress, buyerAccount.address, budget],
  );
  const splitRefundMarketAddress = await deploy(
    "SplitRefundMarket",
    splitMarketArtifact,
    [buyerAccount.address, splitRefundEscrowAddress],
  );
  const splitRefundEscrow = getContract({
    address: splitRefundEscrowAddress,
    abi: splitEscrowArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  const splitRefundMarket = getContract({
    address: splitRefundMarketAddress,
    abi: splitMarketArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  await recordTransaction(
    "splitRefundConfigure",
    splitRefundEscrow.write.configureMarket([splitRefundMarketAddress]),
  );
  await recordTransaction(
    "splitRefundOperator",
    wrapper.write.setOperator([splitRefundEscrowAddress, maxUint48]),
  );
  const splitRefundBefore = await confidentialBalance(
    buyerAccount.address,
    buyerHandles,
    wrapper,
  );
  await recordTransaction("splitRefundFund", splitRefundEscrow.write.fund());
  await confirmExactFunding("splitRefund", splitRefundEscrow);
  await recordTransaction(
    "splitRefundSettle",
    splitRefundMarket.write.refundNoWinner(),
  );
  assert.equal(
    await confidentialBalance(buyerAccount.address, buyerHandles, wrapper),
    splitRefundBefore,
  );
  evidence.assertions.splitFullRefundVerifiedInMemory = true;
  await expectRevert(
    splitMarketArtifact,
    splitRefundMarketAddress,
    "refundNoWinner",
  );

  stage = "UNDERFUNDED_ATTEMPT";
  const underfundedBudget = initialWrappedAmount + 1n;
  const underfundedAddress = await deploy("Underfunded", singleArtifact, [
    wrapperAddress,
    buyerAccount.address,
    underfundedBudget,
  ]);
  const underfunded = getContract({
    address: underfundedAddress,
    abi: singleArtifact.abi,
    client: { public: publicClient, wallet: buyerWallet },
  });
  await recordTransaction(
    "underfundedOperator",
    wrapper.write.setOperator([underfundedAddress, maxUint48]),
  );
  const underfundedBefore = await confidentialBalance(
    buyerAccount.address,
    buyerHandles,
    wrapper,
  );
  await recordTransaction("underfundedFund", underfunded.write.fund());
  const failedFunding = await publicDecryptEventually(
    buyerHandles,
    await underfunded.read.fundingCheckHandle(),
  );
  assert.equal(failedFunding.value, false);
  await expectRevert(
    singleArtifact,
    underfundedAddress,
    "confirmFunding",
    [failedFunding.decryptionProof],
  );
  await expectRevert(
    singleArtifact,
    underfundedAddress,
    "refundNoWinner",
  );
  assert.equal(await underfunded.read.funded(), false);
  assert.equal(
    await confidentialBalance(buyerAccount.address, buyerHandles, wrapper),
    underfundedBefore,
  );
  evidence.assertions.underfundedAttemptRejected = true;

  evidence.assertions.exactFundingProofVerified = true;
  evidence.assertions.doubleSettlementRejected = true;
  evidence.assertions.confidentialConservationVerifiedInMemory = true;
  saveEvidence();
  console.log(
    JSON.stringify({
      evidence: "evidence/sepolia/gate-d.json",
      contractCount: Object.keys(evidence.publicIdentifiers.contracts).length,
      assertions: evidence.assertions,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `SEPOLIA_GATE_D_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`The live run stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
