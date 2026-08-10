import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeDeployData,
  getAddress,
  http,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { resolveRegistryBindings } from "../flare/foundations.mjs";
import { compareMarketRuntime } from "../flare/market-runtime-verifier.mjs";
import { loadPassedPreDeploymentGates } from "../flare/release-gates.mjs";

const root = resolve(import.meta.dirname, "../..");
const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
const rawKey = process.env.FLARE_DEPLOYMENT_PRIVATE_KEY?.trim();
if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
if (!rawKey) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_MISSING");
const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_INVALID");

const porcelain = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
if (porcelain.trim() !== "") throw new Error("DEPLOYMENT_REQUIRES_CLEAN_WORKTREE");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const outputPaths = [
  "packages/flare-contracts/deployments/coston2.release.json",
  "evidence/coston2/market-deployment.json",
];
if (outputPaths.some((path) => existsSync(resolve(root, path)))) {
  throw new Error("COSTON2_MARKET_DEPLOYMENT_ARTIFACT_ALREADY_EXISTS");
}
const gates = loadPassedPreDeploymentGates(root);
const gate0 = gates["evidence/coston2/gate-0-foundations.json"];
const gateE = gates["evidence/coston2/gate-e-threshold-recovery.json"];
const official = gate0.publicIdentifiers?.contracts;
const fcc = gateE.publicIdentifiers;
if (!official || !fcc) throw new Error("GATE_PUBLIC_IDENTIFIERS_MISSING");

const addresses = {
  paymentToken: getAddress(official.fTestXRP),
  teeManager: getAddress(official.flareTeeManager),
  ftso: getAddress(official.ftsoV2),
  teeExtensionRegistry: getAddress(official.flareTeeManager),
};
if (!Array.isArray(fcc.teeIds) || fcc.teeIds.length !== 3 || !Array.isArray(fcc.teeKeyFingerprints) || fcc.teeKeyFingerprints.length !== 3) {
  throw new Error("GATE_E_MACHINE_SET_MISSING");
}

const artifactPath = resolve(root, "packages/flare-contracts/out/VeilBidFlareMarket.sol/VeilBidFlareMarket.json");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const bytecode = artifact.bytecode?.object;
if (typeof bytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(bytecode)) throw new Error("MARKET_BYTECODE_MISSING");

const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 12_000, retryCount: 2 }) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl, { timeout: 12_000, retryCount: 2 }) });
const registryBindings = await resolveRegistryBindings({
  client: publicClient,
  registryAddress: official.flareContractRegistry,
  expectedBindings: { FtsoV2: addresses.ftso },
});
if (!registryBindings.FtsoV2.matchesExpected) {
  throw new Error("FTSOV2_REGISTRY_BINDING_DRIFT");
}
const [chainId, balance, dependencyCodes] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getBalance({ address: account.address }),
  Promise.all(Object.values(addresses).map((address) => publicClient.getCode({ address }))),
]);
if (chainId !== 114) throw new Error("COSTON2_CHAIN_MISMATCH");
if (balance < 100_000_000_000_000_000n) throw new Error("INSUFFICIENT_C2FLR_FOR_DEPLOYMENT");
if (dependencyCodes.some((code) => code === undefined || code === "0x")) throw new Error("FLARE_DEPENDENCY_CODE_MISSING");

const constructorArguments = [
  addresses.paymentToken,
  addresses.teeManager,
  addresses.ftso,
  addresses.teeExtensionRegistry,
];
const transactionHash = await walletClient.deployContract({
  account,
  abi: artifact.abi,
  bytecode,
  args: constructorArguments,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2 });
