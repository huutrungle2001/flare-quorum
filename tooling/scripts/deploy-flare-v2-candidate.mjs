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

import { resolveRegistryBindings } from "../flare/foundations.mjs";
import { compareMarketRuntime } from "../flare/market-runtime-verifier.mjs";
import { inspectV2LocalReadiness } from "../flare/v2-release.mjs";

const root = resolve(import.meta.dirname, "../..");
const execute = process.argv.includes("--execute");
const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
const rawKey = process.env.FLARE_DEPLOYMENT_PRIVATE_KEY?.trim();
if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
if (!rawKey) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_MISSING");
const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
if (!/^0x[0-9a-f]{64}$/i.test(privateKey)) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_INVALID");

const readiness = inspectV2LocalReadiness(root);
if (readiness.status !== "PASSED") throw new Error("FLARE_V2_LOCAL_READINESS_FAILED");
const { plan } = readiness;
const manifestPath = resolve(root, plan.artifacts.candidateManifest);
const evidencePath = resolve(root, plan.artifacts.candidateDeploymentEvidence);
if (existsSync(manifestPath) || existsSync(evidencePath)) {
  throw new Error("FLARE_V2_CANDIDATE_ARTIFACT_ALREADY_EXISTS");
}

const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const gate0 = read("evidence/coston2/gate-0-foundations.json");
const v1Release = read("packages/flare-contracts/deployments/coston2.v1.release.json");
const artifact = read(plan.contracts.market.artifact);
if (gate0.status !== "PASSED" || !Object.values(gate0.assertions ?? {}).every(Boolean)) {
  throw new Error("FLARE_V2_FOUNDATIONS_NOT_PASSED");
}
if (v1Release.verified !== true) throw new Error("VERIFIED_V1_RELEASE_MISSING");
const bytecode = artifact.bytecode?.object;
if (typeof bytecode !== "string" || !/^0x[0-9a-f]+$/i.test(bytecode)) {
  throw new Error("FLARE_V2_MARKET_BYTECODE_MISSING");
}

const official = gate0.publicIdentifiers?.contracts;
if (!official) throw new Error("FLARE_V2_OFFICIAL_BINDINGS_MISSING");
const constructorBindings = {
  paymentToken: getAddress(official.fTestXRP),
  teeManager: getAddress(official.flareTeeManager),
  ftso: getAddress(official.ftsoV2),
  teeExtensionRegistry: getAddress(official.flareTeeManager),
};
const constructorArguments = Object.values(constructorBindings);
const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const account = privateKeyToAccount(privateKey);
if (account.address !== getAddress(gate0.publicIdentifiers.deployer)) {
  throw new Error("FLARE_V2_DECLARED_DEPLOYER_MISMATCH");
}
const transport = http(rpcUrl, { timeout: 20_000, retryCount: 2 });
const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({ account, chain, transport });
const registryBindings = await resolveRegistryBindings({
  client: publicClient,
  registryAddress: official.flareContractRegistry,
  expectedBindings: { FtsoV2: constructorBindings.ftso },
});
const [chainId, balance, v1Runtime, ...dependencyCodes] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getBalance({ address: account.address }),
  publicClient.getCode({ address: getAddress(v1Release.contracts.VeilBidFlareMarket.address) }),
  ...constructorArguments.map((address) => publicClient.getCode({ address })),
]);
const preflight = {
  chainIdMatches: chainId === 114,
  deployerMatchesDeclaredAccount: account.address === getAddress(gate0.publicIdentifiers.deployer),
  balanceSufficient: balance >= 100_000_000_000_000_000n,
  foundationsPassed: gate0.status === "PASSED",
  ftsoRegistryBindingFresh: registryBindings.FtsoV2.matchesExpected,
  dependenciesHaveCode: dependencyCodes.every((code) => code && code !== "0x"),
  verifiedV1RuntimePreserved: Boolean(v1Runtime && v1Runtime !== "0x"),
  localV2ReadinessPassed: readiness.status === "PASSED",
  runtimeFitsEip170: readiness.assertions.runtimeFitsEip170,
  candidatePathsUnused: !existsSync(manifestPath) && !existsSync(evidencePath),
};
if (!Object.values(preflight).every(Boolean)) throw new Error("FLARE_V2_DEPLOYMENT_PREFLIGHT_FAILED");
if (!execute) {
  console.log(JSON.stringify({
    status: "READY",
    scope: "V2 deployment preflight only; no transaction sent",
    deployer: account.address,
    balanceWei: balance.toString(),
    constructorBindings,
    preflight,
    nextCommand: "pnpm flare:v2:deploy",
  }, null, 2));
  process.exit(0);
}
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error("FLARE_V2_DEPLOYMENT_REQUIRES_CLEAN_WORKTREE");
}

