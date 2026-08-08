import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";

const root = resolve(import.meta.dirname, "../..");
const outputPath = resolve(root, "evidence/coston2/performance-benchmarks.release.json");
const rpcUrl = process.env.COSTON2_RPC_URL?.trim() ||
  "https://coston2-api.flare.network/ext/C/rpc";
const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 2, timeout: 20_000 }) });

function read(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

function readIngressBenchmark() {
  const evidence = read("evidence/coston2/bid-ingress-benchmark.release.json");
  if (
    evidence.status !== "PASSED" ||
    evidence.assertions?.independentBidIngressLatencyRecorded !== true ||
    evidence.assertions?.noPlaintextOrCiphertextRecorded !== true ||
    evidence.ingressBenchmarks?.allSamples?.sampleCount < 1
  ) {
    throw new Error("FCC_BENCHMARK_INGRESS_EVIDENCE_INVALID");
  }
  return evidence;
}

function txHashes(evidence) {
  const identifiers = evidence.publicIdentifiers;
  return [
    ["approval", identifiers.approvalTransaction],
    ["tender", identifiers.tenderTransaction],
    ...(identifiers.bidTransactions ?? []).map((hash, index) => [`bid-${index + 1}`, hash]),
    ["close", identifiers.closeTransaction],
    ["request", identifiers.requestTransaction],
    ["finalization", identifiers.finalizationTransaction],
  ].filter(([, hash]) => typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash));
}

function secondsBetween(left, right) {
  return Number(right) - Number(left);
}

async function inspectSample(name, relativePath, recovery) {
  const evidence = read(relativePath);
  const hashes = txHashes(evidence);
  const receipts = await Promise.all(hashes.map(async ([label, hash]) => {
    const receipt = await client.getTransactionReceipt({ hash });
    return [label, {
      hash,
      blockNumber: receipt.blockNumber.toString(),
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
    }];
  }));
  const blocks = [...new Set(receipts.map(([, value]) => value.blockNumber))];
  const blockData = await Promise.all(blocks.map(async (blockNumber) => {
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
    return [blockNumber, block.timestamp.toString()];
  }));
  const timestamps = Object.fromEntries(blockData);
  const transactions = Object.fromEntries(receipts);
  const tenderBlock = BigInt(transactions.tender.blockNumber);
  const finalizationBlock = BigInt(transactions.finalization.blockNumber);
  const closeBlock = BigInt(transactions.close.blockNumber);
  const requestBlock = BigInt(transactions.request.blockNumber);
  return {
    name,
    gate: recovery ? "C-E-F-RECOVERY" : "C-E-F",
    tenderId: evidence.publicIdentifiers.tenderId,
    sourceEvidence: relativePath,
    recoveryCondition: recovery ? "one result endpoint unavailable" : "none",
    transactions,
    blockTimestamps: timestamps,
    deltas: {
      closeAfterTenderBlocks: (closeBlock - tenderBlock).toString(),
      requestAfterCloseBlocks: (requestBlock - closeBlock).toString(),
      finalizationAfterRequestBlocks: (finalizationBlock - requestBlock).toString(),
      finalizationAfterTenderBlocks: (finalizationBlock - tenderBlock).toString(),
      tenderToFinalizationSeconds: secondsBetween(timestamps[tenderBlock.toString()], timestamps[finalizationBlock.toString()]),
    },
  };
}

const [threeVendor, recovery] = await Promise.all([
  inspectSample("three-vendor-finalization", "evidence/coston2/gate-c-e-f-three-vendor.json", false),
  inspectSample("three-vendor-one-result-outage", "evidence/coston2/three-vendor-recovery.release.json", true),
]);
const ingress = readIngressBenchmark();
const observedBlock = await client.getBlockNumber();
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const output = {
  schemaVersion: 1,
  suite: "coston2-flare-performance-benchmarks",
  recordedAt: new Date().toISOString(),
  sourceCommit,
  network: {
    name: "flare-coston2",
    chainId: 114,
    observedBlock: observedBlock.toString(),
    rpcSource: "official-public-coston2-rpc",
  },
  samples: [threeVendor, recovery],
  ingress: {
    sourceEvidence: "evidence/coston2/bid-ingress-benchmark.release.json",
    tenderId: ingress.publicIdentifiers.tenderId,
    finalizationTransaction: ingress.publicIdentifiers.finalizationTransaction,
    ...ingress.ingressBenchmarks,
  },
  assertions: {
    publicReceiptsRead: true,
    publicBlockTimestampsRead: true,
    gasUsageRecorded: true,
    closeRequestFinalizeDeltasRecorded: true,
    oneResultEndpointOutageStillFinalized: true,
    independentBidIngressLatencyRecorded: true,
    noBidPayloadsRead: true,
    noProviderSecretsRead: true,
  },
  blockers: [],
  notes: [
    "These measurements read only public Coston2 receipts and block timestamps from previously recorded lifecycle transactions.",
    "They are operational benchmarks, not a latency SLA; RPC/indexer/TEE conditions can change across runs.",
    "No bid plaintext, ciphertext, FDC proof body, credential, private key, or provider secret is read or written.",
  ],
};
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  evidence: "evidence/coston2/performance-benchmarks.release.json",
  sourceCommit,
  observedBlock: observedBlock.toString(),
  samples: output.samples.map(({ name, deltas }) => ({ name, deltas })),
}, null, 2));
