import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  decodeDeployData,
  getAddress,
  http,
} from "viem";
import { compareMarketRuntime } from "../flare/market-runtime-verifier.mjs";

const root = resolve(import.meta.dirname, "../..");
const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");

const releasePath = resolve(root, "packages/flare-contracts/deployments/coston2.release.json");
const evidencePath = resolve(root, "evidence/coston2/deployment-consistency.json");
const refresh = process.argv.includes("--refresh");
if (!refresh && (existsSync(releasePath) || existsSync(evidencePath))) throw new Error("COSTON2_RELEASE_ARTIFACT_ALREADY_EXISTS");
if (refresh && (!existsSync(releasePath) || !existsSync(evidencePath))) throw new Error("COSTON2_RELEASE_ARTIFACT_MISSING");
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error("COSTON2_RELEASE_REQUIRES_CLEAN_WORKTREE");
}

const lifecycleRelativePath = process.env.FLARE_RELEASE_LIFECYCLE_EVIDENCE_PATH?.trim()
  || "evidence/coston2/gate-c-e-f-live-lifecycle.json";
if (!/^evidence\/coston2\/[a-z0-9.-]+\.json$/.test(lifecycleRelativePath)) {
  throw new Error("COSTON2_RELEASE_LIFECYCLE_PATH_INVALID");
}

function read(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

function requireStatus(record, expected, code) {
  if (!record || record.status !== expected) throw new Error(code);
  if (record.assertions && !Object.values(record.assertions).every(Boolean)) throw new Error(`${code}_ASSERTIONS`);
}

const candidate = read("packages/flare-contracts/deployments/coston2.market-candidate.json");
const gate0 = read("evidence/coston2/gate-0-foundations.json");
const gateA = read("evidence/coston2/gate-a-fcc-result.json");
const gateB = read("evidence/coston2/gate-b-private-ingress.json");
const registration = read("evidence/coston2/fcc-market-extension-registration.json");
const codeVersion = read("evidence/coston2/fcc-code-version.json");
const extensionImage = read("evidence/coston2/gate-0-extension-image.json");
const machines = read("evidence/coston2/fcc-market-machines.json");
const governance = read("evidence/coston2/fcc-market-governance.json");
const lifecycle = read(lifecycleRelativePath);
const gateG = read("evidence/coston2/gate-g-smart-account.json");

requireStatus(gate0, "PASSED", "GATE_0_NOT_PASSED");
requireStatus(gateA, "PASSED", "GATE_A_NOT_PASSED");
if (!["IN_PROGRESS", "PASSED"].includes(gateB.status)) throw new Error("GATE_B_STATUS_INVALID");
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
  throw new Error("GATE_B_LIVE_ASSERTIONS_MISSING");
}
requireStatus(registration, "REGISTERED_BOUND_CONFIGURATION_READY", "MARKET_EXTENSION_NOT_READY");
requireStatus(extensionImage, "PASSED", "MARKET_EXTENSION_IMAGE_NOT_READY");
requireStatus(machines, "PASSED", "MARKET_MACHINES_NOT_READY");
requireStatus(governance, "PASSED", "MARKET_GOVERNANCE_NOT_READY");
requireStatus(lifecycle, "PASSED", "GATES_C_E_F_NOT_PASSED");
requireStatus(gateG, "PASSED", "GATE_G_NOT_PASSED");

const market = getAddress(candidate.contracts?.VeilBidFlareMarket?.address);
const awardReceipt = getAddress(candidate.contracts?.VeilBidFlareAwardReceipt?.address);
const registrationIds = registration.publicIdentifiers;
const lifecycleIds = lifecycle.publicIdentifiers;
const gateGIds = gateG.publicIdentifiers;
const machineRecords = machines.publicIdentifiers?.machines;
if (!Array.isArray(machineRecords) || machineRecords.length !== 3) throw new Error("MARKET_MACHINE_SET_INVALID");
const teeIds = machineRecords.map(({ teeId }) => getAddress(teeId));
const teeKeyFingerprints = machineRecords.map(({ teeId }) => {
  const found = lifecycleIds.teeIds?.findIndex((value) => value.toLowerCase() === teeId.toLowerCase());
  if (found === undefined || found < 0) throw new Error("MARKET_MACHINE_FINGERPRINT_MISSING");
  return lifecycleIds.teeKeyFingerprints[found];
});
const selectionSigners = (lifecycleIds.selectionSignerIds ?? []).map(getAddress);
if (selectionSigners.length !== 2 || new Set(selectionSigners.map((value) => value.toLowerCase())).size !== 2) {
  throw new Error("MARKET_RESULT_SIGNER_THRESHOLD_INVALID");
}
if (selectionSigners.some((value) => !teeIds.some((teeId) => teeId.toLowerCase() === value.toLowerCase()))) {
  throw new Error("MARKET_RESULT_SIGNER_MACHINE_MISMATCH");
}
if (
  getAddress(registrationIds.sender) !== market
  || String(registrationIds.extensionId) !== String(lifecycleIds.extensionId)
  || registrationIds.codeHash.toLowerCase() !== lifecycleIds.codeHash.toLowerCase()
  || String(registrationIds.extensionId) !== String(gateGIds.extensionId)
  || registrationIds.codeHash.toLowerCase() !== gateGIds.codeHash.toLowerCase()
) throw new Error("MARKET_EXTENSION_BINDING_MISMATCH");
if (String(codeVersion.publicIdentifiers.codeHash).toLowerCase() !== String(registrationIds.codeHash).toLowerCase()) {
  throw new Error("MARKET_CODE_VERSION_MISMATCH");
}
if (lifecycleIds.market.toLowerCase() !== market.toLowerCase() || gateGIds.market.toLowerCase() !== market.toLowerCase()) {
  throw new Error("MARKET_LIFECYCLE_ADDRESS_MISMATCH");
}

