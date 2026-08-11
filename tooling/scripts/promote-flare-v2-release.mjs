import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createPublicClient,
  decodeDeployData,
  getAddress,
  http,
  parseAbi,
} from "viem";

import { resolveRegistryBindings } from "../flare/foundations.mjs";
import { compareMarketRuntime } from "../flare/market-runtime-verifier.mjs";
import {
  evaluateV2PromotionBundle,
  readV2ReleasePlan,
} from "../flare/v2-release.mjs";

const root = resolve(import.meta.dirname, "../..");
const plan = readV2ReleasePlan(root);
const execute = process.argv.includes("--execute");
const requireReady = process.argv.includes("--require-ready");
const v1ReleasePath = "packages/flare-contracts/deployments/coston2.release.json";
const requiredRecords = {
  candidate: plan.artifacts.candidateManifest,
  candidateDeployment: plan.artifacts.candidateDeploymentEvidence,
  extension: plan.artifacts.extensionRegistrationEvidence,
  governance: plan.artifacts.governanceEvidence,
  machines: plan.artifacts.machineEvidence,
  success: plan.artifacts.successLifecycleEvidence,
  recovery: plan.artifacts.oneResultOutageEvidence,
  refund: plan.artifacts.refundLifecycleEvidence,
  v1Release: v1ReleasePath,
};
const missing = Object.entries(requiredRecords)
  .filter(([, path]) => !existsSync(resolve(root, path)))
  .map(([name]) => name);
if (missing.length > 0) {
  console.log(JSON.stringify({
    status: "BLOCKED",
    scope: "V2 promotion readiness; no files or transactions written",
    missing,
    blockers: missing.map((name) => `V2_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_MISSING`),
    verifiedV1RemainsCanonical: true,
  }, null, 2));
  if (requireReady || execute) process.exitCode = 1;
  process.exit();
}

const records = Object.fromEntries(Object.entries(requiredRecords).map(([name, path]) => [
  name,
  JSON.parse(readFileSync(resolve(root, path), "utf8")),
]));
const bundle = evaluateV2PromotionBundle(records);
if (bundle.status !== "READY") {
  console.log(JSON.stringify({
    status: bundle.status,
    scope: "V2 promotion readiness; no files or transactions written",
    assertions: bundle.assertions,
    verifiedV1RemainsCanonical: true,
  }, null, 2));
  if (requireReady || execute) process.exitCode = 1;
  process.exit();
}

const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
if (!/^https:\/\//.test(rpcUrl ?? "")) throw new Error("FLARE_V2_PROMOTION_RPC_INVALID");
const gate0 = JSON.parse(readFileSync(resolve(root, "evidence/coston2/gate-0-foundations.json"), "utf8"));
const artifact = JSON.parse(readFileSync(resolve(root, plan.contracts.market.artifact), "utf8"));
const marketRecord = records.candidate.contracts.FlareQuorumMarketV2;
const receiptRecord = records.candidate.contracts.FlareQuorumAwardReceiptV2;
const market = getAddress(marketRecord.address);
const awardReceipt = getAddress(receiptRecord.address);
const manager = getAddress(records.extension.publicIdentifiers.manager);
const extensionId = BigInt(records.extension.publicIdentifiers.extensionId);
const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const client = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
const latest = await client.getBlockNumber();
const verificationBlock = latest > 12n ? latest - 12n : latest;
const managerAbi = parseAbi([
  "function getTeeExtensionInstructionsSender(uint256 extensionId) view returns (address)",
  "function getActiveTeeMachines(uint256 extensionId) view returns (address[] teeIds,string[] urls)",
]);
const getterAbi = parseAbi([
  "function paymentToken() view returns (address)",
  "function teeManager() view returns (address)",
  "function ftso() view returns (address)",
  "function teeExtensionRegistry() view returns (address)",
  "function awardReceipt() view returns (address)",
]);
const [chainId, runtime, receiptCode, deploymentTransaction, sender, activeSet, ...bindings] = await Promise.all([
  client.getChainId(),
  client.getCode({ address: market, blockNumber: verificationBlock }),
  client.getCode({ address: awardReceipt, blockNumber: verificationBlock }),
  client.getTransaction({ hash: marketRecord.deploymentTransaction }),
  client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeExtensionInstructionsSender", args: [extensionId], blockNumber: verificationBlock }),
  client.readContract({ address: manager, abi: managerAbi, functionName: "getActiveTeeMachines", args: [extensionId], blockNumber: verificationBlock }),
  ...["paymentToken", "teeManager", "ftso", "teeExtensionRegistry", "awardReceipt"].map((functionName) =>
    client.readContract({ address: market, abi: getterAbi, functionName, blockNumber: verificationBlock })
  ),
]);
if (!runtime || runtime === "0x") throw new Error("FLARE_V2_PROMOTION_RUNTIME_MISSING");
const runtimeComparison = compareMarketRuntime(artifact, runtime);
const decoded = decodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  data: deploymentTransaction.input,
});
const expectedBindings = [
  getAddress(gate0.publicIdentifiers.contracts.fTestXRP),
  getAddress(gate0.publicIdentifiers.contracts.flareTeeManager),
  getAddress(gate0.publicIdentifiers.contracts.ftsoV2),
  getAddress(gate0.publicIdentifiers.contracts.flareTeeManager),
];
const registryBindings = await resolveRegistryBindings({
  client,
  registryAddress: gate0.publicIdentifiers.contracts.flareContractRegistry,
  expectedBindings: { FtsoV2: expectedBindings[2] },
  blockNumber: verificationBlock,
});
const expectedMachineIds = records.machines.publicIdentifiers.machines
  .map(({ teeId }) => getAddress(teeId).toLowerCase())
  .sort();