if (receipt.status !== "success" || receipt.contractAddress === null) throw new Error("MARKET_DEPLOYMENT_FAILED");
const market = getAddress(receipt.contractAddress);
const [runtime, transaction] = await Promise.all([
  publicClient.getCode({ address: market }),
  publicClient.getTransaction({ hash: transactionHash }),
]);
if (!runtime || runtime === "0x") throw new Error("MARKET_RUNTIME_MISSING");
const decodedDeployment = decodeDeployData({ abi: artifact.abi, bytecode, data: transaction.input });
const decodedArguments = decodedDeployment.args ?? [];

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
  publicClient.readContract({
    address: awardReceiptAddress,
    abi: [{ type: "function", name: "market", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }],
    functionName: "market",
  }),
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
  ftsoRegistryBindingFresh: registryBindings.FtsoV2.matchesExpected,
  extensionRegistryBindingMatches: getAddress(teeExtensionRegistry) === addresses.teeExtensionRegistry,
  awardReceiptCodePresent: awardCode !== undefined && awardCode !== "0x",
  awardReceiptMarketBindingMatches: getAddress(awardMarket) === market,
};
if (!Object.values(assertions).every(Boolean)) throw new Error("MARKET_DEPLOYMENT_VERIFICATION_FAILED");

const recordedAt = new Date().toISOString();
const publicFacts = {
  schemaVersion: 1,
  network: "flare-coston2",
  chainId: 114,
  kind: "championship-candidate",
  verified: false,
  recordedAt,
  sourceCommit,
  deployer: account.address,
  contracts: {
    VeilBidFlareMarket: {
      address: market,
      deploymentTransaction: transactionHash,
      deploymentBlock: receipt.blockNumber.toString(),
      runtimeHash: runtimeComparison.runtimeHash,
      maskedRuntimeHash: runtimeComparison.maskedRuntimeHash,
      artifactMaskedRuntimeHash: runtimeComparison.artifactMaskedRuntimeHash,
    },
    VeilBidFlareAwardReceipt: { address: awardReceiptAddress },
  },
  constructorArguments: addresses,
  fcc: {
    extensionId: String(fcc.extensionId),
    codeVersion: fcc.codeVersion,
    teeIds: fcc.teeIds.map((value) => getAddress(value)),
    teeKeyFingerprints: fcc.teeKeyFingerprints,
    resultThreshold: 2,
  },
  protocols: {
    fTestXRP: addresses.paymentToken,
    assetManagerFXRP: getAddress(official.assetManagerFXRP),
    ftsoV2: addresses.ftso,
    xrpUsdFeedId: gate0.publicIdentifiers.xrpUsdFeed.id,
    fdcVerification: getAddress(official.fdcVerification),
    masterAccountController: getAddress(official.masterAccountController),
  },
  evidence: [
    "evidence/coston2/gate-0-foundations.json",
    "evidence/coston2/gate-a-fcc-result.json",
    "evidence/coston2/gate-b-private-ingress.json",
    "evidence/coston2/gate-c-tee-quorum.json",
    "evidence/coston2/gate-d-private-scoring.json",
    "evidence/coston2/gate-e-threshold-recovery.json",
    "evidence/coston2/market-deployment.json",
  ],
  blockers: ["GATE_F_NOT_PASSED", "GATE_G_NOT_PASSED", "GATE_H_NOT_PASSED"],
};
const deploymentEvidence = {
  schemaVersion: 1,
  gate: "MARKET_DEPLOYMENT",
  status: "PASS",
  recordedAt,
  sourceCommit,
  network: { name: "flare-coston2", chainId: 114, blockNumber: receipt.blockNumber.toString() },
  publicIdentifiers: publicFacts.contracts,
  assertions,
  blockers: [],
  notes: [
    "Runtime logic comparison masks only compiler-declared immutable slots; every immutable getter is checked separately.",
    "This deployment is not promoted to verified release until Gates F-H pass.",
    "No RPC URL, deployment key, proxy payload, bid data, or credential is recorded.",
  ],
};
for (const [path, value] of [
  [outputPaths[1], deploymentEvidence],
  [outputPaths[0], publicFacts],
]) {
  const absolute = resolve(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}
process.stdout.write(`${JSON.stringify({
  status: "DEPLOYED_VERIFIED_CANDIDATE",
  chainId: 114,
  market,
  awardReceipt: awardReceiptAddress,
  transactionHash,
  blockNumber: receipt.blockNumber.toString(),
  assertions,
})}\n`);