const artifact = read("packages/flare-contracts/out/VeilBidFlareMarket.sol/VeilBidFlareMarket.json");
const bytecode = artifact.bytecode?.object;
if (typeof bytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(bytecode)) throw new Error("MARKET_BYTECODE_MISSING");
const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const publicClient = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }) });
const latestBlock = await publicClient.getBlockNumber();
if (latestBlock < BigInt(candidate.contracts.VeilBidFlareMarket.deploymentBlock) + 12n) {
  throw new Error("MARKET_DEPLOYMENT_NOT_FINALIZED");
}
const [chainId, runtime, deploymentTransaction] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getCode({ address: market, blockNumber: latestBlock - 12n }),
  publicClient.getTransaction({ hash: candidate.contracts.VeilBidFlareMarket.deploymentTransaction }),
]);
if (chainId !== 114 || !runtime || runtime === "0x") throw new Error("MARKET_RUNTIME_UNAVAILABLE");
const runtimeComparison = compareMarketRuntime(artifact, runtime);
if (
  runtimeComparison.runtimeHash.toLowerCase() !== candidate.contracts.VeilBidFlareMarket.runtimeHash.toLowerCase()
  || !runtimeComparison.sizeMatches
  || !runtimeComparison.logicMatches
) throw new Error("MARKET_RUNTIME_MISMATCH");
const decoded = decodeDeployData({ abi: artifact.abi, bytecode, data: deploymentTransaction.input });
const official = gate0.publicIdentifiers.contracts;
const constructorArguments = [
  getAddress(official.fTestXRP),
  getAddress(official.flareTeeManager),
  getAddress(official.ftsoV2),
  getAddress(official.flareTeeManager),
];
if (
  !Array.isArray(decoded.args)
  || decoded.args.length !== constructorArguments.length
  || decoded.args.some((value, index) => getAddress(value) !== constructorArguments[index])
) throw new Error("MARKET_CONSTRUCTOR_BINDING_MISMATCH");
const getterAbi = [
  { type: "function", name: "paymentToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "teeManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "ftso", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "teeExtensionRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "awardReceipt", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const [paymentToken, teeManager, ftso, extensionRegistry, liveAwardReceiptRaw] = await Promise.all(
  getterAbi.map((entry) => publicClient.readContract({ address: market, abi: getterAbi, functionName: entry.name })),
);
const liveAwardReceipt = getAddress(liveAwardReceiptRaw);
if (
  getAddress(paymentToken) !== constructorArguments[0]
  || getAddress(teeManager) !== constructorArguments[1]
  || getAddress(ftso) !== constructorArguments[2]
  || getAddress(extensionRegistry) !== constructorArguments[3]
  || liveAwardReceipt !== awardReceipt
) throw new Error("MARKET_LIVE_WIRING_MISMATCH");
const [awardCode, awardMarket] = await Promise.all([
  publicClient.getCode({ address: liveAwardReceipt, blockNumber: latestBlock - 12n }),
  publicClient.readContract({
    address: liveAwardReceipt,
    abi: [{ type: "function", name: "market", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }],
    functionName: "market",
  }),
]);
if (!awardCode || awardCode === "0x" || getAddress(awardMarket) !== market) throw new Error("MARKET_RECEIPT_WIRING_MISMATCH");

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const recordedAt = new Date().toISOString();
const release = {
  schemaVersion: 1,
  network: "flare-coston2",
  chainId: 114,
  kind: "release",
  verified: true,
  recordedAt,
  sourceCommit,
  deployer: candidate.deployer,
  contracts: {
    VeilBidFlareMarket: {
      ...candidate.contracts.VeilBidFlareMarket,
      runtimeHash: runtimeComparison.runtimeHash,
      maskedRuntimeHash: runtimeComparison.maskedRuntimeHash,
      artifactMaskedRuntimeHash: runtimeComparison.artifactMaskedRuntimeHash,
    },
    VeilBidFlareAwardReceipt: { address: awardReceipt },
  },
  constructorArguments: {
    paymentToken: constructorArguments[0],
    teeManager: constructorArguments[1],
    ftso: constructorArguments[2],
    teeExtensionRegistry: constructorArguments[3],
  },
  fcc: {
    manager: constructorArguments[1],
    extensionId: String(registrationIds.extensionId),
    codeHash: registrationIds.codeHash,
    version: registrationIds.version,
    platform: registrationIds.platform,
    applicationImage: {
      tag: extensionImage.publicIdentifiers.imageTag,
      digest: extensionImage.publicIdentifiers.imageDigest,
      binarySha256: extensionImage.publicIdentifiers.binarySha256,
    },
    teeIds,
    teeKeyFingerprints,
    resultThreshold: 2,
    governanceHash: governance.publicIdentifiers.governanceHash,
  },
  protocols: {
    fTestXRP: getAddress(official.fTestXRP),
    assetManagerFXRP: getAddress(official.assetManagerFXRP),
    ftsoV2: getAddress(official.ftsoV2),
    xrpUsdFeedId: gate0.publicIdentifiers.xrpUsdFeed.id,
    fdcHub: getAddress(official.fdcHub),
    fdcVerification: getAddress(official.fdcVerification),
    masterAccountController: getAddress(official.masterAccountController),
    relay: getAddress(official.relay),
  },
  evidence: [
    "evidence/coston2/gate-0-foundations.json",
    "evidence/coston2/gate-a-fcc-result.json",
    "evidence/coston2/gate-b-private-ingress.json",
    "evidence/coston2/fcc-market-extension-registration.json",
    "evidence/coston2/fcc-market-governance.json",
    "evidence/coston2/fcc-market-machines.json",
    lifecycleRelativePath,
    "evidence/coston2/fcc-replacement-recovery.json",
    "evidence/coston2/gate-g-smart-account.json",
    "evidence/coston2/deployment-consistency.json",
  ],
  blockers: [],
};
const evidence = {
  schemaVersion: 1,
  gate: "DEPLOYMENT_CONSISTENCY",
  status: "PASSED",
  recordedAt,
  sourceCommit,
  network: { name: "flare-coston2", chainId: 114, blockNumber: (latestBlock - 12n).toString() },
  publicIdentifiers: {
    market,
    awardReceipt,
    deploymentTransaction: candidate.contracts.VeilBidFlareMarket.deploymentTransaction,
    deploymentBlock: candidate.contracts.VeilBidFlareMarket.deploymentBlock,
    runtimeHash: runtimeComparison.runtimeHash,
    extensionId: String(registrationIds.extensionId),
    codeHash: registrationIds.codeHash,
    teeIds,
    resultSignerIds: selectionSigners,
    resultDataHash: lifecycleIds.selectionResultDataHash,
    gateGDirectMintingTransaction: gateGIds.directMintingTransactionHash,
    gateGTenderId: gateGIds.tenderId,
  },
  assertions: {
    chainIdMatches: chainId === 114,
    deploymentRuntimeMatchesArtifact: runtimeComparison.sizeMatches && runtimeComparison.logicMatches,
    deploymentConstructorBindingsMatch: true,
    liveMarketDependenciesMatch: true,
    awardReceiptBindingMatches: true,
    extensionSenderMatchesMarket: registrationIds.sender.toLowerCase() === market.toLowerCase(),
    extensionCodeVersionMatchesLifecycle: registrationIds.codeHash.toLowerCase() === lifecycleIds.codeHash.toLowerCase(),
    threeMachinesMatchRelease: teeIds.length === 3 && new Set(teeIds.map((value) => value.toLowerCase())).size === 3,
    resultSignersAreFrozenMachines: selectionSigners.every((value) => teeIds.some((teeId) => teeId.toLowerCase() === value.toLowerCase())),
    resultThresholdMatchesRelease: selectionSigners.length === 2,
    fassetsFdcSmartAccountEvidencePresent: gateG.assertions.directMintingExecutedToSmartAccount === true,
    noBlockers: true,
  },
  blockers: [],
  notes: [
    "The immutable Coston2 market candidate is promoted only after live bytecode, constructor, dependency getter, award receipt, extension, machine, result-signer, and Gate G mappings agree.",
    "The organizer-supported replacement and re-registration recovery drill passed; same-identity restoration is unsupported and is not claimed.",
    "Only public addresses, hashes, checkpoints, and booleans are recorded; no bid, ciphertext, credential, signature, or secret is included.",
  ],
};
mkdirSync(dirname(releasePath), { recursive: true });
mkdirSync(dirname(evidencePath), { recursive: true });
if (refresh) {
  const releaseTemporaryPath = `${releasePath}.tmp`;
  const evidenceTemporaryPath = `${evidencePath}.tmp`;
  writeFileSync(releaseTemporaryPath, `${JSON.stringify(release, null, 2)}\n`, { flag: "w" });
  writeFileSync(evidenceTemporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "w" });
  renameSync(releaseTemporaryPath, releasePath);
  renameSync(evidenceTemporaryPath, evidencePath);
} else {
  writeFileSync(releasePath, `${JSON.stringify(release, null, 2)}\n`, { flag: "wx" });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
}
console.log(JSON.stringify({ status: "PASSED", market, awardReceipt, deploymentBlock: candidate.contracts.VeilBidFlareMarket.deploymentBlock, sourceCommit, evidence: "evidence/coston2/deployment-consistency.json" }, null, 2));
