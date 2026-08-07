import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { encodeFunctionData, http, createPublicClient } from "viem";

const root = resolve(import.meta.dirname, "../..");
const evidencePath = resolve(root, "evidence/coston2/live-negative-calls.release.json");
const rpcUrl = process.env.COSTON2_RPC_URL?.trim() || "https://coston2-api.flare.network/ext/C/rpc";
const release = JSON.parse(readFileSync(resolve(root, "packages/flare-contracts/deployments/coston2.release.json"), "utf8"));
const recovery = JSON.parse(readFileSync(resolve(root, "evidence/coston2/three-vendor-recovery.release.json"), "utf8"));
const abi = JSON.parse(readFileSync(resolve(root, "packages/flare-bindings/generated/abis/VeilBidFlareMarket.json"), "utf8"));
const market = release.contracts.VeilBidFlareMarket.address;
const tenderId = BigInt(recovery.publicIdentifiers.tenderId);
const client = createPublicClient({
  chain: {
    id: 114,
    name: "Coston2",
    nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  },
  transport: http(rpcUrl, { retryCount: 2, timeout: 20_000 }),
});

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function zeroBytes32() {
  return `0x${"00".repeat(32)}`;
}

function zeroAddress() {
  return `0x${"00".repeat(20)}`;
}

function zeroBytes21() {
  return `0x${"00".repeat(21)}`;
}

function zeroResult() {
  return [
    0,
    0n,
    zeroAddress(),
    0n,
    zeroBytes32(),
    0n,
    zeroBytes32(),
    zeroBytes32(),
    0,
    zeroBytes21(),
    0n,
    0,
    0n,
    0n,
    0n,
    zeroAddress(),
    0n,
    0n,
    0n,
  ];
}

const zeroReceipt = [0, zeroAddress(), 0n, zeroBytes32(), zeroAddress(), 0n];
const zeroTerms = [
  zeroBytes32(),
  [0, 0n, 0n, false, false, "0x000000000000000000000000000000000000000000", 0, 0, 0, 0, 0, 0, []],
  [],
  0n,
  zeroBytes32(),
  [zeroAddress(), zeroAddress(), zeroAddress()],
  [zeroBytes32(), zeroBytes32(), zeroBytes32()],
];

async function readTender() {
  const tender = await client.readContract({ address: market, abi, functionName: "getTender", args: [tenderId] });
  const status = tender?.status ?? tender?.[21];
  if (status === undefined) throw new Error("LIVE_NEGATIVE_TENDER_STATE_UNREADABLE");
  return { status: Number(status) };
}

async function expectRevert(name, functionName, args, value) {
  const data = encodeFunctionData({ abi, functionName, args });
  try {
    await client.call({ to: market, data, ...(value === undefined ? {} : { value }) });
    return { name, functionName, reverted: false };
  } catch {
    return { name, functionName, reverted: true };
  }
}

const tender = await readTender();
if (tender.status !== 4) throw new Error("LIVE_NEGATIVE_TENDER_NOT_FINALIZED");
const [close, request, receipts, finalize, create] = await Promise.all([
  expectRevert("close-finalized-tender", "closeTender", [tenderId]),
  expectRevert("request-selection-finalized-tender", "requestSelection", [tenderId], 1_000_000n),
  expectRevert("submit-empty-receipts-finalized-tender", "submitBidReceipts", [tenderId, [zeroReceipt, zeroReceipt, zeroReceipt], ["0x", "0x", "0x"]]),
  expectRevert("finalize-zero-result-finalized-tender", "finalizeTender", [tenderId, zeroResult(), []]),
  expectRevert("create-zero-terms", "createTender", [zeroTerms]),
]);
const cases = [close, request, receipts, finalize, create];
const assertions = Object.fromEntries(cases.map(({ name, reverted }) => [`${name}Reverted`, reverted]));
const latestBlock = await client.getBlockNumber();
const evidence = {
  schemaVersion: 1,
  suite: "coston2-live-negative-eth-calls",
  status: cases.every(({ reverted }) => reverted) ? "PARTIAL" : "IN_PROGRESS",
  recordedAt: new Date().toISOString(),
  sourceCommit: git("rev-parse", "HEAD"),
  network: {
    name: "flare-coston2",
    chainId: 114,
    observedBlock: latestBlock.toString(),
    rpcSource: "official-public-coston2-rpc",
  },
  publicIdentifiers: {
    market,
    finalizedTenderId: tenderId.toString(),
    sourceRecoveryEvidence: "evidence/coston2/three-vendor-recovery.release.json",
  },
  cases,
  assertions: {
    liveFinalizedTenderRead: true,
    allReadOnlyCallsReverted: cases.every(({ reverted }) => reverted),
    noWriteTransactionsSubmitted: true,
    noConfidentialPayloadRead: true,
    ...assertions,
  },
  blockers: [
    "LIVE_INVALID_CREDENTIAL_AND_STALE_FTSO_STATE_NOT_CREATED",
    "LIVE_PROXY_RESTART_AND_TWO_MACHINE_LOSS_NOT_RUN",
    "SAME_IDENTITY_TEE_RESTART_NOT_SUPPORTED_BY_CURRENT_SIMULATED_RUNTIME",
  ],
  notes: [
    "Every case is an eth_call against the verified Coston2 market; no signer, gas, or state mutation was used.",
    "Terminal tender guards and zero-term validation are live negative observations, not a replacement for stateful fault injection.",
    "No bid plaintext, ciphertext, proof body, raw signature, credential, private key, or provider secret is read or written.",
  ],
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  evidence: "evidence/coston2/live-negative-calls.release.json",
  status: evidence.status,
  observedBlock: latestBlock.toString(),
  allReadOnlyCallsReverted: evidence.assertions.allReadOnlyCallsReverted,
  blockers: evidence.blockers,
}, null, 2));
if (!evidence.assertions.allReadOnlyCallsReverted) process.exitCode = 1;
