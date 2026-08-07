import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeDeployData,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compareMarketRuntime } from "../flare/market-runtime-verifier.mjs";

const root = resolve(import.meta.dirname, "../..");
const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
const rawKey = process.env.FLARE_DEPLOYMENT_PRIVATE_KEY?.trim();
if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
if (!rawKey) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_MISSING");
const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_INVALID");

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "") {
  throw new Error("MARKET_CANDIDATE_REQUIRES_CLEAN_WORKTREE");
}
const gate0 = JSON.parse(readFileSync(resolve(root, "evidence/coston2/gate-0-foundations.json"), "utf8"));
const gateA = JSON.parse(readFileSync(resolve(root, "evidence/coston2/gate-a-fcc-result.json"), "utf8"));
const gateB = JSON.parse(readFileSync(resolve(root, "evidence/coston2/gate-b-private-ingress.json"), "utf8"));
if (gate0.status !== "PASSED" || gateA.status !== "PASSED" || gateB.status !== "IN_PROGRESS") {
  throw new Error("MARKET_CANDIDATE_FOUNDATION_GATES_INVALID");
}
const liveIngressAssertions = [
  "threeProductionMachinesBound",
  "threeEncryptedSubmissionsAccepted",
  "threeDistinctReceiptSigners",
  "allReceiptsMatchCommitment",
  "allReceiptsBindDomain",
  "allReceiptsSignerChecked",
  "exactCiphertextRetryIdempotent",
  "sealedReplayRejected",
  "ciphertextNotRecorded",
  "plaintextNotRecorded",
];
if (!liveIngressAssertions.every((key) => gateB.assertions?.[key] === true)) {
  throw new Error("MARKET_CANDIDATE_LIVE_INGRESS_ASSERTIONS_INVALID");
}

const candidateManifestPath = resolve(root, "packages/flare-contracts/deployments/coston2.market-candidate.json");
const candidateEvidencePath = resolve(root, "evidence/coston2/market-candidate-deployment.json");
if (existsSync(candidateManifestPath) || existsSync(candidateEvidencePath)) {
  throw new Error("MARKET_CANDIDATE_ARTIFACT_ALREADY_EXISTS");
}
const official = gate0.publicIdentifiers?.contracts;
if (!official) throw new Error("MARKET_CANDIDATE_OFFICIAL_BINDINGS_MISSING");
const addresses = {
  paymentToken: getAddress(official.fTestXRP),
  teeManager: getAddress(official.flareTeeManager),
  ftso: getAddress(official.ftsoV2),
  teeExtensionRegistry: getAddress(official.flareTeeManager),
};
const artifact = JSON.parse(readFileSync(
  resolve(root, "packages/flare-contracts/out/VeilBidFlareMarket.sol/VeilBidFlareMarket.json"),
  "utf8",
));
const bytecode = artifact.bytecode?.object;
if (typeof bytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(bytecode)) throw new Error("MARKET_BYTECODE_MISSING");

const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }) });
const [chainId, balance, dependencyCodes] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getBalance({ address: account.address }),
  Promise.all(Object.values(addresses).map((address) => publicClient.getCode({ address }))),
]);
if (chainId !== 114) throw new Error("COSTON2_CHAIN_MISMATCH");
if (balance < 100_000_000_000_000_000n) throw new Error("INSUFFICIENT_C2FLR_FOR_MARKET_CANDIDATE");
if (dependencyCodes.some((code) => code === undefined || code === "0x")) throw new Error("FLARE_DEPENDENCY_CODE_MISSING");

