import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  isAddressEqual,
  keccak256,
  parseAbi,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  decodeBidReceipt,
  encryptPrivateBidForTee,
  encodePrivateBidSubmission,
  prepareBidReceiptSet,
  privateBidCommitment,
  recoverBidReceiptSigner,
  teeIdentityFromPublicKey,
  verifySelectionActionResponse,
  veilBidDirectOpType,
  veilBidDirectSubmitCommand,
} from "../../packages/flare-bindings/dist/index.js";
import { calculateFlareRulesHash } from "../../packages/flare-bindings/dist/smart-account.js";

const root = resolve(import.meta.dirname, "../..");
const execute = process.argv.includes("--execute");
const evidencePath = resolve(root, "evidence/coston2/gate-c-e-f-live-lifecycle.json");
const statePath = resolve(root, ".local/fcc/market-lifecycle.state.json");
const managerAbi = parseAbi([
  "function getTeeMachineStatus(address teeId) view returns (uint8)",
  "function getExtensionId(address teeId) view returns (uint256)",
  "function getTeeMachineWithAttestationData(address teeId) view returns ((address teeId,address initialTeeId,string url,bytes32 codeHash,bytes32 platform))",
  "function getPublicKey(address teeId) view returns ((bytes32 x,bytes32 y))",
]);
const erc20Abi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);
const ftsoAbi = parseAbi([
  "function getFeedById(bytes21 feedId) view returns (uint256 value,int8 decimals,uint64 timestamp)",
]);
const awardReceiptAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
]);
const marketAbi = JSON.parse(readFileSync(
  resolve(root, "packages/flare-bindings/generated/abis/VeilBidFlareMarket.json"),
  "utf8",
));
const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
};
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const zeroHash = `0x${"00".repeat(32)}`;
const zeroAddress = "0x0000000000000000000000000000000000000000";
const xrpUsdFeedId = "0x015852502f55534400000000000000000000000000";
let currentPhase = "startup";

function required(value, code) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(code);
  return value.trim();
}

function normalizedPrivateKey(value, code) {
  const normalized = value?.startsWith("0x") ? value : value ? `0x${value}` : "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) throw new Error(code);
  return normalized;
}