const deploymentTransaction = await walletClient.deployContract({
  account,
  abi: artifact.abi,
  bytecode,
  args: constructorArguments,
});
const receipt = await publicClient.waitForTransactionReceipt({
  hash: deploymentTransaction,
  confirmations: 2,
});
if (receipt.status !== "success" || !receipt.contractAddress) {
  throw new Error("FLARE_V2_DEPLOYMENT_FAILED");
}
const market = getAddress(receipt.contractAddress);
const [runtime, transaction] = await Promise.all([
  publicClient.getCode({ address: market, blockNumber: receipt.blockNumber }),
  publicClient.getTransaction({ hash: deploymentTransaction }),
]);
if (!runtime || runtime === "0x") throw new Error("FLARE_V2_RUNTIME_MISSING");
const decoded = decodeDeployData({ abi: artifact.abi, bytecode, data: transaction.input });
const getterAbi = [
  { type: "function", name: "paymentToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "teeManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "ftso", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "teeExtensionRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "awardReceipt", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const bindings = await Promise.all(getterAbi.map((entry) => publicClient.readContract({
  address: market,
  abi: getterAbi,
  functionName: entry.name,
  blockNumber: receipt.blockNumber,
})));
const awardReceipt = getAddress(bindings[4]);
const [awardCode, awardMarket] = await Promise.all([
  publicClient.getCode({ address: awardReceipt, blockNumber: receipt.blockNumber }),
  publicClient.readContract({
    address: awardReceipt,
    abi: [{ type: "function", name: "market", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }],
    functionName: "market",
    blockNumber: receipt.blockNumber,
  }),
]);
const runtimeComparison = compareMarketRuntime(artifact, runtime);
const decodedArguments = decoded.args ?? [];
const assertions = {
  ...preflight,
  transactionSucceeded: receipt.status === "success",
  constructorTransactionDecoded: decodedArguments.length === 4,
  constructorArgumentsMatch: decodedArguments.every(
    (value, index) => getAddress(value) === constructorArguments[index],
  ),
  runtimeSizeMatches: runtimeComparison.sizeMatches,
  runtimeLogicMatchesArtifact: runtimeComparison.logicMatches,
  liveBindingsMatch: bindings.slice(0, 4).every(
    (value, index) => getAddress(value) === constructorArguments[index],
  ),
  awardReceiptCodePresent: Boolean(awardCode && awardCode !== "0x"),
  awardReceiptMarketBindingMatches: getAddress(awardMarket) === market,
  addressDiffersFromV1:
    market.toLowerCase() !== v1Release.contracts.VeilBidFlareMarket.address.toLowerCase(),
};
if (!Object.values(assertions).every(Boolean)) throw new Error("FLARE_V2_DEPLOYMENT_VERIFICATION_FAILED");

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const recordedAt = new Date().toISOString();
const contracts = {
  FlareQuorumMarketV2: {
    address: market,
    deploymentTransaction,
    deploymentBlock: receipt.blockNumber.toString(),
    runtimeHash: runtimeComparison.runtimeHash,
    maskedRuntimeHash: runtimeComparison.maskedRuntimeHash,
    artifactMaskedRuntimeHash: runtimeComparison.artifactMaskedRuntimeHash,
  },
  FlareQuorumAwardReceiptV2: { address: awardReceipt },
};
const blockers = [
  "V2_EXTENSION_NOT_REGISTERED",
  "V2_THREE_FRESH_TEE_MACHINES_NOT_VERIFIED",
  "V2_SUCCESS_LIFECYCLE_NOT_VERIFIED",
  "V2_REFUND_LIFECYCLE_NOT_VERIFIED",
  "V2_CONSUMER_PROMOTION_NOT_APPROVED",
];
const candidate = {
  schemaVersion: 1,
  network: "flare-coston2",
  chainId: 114,
  kind: "flarequorum-v2-candidate",
  verified: false,
  recordedAt,
  sourceCommit,
  deployer: account.address,
  contracts,
  constructorArguments: constructorBindings,
  replaces: null,
  coexistsWithVerifiedV1: v1Release.contracts.VeilBidFlareMarket.address,
  blockers,
};
const evidence = {
  schemaVersion: 1,
  gate: "FLARE_V2_CANDIDATE_DEPLOYMENT",
  status: "IN_PROGRESS",
  recordedAt,
  sourceCommit,
  network: { name: "flare-coston2", chainId: 114, blockNumber: receipt.blockNumber.toString() },
  publicIdentifiers: contracts,
  assertions,
  blockers,
  notes: [
    "This immutable V2 candidate is not a verified release and is not exported to consumers.",
    "The verified V1 release and its registered machines remain untouched.",
    "No private key, proxy credential, TEE key, bid payload, or confidential result is recorded.",
  ],
};
for (const [path, value] of [[manifestPath, candidate], [evidencePath, evidence]]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}
console.log(JSON.stringify({
  status: evidence.status,
  market,
  awardReceipt,
  deploymentTransaction,
  blockNumber: receipt.blockNumber.toString(),
  evidence: plan.artifacts.candidateDeploymentEvidence,
  blockers,
}, null, 2));