const activeMachineIds = activeSet[0].map(getAddress).map((value) => value.toLowerCase()).sort();
const liveAssertions = {
  chainIdMatches: chainId === 114,
  deploymentFinalized: latest >= BigInt(marketRecord.deploymentBlock) + 12n,
  runtimeHashMatchesCandidate: runtimeComparison.runtimeHash.toLowerCase() === marketRecord.runtimeHash.toLowerCase(),
  runtimeLogicMatchesArtifact: runtimeComparison.sizeMatches && runtimeComparison.logicMatches,
  constructorBindingsMatch:
    Array.isArray(decoded.args) && decoded.args.length === 4 &&
    decoded.args.every((value, index) => getAddress(value) === expectedBindings[index]),
  liveGettersMatch:
    bindings.slice(0, 4).every((value, index) => getAddress(value) === expectedBindings[index]) &&
    getAddress(bindings[4]) === awardReceipt,
  awardReceiptCodePresent: Boolean(receiptCode && receiptCode !== "0x"),
  extensionSenderMatchesMarket: getAddress(sender) === market,
  exactActiveMachineSet:
    activeMachineIds.length === 3 && JSON.stringify(activeMachineIds) === JSON.stringify(expectedMachineIds),
  ftsoRegistryBindingFresh: registryBindings.FtsoV2.matchesExpected,
  verifiedV1AddressUnchanged:
    records.v1Release.contracts.VeilBidFlareMarket.address.toLowerCase() !== market.toLowerCase(),
};
const status = Object.values(liveAssertions).every(Boolean) ? "READY" : "BLOCKED";
if (status !== "READY") {
  console.log(JSON.stringify({ status, scope: "V2 live promotion verification; no files or transactions written", assertions: { ...bundle.assertions, ...liveAssertions } }, null, 2));
  if (requireReady || execute) process.exitCode = 1;
  process.exit();
}
if (!execute) {
  console.log(JSON.stringify({
    status: "READY",
    scope: "V2 promotion verification only; no files or transactions written",
    market,
    awardReceipt,
    extensionId: extensionId.toString(),
    verificationBlock: verificationBlock.toString(),
    assertions: { ...bundle.assertions, ...liveAssertions },
    nextCommand: "pnpm flare:v2:promote",
  }, null, 2));
  process.exit(0);
}
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error("FLARE_V2_PROMOTION_REQUIRES_CLEAN_WORKTREE");
}
const releasePath = resolve(root, plan.artifacts.releaseManifest);
const consistencyPath = resolve(root, plan.artifacts.deploymentConsistencyEvidence);
if (existsSync(releasePath) || existsSync(consistencyPath)) {
  throw new Error("FLARE_V2_PROMOTION_ARTIFACT_ALREADY_EXISTS");
}
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const recordedAt = new Date().toISOString();
const machines = records.machines.publicIdentifiers.machines;
const release = {
  schemaVersion: 1,
  network: "flare-coston2",
  chainId: 114,
  kind: "flarequorum-v2-release",
  verified: true,
  consumerSelectable: false,
  recordedAt,
  sourceCommit,
  deployer: records.candidate.deployer,
  contracts: records.candidate.contracts,
  constructorArguments: records.candidate.constructorArguments,
  fcc: {
    manager,
    extensionId: extensionId.toString(),
    codeHash: records.extension.publicIdentifiers.codeHash,
    version: records.extension.publicIdentifiers.version,
    teeIds: machines.map(({ teeId }) => getAddress(teeId)),
    resultThreshold: 2,
    governanceHash: records.governance.publicIdentifiers.governanceHash,
  },
  evidence: Object.values(plan.artifacts).filter((path) => path.startsWith("evidence/coston2/") && existsSync(resolve(root, path))),
  consumerPromotion: {
    status: "PENDING_EXPLICIT_APPROVAL",
    verifiedV1RemainsDefault: true,
  },
  blockers: ["V2_CONSUMER_SWITCH_NOT_APPROVED"],
};
const consistency = {
  schemaVersion: 1,
  gate: "FLARE_V2_DEPLOYMENT_CONSISTENCY",
  status: "PASSED",
  recordedAt,
  sourceCommit,
  network: { name: "flare-coston2", chainId: 114, blockNumber: verificationBlock.toString() },
  publicIdentifiers: { market, awardReceipt, extensionId: extensionId.toString() },
  assertions: { ...bundle.assertions, ...liveAssertions },
  blockers: [],
  notes: [
    "V2 runtime, constructor, registry, extension sender, machine set, success lifecycle, and refund lifecycle were rechecked before recording this release.",
    "This promotion does not switch web, relay, console, or public package consumers; V1 remains their default until a separate approval.",
  ],
};
for (const [path, value] of [[releasePath, release], [consistencyPath, consistency]]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}
console.log(JSON.stringify({
  status: "PROMOTED_NOT_CONSUMER_SELECTED",
  market,
  release: plan.artifacts.releaseManifest,
  consistencyEvidence: plan.artifacts.deploymentConsistencyEvidence,
  verifiedV1RemainsDefault: true,
}, null, 2));