function publicUrls() {
  const urls = required(process.env.FLARE_FCC_PROXY_URLS, "FCC_MARKET_PROXY_URLS_MISSING")
    .split(",").map((value) => value.trim().replace(/\/+$/, ""));
  if (urls.length !== 3 || new Set(urls).size !== 3 || urls.some((url) => !/^https:\/\/[^/?#]+$/.test(url))) {
    throw new Error("FCC_MARKET_PROXY_URLS_INVALID");
  }
  return urls;
}

function apiKeys() {
  const keys = [1, 2, 3].map((index) => process.env[`FCC_DIRECT_API_KEY_${index}`]);
  if (keys.some((value) => typeof value !== "string" || value.length < 32)) {
    throw new Error("FCC_MARKET_DIRECT_API_KEYS_MISSING");
  }
  return keys;
}

function field(value, name, index) {
  const result = value?.[name] ?? value?.[index];
  if (result === undefined) throw new Error(`FCC_MARKET_TUPLE_${name}_MISSING`);
  return result;
}

function safeJson(value) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

function equalHex(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function publicMachineInfo(value, expectedExtension, expectedCodeHash) {
  const machine = value?.machineData;
  const publicKey = machine?.publicKey;
  if (!machine || !publicKey || typeof publicKey.x !== "string" || typeof publicKey.y !== "string") {
    throw new Error("FCC_MARKET_MACHINE_INFO_INVALID");
  }
  const teeId = teeIdentityFromPublicKey({ x: publicKey.x, y: publicKey.y });
  if (
    String(machine.extensionId).toLowerCase() !== expectedExtension.toLowerCase()
    || String(machine.codeHash).toLowerCase() !== expectedCodeHash.toLowerCase()
  ) throw new Error("FCC_MARKET_MACHINE_INFO_BINDING_MISMATCH");
  return { teeId, publicKey: { x: publicKey.x, y: publicKey.y } };
}

async function readMachineInfo(url, expectedExtension, expectedCodeHash) {
  const response = await fetch(`${url}/info`, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("FCC_MARKET_MACHINE_INFO_UNREACHABLE");
  return publicMachineInfo(await response.json(), expectedExtension, expectedCodeHash);
}

async function readActionResult(url, actionId, submissionTag, attempts = 72) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const resultUrl = new URL(`${url}/action/result/${actionId}`);
    resultUrl.searchParams.set("submissionTag", submissionTag);
    const response = await fetch(resultUrl, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    lastStatus = response.status;
    if (response.ok) return response.json();
    if (response.status !== 404 && response.status !== 202) throw new Error("FCC_MARKET_ACTION_RESULT_HTTP");
    await sleep(5_000);
  }
  throw new Error(`FCC_MARKET_ACTION_RESULT_TIMEOUT_${lastStatus}`);
}

async function sendDirect(url, apiKey, ciphertext) {
  const response = await fetch(`${url}/direct`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, accept: "application/json" },
    body: JSON.stringify({ opType: veilBidDirectOpType, opCommand: veilBidDirectSubmitCommand, message: ciphertext }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("FCC_MARKET_DIRECT_HTTP");
  const body = await response.json();
  const actionId = body?.data?.id;
  if (typeof actionId !== "string" || !/^0x[0-9a-f]{64}$/i.test(actionId)) {
    throw new Error("FCC_MARKET_DIRECT_ACTION_INVALID");
  }
  return actionId.toLowerCase();
}

async function readTeeSet({ client, manager, urls, extensionId, codeHash }) {
  const endpointMachines = await Promise.all(urls.map((url) => readMachineInfo(url, `0x${extensionId.toString(16).padStart(64, "0")}`, codeHash)));
  if (new Set(endpointMachines.map(({ teeId }) => teeId.toLowerCase())).size !== 3) {
    throw new Error("FCC_MARKET_TEE_IDENTITIES_NOT_DISTINCT");
  }
  const machines = [];
  for (let index = 0; index < endpointMachines.length; index += 1) {
    const { teeId, publicKey } = endpointMachines[index];
    const [status, registeredExtensionId, record, onchainPublicKey] = await Promise.all([
      client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [teeId] }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getExtensionId", args: [teeId] }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineWithAttestationData", args: [teeId] }),
      client.readContract({ address: manager, abi: managerAbi, functionName: "getPublicKey", args: [teeId] }),
    ]);
    const recordTeeId = getAddress(field(record, "teeId", 0));
    const recordUrl = field(record, "url", 2).replace(/\/+$/, "");
    const onchainX = field(onchainPublicKey, "x", 0).toLowerCase();
    const onchainY = field(onchainPublicKey, "y", 1).toLowerCase();
    if (
      Number(status) !== 2 || registeredExtensionId !== extensionId || recordTeeId !== getAddress(teeId)
      || recordUrl !== urls[index] || !equalHex(field(record, "codeHash", 3), codeHash)
      || onchainX !== publicKey.x.toLowerCase() || onchainY !== publicKey.y.toLowerCase()
    ) throw new Error(`FCC_MARKET_MACHINE_${index + 1}_BINDING_INVALID`);
    const fingerprint = keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [onchainPublicKey.x, onchainPublicKey.y],
    ));
    machines.push({ machine: index + 1, teeId: getAddress(teeId), publicKey, fingerprint });
  }
  return machines;
}

async function writeContract({ client, wallet, account, address, abi, functionName, args, value, gas }) {
  const simulation = await client.simulateContract({
    account, address, abi, functionName, args,
    ...(value === undefined ? {} : { value }),
    ...(gas === undefined ? {} : { gas }),
  });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== "success") throw new Error(`FCC_MARKET_${functionName.toUpperCase()}_FAILED`);
  return { hash, receipt };
}

async function writeEncodedTransaction({ client, wallet, account, to, data, gas, code, preflight = true }) {
  if (preflight) await client.call({ account, to, data, gas });
  const hash = await wallet.sendTransaction({ account, to, data, gas });
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== "success") throw new Error(code);
  return { hash, receipt };
}