const constructorArguments = [addresses.paymentToken, addresses.teeManager, addresses.ftso, addresses.teeExtensionRegistry];
const deploymentTransaction = await walletClient.deployContract({ account, abi: artifact.abi, bytecode, args: constructorArguments });
const receipt = await publicClient.waitForTransactionReceipt({ hash: deploymentTransaction, confirmations: 2 });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("MARKET_CANDIDATE_DEPLOYMENT_FAILED");
const market = getAddress(receipt.contractAddress);
const [runtime, transaction] = await Promise.all([
  publicClient.getCode({ address: market }),
  publicClient.getTransaction({ hash: deploymentTransaction }),
]);
if (!runtime || runtime === "0x") throw new Error("MARKET_CANDIDATE_RUNTIME_MISSING");
const decoded = decodeDeployData({ abi: artifact.abi, bytecode, data: transaction.input });
const decodedArguments = decoded.args ?? [];
const getterAbi = [
  { type: "function", name: "paymentToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "teeManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "ftso", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "teeExtensionRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "awardReceipt", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const [paymentToken, teeManager, ftso, teeExtensionRegistry, awardReceipt] = await Promise.all(
  getterAbi.map((entry) => publicClient.readContract({ address: market, abi: getterAbi, functionName: entry.name })),
);
const awardReceiptAddress = getAddress(awardReceipt);
const [awardCode, awardMarket] = await Promise.all([
  publicClient.getCode({ address: awardReceiptAddress }),
  publicClient.readContract({ address: awardReceiptAddress, abi: [
    { type: "function", name: "market", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  ], functionName: "market" }),
]);
const runtimeComparison = compareMarketRuntime(artifact, runtime);
const assertions = {
  chainIdMatches: chainId === 114,
  transactionSucceeded: receipt.status === "success",
  constructorTransactionDecoded: decodedArguments.length === 4,
  constructorArgumentsMatch: decodedArguments.every((value, index) => getAddress(value) === constructorArguments[index]),
  runtimeSizeMatches: runtimeComparison.sizeMatches,
  runtimeLogicMatchesArtifact: runtimeComparison.logicMatches,
  paymentTokenBindingMatches: getAddress(paymentToken) === addresses.paymentToken,
  teeManagerBindingMatches: getAddress(teeManager) === addresses.teeManager,
  ftsoBindingMatches: getAddress(ftso) === addresses.ftso,
  extensionRegistryBindingMatches: getAddress(teeExtensionRegistry) === addresses.teeExtensionRegistry,
  awardReceiptCodePresent: awardCode !== undefined && awardCode !== "0x",
  awardReceiptMarketBindingMatches: getAddress(awardMarket) === market,
};
if (!Object.values(assertions).every(Boolean)) throw new Error("MARKET_CANDIDATE_VERIFICATION_FAILED");

const recordedAt = new Date().toISOString();
const contracts = {
  VeilBidFlareMarket: {
    address: market,
    deploymentTransaction,
    deploymentBlock: receipt.blockNumber.toString(),
    runtimeHash: runtimeComparison.runtimeHash,
    maskedRuntimeHash: runtimeComparison.maskedRuntimeHash,
    artifactMaskedRuntimeHash: runtimeComparison.artifactMaskedRuntimeHash,
  },
  VeilBidFlareAwardReceipt: { address: awardReceiptAddress },
};
const manifest = {
  schemaVersion: 1,
  network: "flare-coston2",
  chainId: 114,
  kind: "market-candidate",
  verified: false,
  recordedAt,
  sourceCommit,
  deployer: account.address,
  contracts,
  constructorArguments: addresses,
  prerequisites: { gate0: gate0.network.blockNumber, gateA: gateA.network.blockNumber, gateB: gateB.network.blockNumber },
  blockers: ["MARKET_EXTENSION_NOT_REGISTERED", "PRODUCT_TEE_MACHINES_NOT_REGISTERED", "GATES_C_E_NOT_PASSED"],
};
const evidence = {
  schemaVersion: 1,
  gate: "MARKET_CANDIDATE_DEPLOYMENT",
  status: "IN_PROGRESS",
  recordedAt,
  sourceCommit,
  network: { name: "flare-coston2", chainId: 114, blockNumber: receipt.blockNumber.toString() },
  publicIdentifiers: contracts,
  assertions,
  blockers: manifest.blockers,
  notes: [
    "This is an immutable market candidate deployed to break the sender-registration cycle; it is not a verified release.",
    "The next step registers this market address as a fresh FCC extension sender and binds three product TEE machines.",
    "No bid payload, proxy credential, deployment key, or private material is recorded.",
  ],
};
for (const [path, value] of [[candidateManifestPath, manifest], [candidateEvidencePath, evidence]]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}
console.log(JSON.stringify({
  status: evidence.status,
  market,
  awardReceipt: awardReceiptAddress,
  deploymentTransaction,
  blockNumber: receipt.blockNumber.toString(),
  assertions,
  evidence: "evidence/coston2/market-candidate-deployment.json",
}, null, 2));
