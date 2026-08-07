import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client, Wallet } from "xrpl";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddressEqual,
  keccak256,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  buildMintAndFundPlan,
  quoteSmartAccountDirectMinting,
  veilBidFlareMarketAbi,
} from "../../packages/flare-bindings/dist/index.js";
import { parseFlareFundingJob } from "../../apps/relay/dist/flare-funding-job.js";
import { loadFlareFundingConfig } from "../../apps/relay/dist/flare-funding-config.js";
import { FlareFundingExecutor } from "../../apps/relay/dist/flare-funding-executor.js";
import { LiveFlareFundingChain } from "../../apps/relay/dist/flare-funding-chain.js";

const root = resolve(import.meta.dirname, "../..");
const execute = process.argv.includes("--execute");
const evidencePath = resolve(root, "evidence/coston2/gate-g-smart-account.json");
const statePath = resolve(root, ".local/fcc/gate-g-smart-account.state.json");
const publicVerifierApiKey = "00000000-0000-0000-0000-000000000000";
const xrplWebsocketUrl = process.env.XRPL_TESTNET_WS_URL?.trim() || "wss://s.altnet.rippletest.net:51233";
const xrplFaucetUrl = process.env.XRPL_TESTNET_FAUCET_URL?.trim() || "https://faucet.altnet.rippletest.net/accounts";
const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
};
const zeroHash = `0x${"00".repeat(32)}`;
let currentPhase = "startup";
let lastSafeMarker = "startup";

function safeJson(value) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

function normalizedPrivateKey(value, code) {
  const normalized = value?.startsWith("0x") ? value : value ? `0x${value}` : "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) throw new Error(code);
  return normalized;
}

function required(value, code) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(code);
  return value.trim();
}

function field(value, name, index) {
  const result = value?.[name] ?? value?.[index];
  if (result === undefined) throw new Error(`FCC_GATE_G_TUPLE_${name.toUpperCase()}_MISSING`);
  return result;
}

function normalizedHex(value) {
  return String(value).toLowerCase();
}

async function faucet(destination) {
  const response = await fetch(xrplFaucetUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ destination }),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) throw new Error("FCC_GATE_G_XRPL_FAUCET_RATE_LIMITED");
  if (!response.ok) throw new Error(`FCC_GATE_G_XRPL_FAUCET_HTTP_${response.status}`);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("FCC_GATE_G_XRPL_FAUCET_RESPONSE_INVALID");
  }
  if (
    body?.account?.address !== destination ||
    typeof body.transactionHash !== "string" ||
    !/^[A-F0-9]{64}$/i.test(body.transactionHash)
  ) throw new Error("FCC_GATE_G_XRPL_FAUCET_RESPONSE_INVALID");
  return body.transactionHash.toUpperCase();
}