async function verifyBidReceipt(value, context, expectedTeeId) {
  const response = value;
  const result = response?.result;
  if (
    !result || result.id.toLowerCase() !== context.actionId.toLowerCase() || result.submissionTag !== "submit"
    || result.status !== 1 || result.opType !== veilBidDirectOpType || result.opCommand !== veilBidDirectSubmitCommand
  ) throw new Error("FCC_MARKET_BID_ACTION_INVALID");
  const receipt = decodeBidReceipt(result.data);
  const signer = await recoverBidReceiptSigner(receipt);
  if (
    !isAddressEqual(receipt.teeId, expectedTeeId) || !isAddressEqual(signer, expectedTeeId)
    || receipt.chainId !== context.chainId || !isAddressEqual(receipt.market, context.market)
    || receipt.extensionId !== context.extensionId || !equalHex(receipt.codeVersion, context.codeVersion)
    || receipt.tenderId !== context.tenderId || !isAddressEqual(receipt.vendor, context.vendor)
    || receipt.submissionNonce !== context.submissionNonce || !equalHex(receipt.rulesHash, context.rulesHash)
    || !equalHex(receipt.plaintextCommitment, context.commitment) || receipt.expiry !== context.receiptExpiry
  ) throw new Error("FCC_MARKET_BID_RECEIPT_BINDING_INVALID");
  return receipt;
}

function assertSelectionResult(result, context, vendor) {
  if (
    result.schemaVersion !== 1 || result.chainId !== 114n || !isAddressEqual(result.market, context.market)
    || result.extensionId !== context.extensionId || !equalHex(result.codeVersion, context.codeVersion)
    || result.tenderId !== context.tenderId || !equalHex(result.rulesHash, context.rulesHash)
    || !equalHex(result.orderedBidRoot, context.orderedBidRoot) || result.quorumBitmap !== context.quorumBitmap
    || !equalHex(result.ftsoFeedId, context.ftsoFeedId) || result.ftsoValue !== context.ftsoValue
    || result.ftsoDecimals !== context.ftsoDecimals || result.ftsoTimestamp !== context.ftsoTimestamp
    || result.closeBlock !== context.closeBlock || result.resultNonce !== context.resultNonce
    || result.expiry !== context.resultExpiry || result.winnerBidId !== 1n
    || !isAddressEqual(result.winner, vendor) || result.winningAmountXrp <= 0n
  ) throw new Error("FCC_MARKET_SELECTION_BINDING_INVALID");
}

async function collectSelection({ urls, requestId, context, expectedVersion, vendor }) {
  const values = await Promise.all(urls.map(async (url) => {
    try {
      const value = await readActionResult(url, requestId, "threshold");
      const verified = await verifySelectionActionResponse(value, {
        actionId: requestId,
        chainId: 114n,
        allowedTeeIds: context.teeIds,
        expectedVersion,
      });
      assertSelectionResult(verified.result, context, vendor);
      return {
        response: verified.response,
        result: verified.result,
        teeId: verified.teeId,
        dataHash: keccak256(verified.response.result.data),
      };
    } catch {
      return null;
    }
  }));
  const valid = values.filter((value) => value !== null);
  const groups = new Map();
  for (const value of valid) {
    const group = groups.get(value.dataHash) ?? [];
    if (!group.some((candidate) => isAddressEqual(candidate.teeId, value.teeId))) group.push(value);
    groups.set(value.dataHash, group);
  }
  const matching = [...groups.values()].filter((group) => group.length >= 2).sort((a, b) => b.length - a.length)[0];
  if (!matching) throw new Error(`FCC_MARKET_SELECTION_QUORUM_PENDING_${valid.length}`);
  return {
    result: matching[0].result,
    proofs: matching.slice(0, 2).map(({ response }) => ({
      actionId: response.result.id,
      submissionTagHash: keccak256(stringToHex(response.result.submissionTag)),
      status: response.result.status,
      signature: response.signature,
    })),
    signers: matching.slice(0, 2).map(({ teeId }) => teeId),
    resultDataHash: matching[0].dataHash,
  };
}

async function main() {
  const rpcUrl = required(process.env.COSTON2_RPC_URL, "FCC_MARKET_RPC_MISSING");
  if (!/^https:\/\//.test(rpcUrl)) throw new Error("FCC_MARKET_RPC_INVALID");
  const deploymentKey = normalizedPrivateKey(process.env.FLARE_DEPLOYMENT_PRIVATE_KEY, "FCC_MARKET_DEPLOYMENT_KEY_INVALID");
  const account = privateKeyToAccount(deploymentKey);
  const foundations = JSON.parse(readFileSync(resolve(root, "tooling/flare/coston2-foundations.json"), "utf8"));
  const registration = JSON.parse(readFileSync(resolve(root, "evidence/coston2/fcc-market-extension-registration.json"), "utf8"));
  const machinesEvidence = JSON.parse(readFileSync(resolve(root, "evidence/coston2/fcc-market-machines.json"), "utf8"));
  const codeVersionEvidence = JSON.parse(readFileSync(resolve(root, "evidence/coston2/fcc-code-version.json"), "utf8"));
  const candidate = JSON.parse(readFileSync(resolve(root, "packages/flare-contracts/deployments/coston2.market-candidate.json"), "utf8"));
  const market = getAddress(candidate.contracts.VeilBidFlareMarket.address);
  const manager = getAddress(registration.publicIdentifiers.manager);
  const token = getAddress(foundations.contracts.fTestXRP);
  const ftso = getAddress(foundations.contracts.ftsoV2);
  const awardReceipt = getAddress(candidate.contracts.VeilBidFlareAwardReceipt?.address ?? candidate.contracts.VeilBidFlareAwardReceipt ?? "0x0000000000000000000000000000000000000000");
  const extensionId = BigInt(registration.publicIdentifiers.extensionId);
  const codeHash = codeVersionEvidence.publicIdentifiers.codeHash;
  const version = codeVersionEvidence.publicIdentifiers.version;
  const urls = publicUrls();
  const keys = apiKeys();
  const machineIds = machinesEvidence.publicIdentifiers.machines.map(({ teeId }) => getAddress(teeId));
  if (machineIds.length !== 3 || new Set(machineIds.map((id) => id.toLowerCase())).size !== 3) throw new Error("FCC_MARKET_MACHINE_EVIDENCE_INVALID");
  if (existsSync(evidencePath)) throw new Error("FCC_MARKET_LIFECYCLE_EVIDENCE_EXISTS");
  if (existsSync(statePath)) throw new Error("FCC_MARKET_LIFECYCLE_STATE_EXISTS");
  if (!execute) {
    const client = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
    const machines = await readTeeSet({ client, manager, urls, extensionId, codeHash });
    const latest = await client.getBlock({ blockTag: "latest" });
    const feed = await client.readContract({ address: ftso, abi: ftsoAbi, functionName: "getFeedById", args: [xrpUsdFeedId] });
    if (field(feed, "value", 0) <= 0n || field(feed, "timestamp", 2) > latest.timestamp || latest.timestamp - field(feed, "timestamp", 2) > 300n) {
      throw new Error("FCC_MARKET_FTSO_PREFLIGHT_INVALID");
    }
    const balance = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    console.log(safeJson({
      status: "READY",
      scope: "preflight only; no tender or bid submitted",
      market,
      manager,
      token,
      ftso,
      extensionId: extensionId.toString(),
      buyer: account.address,
      ftestXrpBalanceRaw: balance,
      machines: machines.map(({ machine, teeId, fingerprint }) => ({ machine, teeId, fingerprint })),
    }));
    return;
  }
  if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
    throw new Error("FCC_MARKET_LIFECYCLE_REQUIRES_CLEAN_WORKTREE");
  }

  const client = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
  const buyerWallet = createWalletClient({ account, chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
  currentPhase = "machine-preflight";
  const machines = await readTeeSet({ client, manager, urls, extensionId, codeHash });
  const block = await client.getBlock({ blockTag: "latest" });
  const now = block.timestamp;
  const feed = await client.readContract({ address: ftso, abi: ftsoAbi, functionName: "getFeedById", args: [xrpUsdFeedId] });
  if (field(feed, "value", 0) <= 0n || field(feed, "timestamp", 2) > now || now - field(feed, "timestamp", 2) > 300n) {
    throw new Error("FCC_MARKET_FTSO_PREFLIGHT_INVALID");
  }
  const bidDeadline = now + 1_800n;
  const ceiling = 1_000_000n;
  const rules = {
    schemaVersion: 1,
    ceilingXrpMicros: ceiling,
    bidDeadline,
    allowXrp: true,
    allowUsd: true,
    ftsoFeedId: xrpUsdFeedId,
    maxDeliveryDays: 30,
    minWarrantyDays: 12,
    maxWarrantyDays: 36,
    priceWeightBps: 6_000,
    deliveryWeightBps: 2_500,
    warrantyWeightBps: 1_500,
    requiredCredentials: [],
  };
  const rulesHash = calculateFlareRulesHash(rules);
  const vendorKey = generatePrivateKey();
  const vendorAccount = privateKeyToAccount(vendorKey);
  const submissionNonce = BigInt(Date.now()) * 1_000n + BigInt(randomBytes(2).readUInt16BE(0));
  const receiptExpiry = bidDeadline - 60n;
  const bid = {
    schemaVersion: 1,
    chainId: 114n,
    market,
    extensionId,
    codeVersion: codeHash,
    tenderId: 0n,
    vendor: getAddress(vendorAccount.address),
    submissionNonce,
    rules,
    receiptExpiry,
    quoteCurrency: 1,
    priceMicros: 1_000_000n,
    deliveryDays: 5,
    warrantyDays: 24,
    credentials: [],
    salt: `0x${randomBytes(32).toString("hex")}`,
  };
  const buyerTokenBefore = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  const vendorTokenBefore = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [vendorAccount.address] });
  currentPhase = "approve-escrow";
  const approval = await writeContract({ client, wallet: buyerWallet, account, address: token, abi: erc20Abi, functionName: "approve", args: [market, ceiling] });
  const tenderCountBefore = await client.readContract({ address: market, abi: marketAbi, functionName: "tenderCount" });
  const terms = {
    metadataHash: keccak256(stringToHex(`VEILBID_C2_LIVE_TENDER_${Date.now()}`)),
    scoringPolicy: rules,
    approvedVendors: [vendorAccount.address],
    extensionId,
    codeVersion: codeHash,
    teeIds: machines.map(({ teeId }) => teeId),
    teeKeyFingerprints: machines.map(({ fingerprint }) => fingerprint),
  };
  currentPhase = "create-tender";
  const create = await writeContract({ client, wallet: buyerWallet, account, address: market, abi: marketAbi, functionName: "createTender", args: [terms] });
  const tenderCountAfter = await client.readContract({ address: market, abi: marketAbi, functionName: "tenderCount" });
  if (tenderCountAfter !== tenderCountBefore + 1n) throw new Error("FCC_MARKET_TENDER_ID_INVALID");
  const tenderId = tenderCountAfter;
  bid.tenderId = tenderId;
  currentPhase = "vendor-funding";
  const vendorFunding = await buyerWallet.sendTransaction({ account, to: vendorAccount.address, value: 50_000_000_000_000_000n });
  const vendorFundingReceipt = await client.waitForTransactionReceipt({ hash: vendorFunding, confirmations: 1 });
  if (vendorFundingReceipt.status !== "success") throw new Error("FCC_MARKET_VENDOR_FUNDING_FAILED");

  const plaintext = encodePrivateBidSubmission(bid);
  const commitment = privateBidCommitment(bid);
  currentPhase = "encrypted-bids";
  const ciphertexts = await Promise.all(machines.map(({ publicKey }) => encryptPrivateBidForTee(
    Uint8Array.from(Buffer.from(plaintext.slice(2), "hex")), publicKey,
  )));
  const receipts = [];
  const actionIds = [];
  for (let index = 0; index < machines.length; index += 1) {
    const actionId = await sendDirect(urls[index], keys[index], ciphertexts[index]);
    const actionValue = await readActionResult(urls[index], actionId, "submit");
    const receipt = await verifyBidReceipt(actionValue, {
      actionId,
      chainId: 114n,
      market,
      extensionId,
      codeVersion: codeHash,
      tenderId,
      vendor: vendorAccount.address,
      submissionNonce,
      rulesHash,
      commitment,
      receiptExpiry,
    }, machines[index].teeId);
    actionIds.push(actionId);
    receipts.push(receipt);
  }
  const prepared = await prepareBidReceiptSet(receipts, {
    market,
    extensionId,
    codeVersion: codeHash,
    tenderId,
    rulesHash,
    vendor: vendorAccount.address,
    submissionNonce,
    plaintextCommitment: commitment,
    bidDeadline,
    teeIds: machines.map(({ teeId }) => teeId),
  });
  const vendorWallet = createWalletClient({ account: vendorAccount, chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
  currentPhase = "submit-bid-receipts";
  const bidData = encodeFunctionData({
    abi: marketAbi,
    functionName: "submitBidReceipts",
    args: [tenderId, prepared.receipts, prepared.signatures],
  });
  const bidTx = await writeEncodedTransaction({
    client, wallet: vendorWallet, account: vendorAccount, to: market, data: bidData,
    gas: 1_000_000n, code: "FCC_MARKET_SUBMIT_BID_RECEIPTS_FAILED", preflight: false,
  });
  const tenderAfterBid = await client.readContract({ address: market, abi: marketAbi, functionName: "getTender", args: [tenderId] });
  if (field(tenderAfterBid, "bidCount", 6) !== 1n || field(tenderAfterBid, "commonQuorumBitmap", 8) !== 7) throw new Error("FCC_MARKET_BID_QUORUM_INVALID");
  currentPhase = "close-tender";
  const close = await writeContract({ client, wallet: buyerWallet, account, address: market, abi: marketAbi, functionName: "closeTender", args: [tenderId] });
  const closed = await client.readContract({ address: market, abi: marketAbi, functionName: "getTender", args: [tenderId] });
  if (Number(field(closed, "status", 21)) !== 2) throw new Error("FCC_MARKET_CLOSE_STATUS_INVALID");
  if (field(closed, "ftsoValue", 13) === 0n || field(closed, "ftsoTimestamp", 15) === 0n) throw new Error("FCC_MARKET_FTSO_SNAPSHOT_INVALID");
  const instructionFee = BigInt(process.env.FLARE_FCC_INSTRUCTION_FEE_WEI ?? "1000000");
  if (instructionFee <= 0n) throw new Error("FCC_MARKET_INSTRUCTION_FEE_INVALID");
  currentPhase = "request-selection";
  const request = await writeContract({ client, wallet: buyerWallet, account, address: market, abi: marketAbi, functionName: "requestSelection", args: [tenderId], value: instructionFee });
  const pending = await client.readContract({ address: market, abi: marketAbi, functionName: "getTender", args: [tenderId] });
  if (Number(field(pending, "status", 21)) !== 3 || field(pending, "requestId", 20) === zeroHash) throw new Error("FCC_MARKET_COMPUTE_REQUEST_INVALID");
  const requestId = field(pending, "requestId", 20);
  const context = {
    market,
    tenderId,
    extensionId,
    codeVersion: codeHash,
    rulesHash: field(pending, "rulesHash", 2),
    orderedBidRoot: field(pending, "orderedBidRoot", 9),
    quorumBitmap: Number(field(pending, "commonQuorumBitmap", 8)),
    ftsoFeedId: field(pending, "ftsoFeedId", 12),
    ftsoValue: field(pending, "ftsoValue", 13),
    ftsoDecimals: Number(field(pending, "ftsoDecimals", 14)),
    ftsoTimestamp: field(pending, "ftsoTimestamp", 15),
    closeBlock: field(pending, "closeBlock", 5),
    resultNonce: field(pending, "resultNonce", 18),
    resultExpiry: field(pending, "resultExpiry", 19),
    requestId,
    teeIds: machines.map(({ teeId }) => teeId),
  };
  currentPhase = "collect-selection-quorum";
  const quorum = await collectSelection({ urls, requestId, context, expectedVersion: version, vendor: vendorAccount.address });
  currentPhase = "finalize-tender";
  const finalization = await writeContract({ client, wallet: buyerWallet, account, address: market, abi: marketAbi, functionName: "finalizeTender", args: [tenderId, quorum.result, quorum.proofs] });
  const finalized = await client.readContract({ address: market, abi: marketAbi, functionName: "getTender", args: [tenderId] });
  if (Number(field(finalized, "status", 21)) !== 4) throw new Error("FCC_MARKET_FINAL_STATUS_INVALID");
  const buyerTokenAfter = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  const vendorTokenAfter = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [vendorAccount.address] });
  const marketTokenAfter = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [market] });
  const winner = getAddress(quorum.result.winner);
  const winningAmount = quorum.result.winningAmountXrp;
  currentPhase = "settlement-checks";
  const buyerDelta = buyerTokenBefore - buyerTokenAfter;
  const vendorDelta = vendorTokenAfter - vendorTokenBefore;
  if (winner !== getAddress(vendorAccount.address) || buyerDelta !== winningAmount || vendorDelta !== winningAmount || marketTokenAfter !== 0n) {
    throw new Error("FCC_MARKET_SETTLEMENT_CONSERVATION_INVALID");
  }
  let awardOwner = null;
  if (awardReceipt !== zeroAddress) {
    awardOwner = getAddress(await client.readContract({ address: awardReceipt, abi: awardReceiptAbi, functionName: "ownerOf", args: [tenderId] }));
  }
  const latestBlock = await client.getBlockNumber();
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const evidence = {
    schemaVersion: 1,
    gate: "C-E-F",
    status: "PASSED",
    recordedAt: new Date().toISOString(),
    sourceCommit,
    network: { name: "flare-coston2", chainId: 114, blockNumber: latestBlock.toString() },
    publicIdentifiers: {
      manager,
      market,
      awardReceipt,
      paymentToken: token,
      ftso,
      extensionId: extensionId.toString(),
      codeHash,
      version,
      buyer: account.address,
      vendor: vendorAccount.address,
      teeIds: machines.map(({ teeId }) => teeId),
      teeKeyFingerprints: machines.map(({ fingerprint }) => fingerprint),
      tenderId: tenderId.toString(),
      rulesHash: context.rulesHash,
      orderedBidRoot: context.orderedBidRoot,
      plaintextCommitment: commitment,
      bidReceiptActionIds: actionIds,
      requestId,
      selectionSignerIds: quorum.signers,
      selectionResultDataHash: quorum.resultDataHash,
      winnerBidId: quorum.result.winnerBidId.toString(),
      winner,
      winningAmountXrp: winningAmount.toString(),
      ftsoFeedId: context.ftsoFeedId,
      ftsoValue: context.ftsoValue.toString(),
      ftsoDecimals: context.ftsoDecimals,
      ftsoTimestamp: context.ftsoTimestamp.toString(),
      closeBlock: context.closeBlock.toString(),
      awardReceiptOwner: awardOwner,
      approvalTransaction: approval.hash,
      tenderTransaction: create.hash,
      vendorFundingTransaction: vendorFunding,
      bidTransaction: bidTx.hash,
      closeTransaction: close.hash,
      requestTransaction: request.hash,
      finalizationTransaction: finalization.hash,
    },
    assertions: {
      marketSenderBoundToExtension: true,
      threeProductionMachinesFrozen: true,
      threeEncryptedBidsAcceptedByDistinctTees: receipts.length === 3,
      allBidReceiptsBindCommitment: receipts.every((receipt) => equalHex(receipt.plaintextCommitment, commitment)),
      commonBidQuorumIsThree: context.quorumBitmap === 7,
      ftsSnapshotCapturedOnClose: context.ftsoValue > 0n && context.ftsoTimestamp > 0n,
      selectionResultSignedByTwoDistinctFrozenTees: quorum.signers.length === 2,
      selectionResultMatchesCommonRoot: equalHex(quorum.result.orderedBidRoot, context.orderedBidRoot),
      ftestXrpWinnerPayoutConserved: buyerDelta === winningAmount && vendorDelta === winningAmount && marketTokenAfter === 0n,
      awardReceiptMintedToWinner: awardOwner === winner,
      finalTenderAwarded: Number(field(finalized, "status", 21)) === 4,
      noPlaintextOrCiphertextRecorded: true,
    },
    blockers: [],
    notes: [
      "This is a live Coston2 simulated-TEE lifecycle: FTestXRP escrow, encrypted private bid ingress, FTSO XRP/USD snapshot, FCC private scoring, 2-of-3 result quorum, and award settlement.",
      "Only public commitments, result fields, machine IDs, and transaction identifiers are recorded; bid plaintext, ciphertext, raw signatures, salts, and credentials are not recorded.",
      "The vendor key was generated in process memory for this test and is not persisted or included in evidence.",
    ],
  };
  mkdirSync(resolve(root, "evidence/coston2"), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  writeFileSync(statePath, `${JSON.stringify({ status: "PASSED", tenderId: tenderId.toString(), finalizationTransaction: finalization.hash }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(safeJson({ gate: evidence.gate, status: evidence.status, tenderId, requestId, winner, winningAmountXrp: winningAmount, finalizationTransaction: finalization.hash, evidence: "evidence/coston2/gate-c-e-f-live-lifecycle.json" }));
}

try {
  await main();
} catch (error) {
  const rawCode = error instanceof Error ? error.message : "";
  const code = /^FCC_MARKET_[A-Z0-9_]+$/.test(rawCode) ? rawCode : "FCC_MARKET_LIFECYCLE_FAILED";
  console.error(JSON.stringify({ gate: "C-E-F", status: "FAILED", phase: currentPhase, code }));
  process.exitCode = 1;
}