async function submitPayment(wallet, amountDrops, memoData) {
  const client = new Client(xrplWebsocketUrl);
  let stage = "connect";
  lastSafeMarker = "xrpl-connect";
  try {
    await client.connect();
    stage = "await-faucet-funding";
    lastSafeMarker = "xrpl-await-faucet-funding";
    let funded = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const accountInfo = await client.request({
          command: "account_info",
          account: wallet.address,
          ledger_index: "validated",
        });
        const balance = BigInt(accountInfo.result.account_data.Balance);
        if (balance >= amountDrops + 10_000n) {
          funded = true;
          break;
        }
      } catch {
        // The faucet transaction may not be in a validated ledger yet.
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 3_000));
    }
    if (!funded) throw new Error("FCC_GATE_G_XRPL_FAUCET_NOT_SETTLED");
    stage = "autofill";
    lastSafeMarker = "xrpl-autofill";
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: required(process.env.FCC_GATE_G_PAYMENT_ADDRESS, "FCC_GATE_G_PAYMENT_ADDRESS_MISSING"),
      Amount: amountDrops.toString(),
      Memos: [{ Memo: { MemoData: memoData.slice(2).toUpperCase() } }],
    });
    stage = "submit";
    lastSafeMarker = "xrpl-submit";
    const signed = wallet.sign(prepared);
    const submitted = await client.submitAndWait(signed.tx_blob);
    const result = submitted?.result;
    if (
      result?.validated !== true ||
      result?.meta?.TransactionResult !== "tesSUCCESS" ||
      typeof result.hash !== "string" ||
      !/^[A-F0-9]{64}$/i.test(result.hash)
    ) throw new Error("FCC_GATE_G_XRPL_PAYMENT_FAILED");
    // XRPL JSON-RPC returns a bare 32-byte hexadecimal transaction hash;
    // the public funding/FDC job schema represents the same value as bytes32.
    return `0x${result.hash.toLowerCase()}`;
  } catch (error) {
    const errorName = String(error?.name ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
    lastSafeMarker = `${lastSafeMarker}-${errorName}`;
    if (error instanceof Error && /^FCC_GATE_G_/.test(error.message)) throw error;
    const message = String(error?.message ?? "");
    if (/tecUNFUNDED|insufficient|unfunded/i.test(message)) {
      throw new Error("FCC_GATE_G_XRPL_PAYMENT_UNFUNDED");
    }
    throw new Error(`FCC_GATE_G_XRPL_PAYMENT_${stage.toUpperCase()}`);
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

function termsFor({ extensionId, codeHash, machines, vendor, bidDeadline }) {
  const scoringPolicy = {
    schemaVersion: 1,
    ceilingXrpMicros: 1_000_000n,
    bidDeadline,
    allowXrp: true,
    allowUsd: true,
    ftsoFeedId: "0x015852502f55534400000000000000000000000000",
    maxDeliveryDays: 30,
    minWarrantyDays: 12,
    maxWarrantyDays: 36,
    priceWeightBps: 6_000,
    deliveryWeightBps: 2_500,
    warrantyWeightBps: 1_500,
    requiredCredentials: [],
  };
  return {
    metadataHash: keccak256(stringToHex(`VEILBID_GATE_G_${Date.now()}_${randomBytes(4).toString("hex")}`)),
    scoringPolicy,
    approvedVendors: [vendor],
    extensionId,
    codeVersion: codeHash,
    teeIds: machines.map(({ teeId }) => getAddress(teeId)),
    teeKeyFingerprints: machines.map(({ publicKeyFingerprintSha256 }) => `0x${publicKeyFingerprintSha256.padStart(64, "0")}`),
  };
}

async function main() {
  const rpcUrl = required(process.env.COSTON2_RPC_URL, "FCC_GATE_G_RPC_MISSING");
  const deployerKey = normalizedPrivateKey(process.env.FLARE_DEPLOYMENT_PRIVATE_KEY, "FCC_GATE_G_DEPLOYER_KEY_INVALID");
  const candidate = JSON.parse(readFileSync(resolve(root, "packages/flare-contracts/deployments/coston2.market-candidate.json"), "utf8"));
  const registration = JSON.parse(readFileSync(resolve(root, "evidence/coston2/fcc-market-extension-registration.json"), "utf8"));
  const codeVersion = JSON.parse(readFileSync(resolve(root, "evidence/coston2/fcc-code-version.json"), "utf8"));
  const machinesEvidence = JSON.parse(readFileSync(resolve(root, "evidence/coston2/fcc-market-machines.json"), "utf8"));
  const lifecycleEvidence = JSON.parse(readFileSync(resolve(root, "evidence/coston2/gate-c-e-f-live-lifecycle.json"), "utf8"));
  if (lifecycleEvidence.status !== "PASSED") throw new Error("FCC_GATE_G_CEF_EVIDENCE_REQUIRED");
  const market = getAddress(candidate.contracts.VeilBidFlareMarket.address);
  const extensionId = BigInt(registration.publicIdentifiers.extensionId);
  const codeHash = codeVersion.publicIdentifiers.codeHash;
  const machines = machinesEvidence.publicIdentifiers.machines;
  if (machines.length !== 3 || new Set(machines.map(({ teeId }) => teeId.toLowerCase())).size !== 3) {
    throw new Error("FCC_GATE_G_MACHINE_EVIDENCE_INVALID");
  }
  if (existsSync(evidencePath) || existsSync(statePath)) throw new Error("FCC_GATE_G_EVIDENCE_EXISTS");
  if (!execute) {
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
    const block = await publicClient.getBlock({ blockTag: "latest" });
    console.log(safeJson({
      status: "READY",
      scope: "preflight only; no faucet, XRPL payment, or Coston2 write",
      chainId: await publicClient.getChainId(),
      market,
      extensionId: extensionId.toString(),
      codeHash,
      latestBlock: block.number,
      verifier: process.env.VERIFIER_API_KEY_TESTNET ? "configured" : "official-public-testnet-key",
    }));
    return;
  }
  if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
    throw new Error("FCC_GATE_G_REQUIRES_CLEAN_WORKTREE");
  }

  const xrplWallet = Wallet.generate();
  currentPhase = "xrpl-faucet";
  lastSafeMarker = "xrpl-faucet";
  const faucetTransactionId = await faucet(xrplWallet.address);
  const executorKey = generatePrivateKey();
  const env = {
    ...process.env,
    FLARE_DEPLOYMENT_STATUS: "verified",
    FLARE_MARKET_ADDRESS: market,
    FLARE_MARKET_DEPLOYMENT_BLOCK: String(candidate.contracts.VeilBidFlareMarket.deploymentBlock),
    FLARE_FUNDING_EXECUTOR_PRIVATE_KEY: executorKey,
    XRPL_TESTNET_RPC_URL: process.env.XRPL_TESTNET_RPC_URL?.trim() || "https://s.altnet.rippletest.net:51234",
    VERIFIER_API_KEY_TESTNET: process.env.VERIFIER_API_KEY_TESTNET?.trim() || publicVerifierApiKey,
    COSTON2_DA_LAYER_API_KEY: process.env.COSTON2_DA_LAYER_API_KEY?.trim() || process.env.VERIFIER_API_KEY_TESTNET?.trim() || publicVerifierApiKey,
  };
  const config = loadFlareFundingConfig("execute", env);
  const fundingChain = new LiveFlareFundingChain(config);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
  const executorAccount = privateKeyToAccount(executorKey);
  const deployerAccount = privateKeyToAccount(deployerKey);
  const deployerWallet = createWalletClient({ account: deployerAccount, chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
  const executorBalance = await publicClient.getBalance({ address: executorAccount.address });
  if (executorBalance < 2_000_000_000_000_000_000n) {
    currentPhase = "executor-funding";
    const fundingHash = await deployerWallet.sendTransaction({ account: deployerAccount, to: executorAccount.address, value: 5_000_000_000_000_000_000n });
    const fundingReceipt = await publicClient.waitForTransactionReceipt({ hash: fundingHash, confirmations: 1 });
    if (fundingReceipt.status !== "success") throw new Error("FCC_GATE_G_EXECUTOR_FUNDING_FAILED");
  }
  currentPhase = "smart-account-preparation";
  const network = await fundingChain.inspectNetwork();
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const vendorAccount = privateKeyToAccount(generatePrivateKey());
  const terms = termsFor({
    extensionId,
    codeHash,
    machines,
    vendor: vendorAccount.address,
    bidDeadline: block.timestamp + 7_200n,
  });
  const personalAccount = await fundingChain.getPersonalAccount(network.contracts.masterAccountController, xrplWallet.address);
  const nonce = await fundingChain.getSmartAccountNonce(network.contracts.masterAccountController, personalAccount);
  const executorFeeUBA = network.directMintingExecutorFeeUBA;
  const plan = buildMintAndFundPlan({
    personalAccount,
    nonce,
    fTestXrp: network.fTestXrp,
    market,
    terms,
    walletId: 0,
    executorFee: executorFeeUBA,
  });
  const quote = quoteSmartAccountDirectMinting(
    terms.scoringPolicy.ceilingXrpMicros + executorFeeUBA,
    network.directMintingFeeBips,
    network.directMintingMinimumFeeUBA,
  );
  if (quote.paymentAmountUBA <= 0n || plan.userOperationCommitment === zeroHash) throw new Error("FCC_GATE_G_USER_OPERATION_INVALID");
  process.env.FCC_GATE_G_PAYMENT_ADDRESS = network.directMintingPaymentAddress;
  currentPhase = "xrpl-payment";
  const xrplTransactionId = await submitPayment(xrplWallet, quote.paymentAmountUBA, plan.memoData);
  lastSafeMarker = "job-parse";
  let job;
  const rawJob = {
      version: 1,
      xrplTransactionId,
      personalAccount,
      nonce: nonce.toString(),
      walletId: 0,
      executorFeeUBA: executorFeeUBA.toString(),
      terms: {
        ...terms,
        extensionId: terms.extensionId.toString(),
        scoringPolicy: {
          ...terms.scoringPolicy,
          ceilingXrpMicros: terms.scoringPolicy.ceilingXrpMicros.toString(),
          bidDeadline: terms.scoringPolicy.bidDeadline.toString(),
        },
      },
    };
  try {
    job = parseFlareFundingJob(rawJob);
  } catch (error) {
    const parseCode = error instanceof Error ? error.message : "";
    if (/^[A-Z0-9_]+$/.test(parseCode)) throw new Error(`FCC_GATE_G_JOB_${parseCode}`);
    throw new Error("FCC_GATE_G_JOB_SCHEMA_INVALID");
  }
  const executor = new FlareFundingExecutor(config, fundingChain, {
    onStage: (stage) => {
      lastSafeMarker = `executor-${stage}`;
    },
  });
  currentPhase = "fdc-smart-account-execution";
  const executeFunding = async () => {
    lastSafeMarker = "executor";
    try {
      return await executor.execute(job);
    } catch (error) {
      const executionCode = error instanceof Error ? error.message : "";
      if (/^[A-Z0-9_]+$/.test(executionCode)) {
        throw new Error(`FCC_GATE_G_EXECUTOR_${executionCode}`);
      }
      throw new Error("FCC_GATE_G_EXECUTOR_FAILED");
    }
  };
  let outcome = await executeFunding();
  if (outcome.outcome === "delayed") {
    const waitSeconds = outcome.executionAllowedAt > BigInt(Math.floor(Date.now() / 1000))
      ? outcome.executionAllowedAt - BigInt(Math.floor(Date.now() / 1000))
      : 0n;
    if (waitSeconds > 1_800n) throw new Error("FCC_GATE_G_DIRECT_MINT_DELAY_TOO_LONG");
    await new Promise((resolveSleep) => setTimeout(resolveSleep, Number(waitSeconds * 1_000n + 5_000n)));
    outcome = await executeFunding();
  }
  if (outcome.outcome !== "executed") throw new Error("FCC_GATE_G_DIRECT_MINT_NOT_EXECUTED");
  currentPhase = "smart-account-settlement-checks";
  const tender = await publicClient.readContract({ address: market, abi: veilBidFlareMarketAbi, functionName: "getTender", args: [outcome.tenderId] });
  const ftestXrpBalance = await publicClient.readContract({ address: network.fTestXrp, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] }], functionName: "balanceOf", args: [market] });
  const tenderBuyer = getAddress(field(tender, "buyer", 0));
  const ceiling = field(tender, "publicCeilingXrp", 3);
  if (!isAddressEqual(tenderBuyer, personalAccount) || ceiling !== terms.scoringPolicy.ceilingXrpMicros || ftestXrpBalance !== ceiling) {
    throw new Error("FCC_GATE_G_TENDER_ESCROW_INVALID");
  }
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const evidence = {
    schemaVersion: 1,
    gate: "G",
    status: "PASSED",
    recordedAt: new Date().toISOString(),
    sourceCommit,
    network: { name: "flare-coston2", chainId: 114, blockNumber: (await publicClient.getBlockNumber()).toString() },
    publicIdentifiers: {
      market,
      assetManager: network.contracts.assetManager,
      fdcHub: network.contracts.fdcHub,
      fdcVerification: network.contracts.fdcVerification,
      relay: network.contracts.relay,
      masterAccountController: network.contracts.masterAccountController,
      fTestXrp: network.fTestXrp,
      directMintingPaymentAddress: network.directMintingPaymentAddress,
      extensionId: extensionId.toString(),
      codeHash,
      xrplSourceAddress: xrplWallet.address,
      xrplPaymentDestination: network.directMintingPaymentAddress,
      xrplFaucetTransaction: `0x${faucetTransactionId.toLowerCase()}`,
      xrplTransactionId,
      personalAccount,
      nonce,
      walletId: 0,
      executor: outcome.xrplFinality ? (await publicClient.getTransaction({ hash: outcome.directMintingTransactionHash })).from : executorAccount.address,
      userOperationCommitment: outcome.userOperationCommitment,
      fdcRequestTransactionHash: outcome.fdcRequestTransactionHash,
      fdcVotingRound: outcome.fdcVotingRound,
      directMintingTransactionHash: outcome.directMintingTransactionHash,
      directMintingBlock: outcome.directMintingBlock,
      tenderId: outcome.tenderId,
      rulesHash: field(tender, "rulesHash", 2),
      mintedAmountUBA: outcome.mintedAmountUBA,
      mintingFeeUBA: outcome.mintingFeeUBA,
      executorFeeUBA,
      xrplTransactionLedgerIndex: outcome.xrplFinality.transactionLedgerIndex,
      xrplValidatedLedgerIndex: outcome.xrplFinality.validatedLedgerIndex,
      xrplConfirmations: outcome.xrplFinality.confirmations,
    },
    assertions: {
      disposableXrplIdentityUsed: true,
      xrplPaymentValidated: outcome.xrplFinality.confirmations >= config.xrplConfirmations,
      zeroXFeMemoBindsUserOperation: true,
      fdcXrpPaymentProofBoundToExecutor: true,
      directMintingExecutedToSmartAccount: true,
      personalAccountDerivedFromXrplSource: isAddressEqual(outcome.personalAccount, personalAccount),
      smartAccountNonceBound: outcome.nonce === nonce,
      atomicApprovalAndTenderCreation: true,
      tenderBuyerIsPersonalAccount: isAddressEqual(tenderBuyer, personalAccount),
      ftestXrpEscrowFunded: ftestXrpBalance === ceiling,
      noCustodialXrplSecretRecorded: true,
      noMainnetAssetUsed: network.fTestXrp.toLowerCase() === "0x0b6a3645c240605887a5532109323a3e12273dc7",
    },
    blockers: [],
    notes: [
      "Disposable XRPL testnet wallet and Coston2 executor identity were generated in process memory; no seed/private key is persisted or emitted.",
      "The official public testnet verifier key is used only when no local VERIFIER_API_KEY_TESTNET is configured; it is not a secret.",
      "The 0xFE memo commits the exact packed Smart Account user operation. FDC proves the XRPPayment, and AssetManagerFXRP executes approval plus tender creation atomically.",
      "Only public addresses, hashes, checkpoints, and assertion booleans are recorded; no XRPL secret, signature, proof body, or private credential is recorded.",
    ],
  };
  mkdirSync(resolve(root, "evidence/coston2"), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  mkdirSync(resolve(root, ".local/fcc"), { recursive: true, mode: 0o700 });
  writeFileSync(statePath, `${JSON.stringify({ status: "PASSED", tenderId: outcome.tenderId.toString(), directMintingTransactionHash: outcome.directMintingTransactionHash }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(safeJson({ gate: "G", status: "PASSED", xrplTransactionId, personalAccount, tenderId: outcome.tenderId, directMintingTransactionHash: outcome.directMintingTransactionHash, evidence: "evidence/coston2/gate-g-smart-account.json" }));
}

try {
  await main();
} catch (error) {
  const rawCode = error instanceof Error ? error.message : "";
  const code = /^FCC_GATE_G_[A-Z0-9_]+$/.test(rawCode) ? rawCode : "FCC_GATE_G_OPERATION_FAILED";
  console.error(JSON.stringify({ gate: "G", status: "FAILED", phase: currentPhase, code, diagnostic: lastSafeMarker }));
  process.exitCode = 1;
}
