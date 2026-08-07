import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { bytes32Text } from "../flare/local-fcc-stack.mjs";
import { teeManagerRegistrationAbi } from "../flare/fcc-foundation-registration.mjs";

const root = resolve(import.meta.dirname, "../..");
const execute = process.argv.includes("--execute");
const evidencePath = resolve(root, "evidence/coston2/fcc-code-version.json");
const foundations = JSON.parse(readFileSync(resolve(root, "tooling/flare/coston2-foundations.json"), "utf8"));
const registration = JSON.parse(readFileSync(resolve(root, "evidence/coston2/fcc-extension-registration.json"), "utf8"));
const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
const rawKey = process.env.FLARE_DEPLOYMENT_PRIVATE_KEY?.trim();
if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
if (!rawKey) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_MISSING");
const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("FLARE_DEPLOYMENT_PRIVATE_KEY_INVALID");

const infoResponse = await fetch(process.env.FCC_PROXY_LOCAL_URL ?? "http://127.0.0.1:6674/info", {
  signal: AbortSignal.timeout(10_000),
});
if (!infoResponse.ok) throw new Error(`FCC_LOCAL_INFO_HTTP_${infoResponse.status}`);
const info = await infoResponse.json();
const machineData = info.machineData ?? {};
const manager = getAddress(registration.publicIdentifiers.manager);
const extensionId = BigInt(registration.publicIdentifiers.extensionId);
const extensionIdHex = registration.publicIdentifiers.extensionIdHex.toLowerCase();
const codeHash = machineData.codeHash;
const platform = machineData.platform;
const versionText = `v${foundations.docker.fccExtensionReleaseRecipe.version}`;
const version = stringToHex(versionText, { size: 32 });
if (!/^0x[0-9a-fA-F]{64}$/.test(codeHash ?? "") || /^0x0{64}$/i.test(codeHash)) {
  throw new Error("FCC_CODE_HASH_INVALID");
}
if (platform?.toLowerCase() !== bytes32Text("TEST_PLATFORM")) {
  throw new Error("FCC_PLATFORM_NOT_SIMULATED");
}
if (String(machineData.extensionId ?? "").toLowerCase() !== extensionIdHex) {
  throw new Error("FCC_CODE_VERSION_EXTENSION_MISMATCH");
}
const account = privateKeyToAccount(privateKey);
if (account.address !== getAddress(foundations.network.declaredDeployer)) {
  throw new Error("DECLARED_DEPLOYER_MISMATCH");
}
const chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const transport = http(rpcUrl, { timeout: 15_000, retryCount: 2 });
const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({ account, chain, transport });
const [chainId, managerCode, supportedBefore] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getCode({ address: manager }),
  publicClient.readContract({
    address: manager,
    abi: teeManagerRegistrationAbi,
    functionName: "isCodeHashPlatformSupported",
    args: [extensionId, codeHash, platform],
  }),
]);
const preflight = {
  chainIdMatches: chainId === 114,
  managerCodePresent: managerCode !== undefined && managerCode !== "0x",
  extensionMatchesLiveInfo: machineData.extensionId.toLowerCase() === extensionIdHex,
  codeHashIsNonzero: !/^0x0{64}$/i.test(codeHash),
  platformIsSimulated: platform.toLowerCase() === bytes32Text("TEST_PLATFORM"),
  versionMatchesRelease: versionText === "v0.2.2",
};
if (!Object.values(preflight).every(Boolean)) throw new Error("FCC_CODE_VERSION_PREFLIGHT_FAILED");
if (!execute) {
  console.log(JSON.stringify({
    status: supportedBefore ? "ALREADY_ALLOWED" : "READY",
    scope: "preflight only; no transaction sent",
    extensionId: extensionId.toString(),
    codeHash,
    platform,
    version: versionText,
    preflight,
  }, null, 2));
  process.exit(0);
}
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "") {
  throw new Error("FCC_CODE_VERSION_REQUIRES_CLEAN_WORKTREE");
}
if (existsSync(evidencePath)) throw new Error("FCC_CODE_VERSION_EVIDENCE_ALREADY_EXISTS");

let transactionHash;
let receipt;
if (!supportedBefore) {
  const simulation = await publicClient.simulateContract({
    account,
    address: manager,
    abi: teeManagerRegistrationAbi,
    functionName: "addTeeVersion",
    args: [extensionId, version, codeHash, [platform]],
  });
  transactionHash = await walletClient.writeContract(simulation.request);
  receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2 });
  if (receipt.status !== "success") throw new Error("FCC_CODE_VERSION_TRANSACTION_FAILED");
} else {
  const events = await publicClient.getContractEvents({
    address: manager,
    abi: teeManagerRegistrationAbi,
    eventName: "TeeVersionAdded",
    args: { extensionId, codeHash },
    fromBlock: BigInt(registration.publicIdentifiers.registrationBlock),
    toBlock: "latest",
    strict: true,
  });
  const event = events.at(-1);
  if (!event?.transactionHash) throw new Error("FCC_CODE_VERSION_EVENT_NOT_FOUND");
  transactionHash = event.transactionHash;
  receipt = await publicClient.getTransactionReceipt({ hash: transactionHash });
}
const [supportedAfter, codeHashInfo] = await Promise.all([
  publicClient.readContract({
    address: manager,
    abi: teeManagerRegistrationAbi,
    functionName: "isCodeHashPlatformSupported",
    args: [extensionId, codeHash, platform],
  }),
  publicClient.readContract({
    address: manager,
    abi: teeManagerRegistrationAbi,
    functionName: "getCodeHashInfo",
    args: [extensionId, codeHash],
  }),
]);
const assertions = {
  ...preflight,
  transactionSucceeded: receipt.status === "success",
  codeHashPlatformSupported: supportedAfter === true,
  onchainVersionMatches: codeHashInfo[0].toLowerCase() === version.toLowerCase(),
  onchainPlatformSetMatches:
    codeHashInfo[1].length === 1 && codeHashInfo[1][0].toLowerCase() === platform.toLowerCase(),
};
if (!Object.values(assertions).every(Boolean)) throw new Error("FCC_CODE_VERSION_VERIFICATION_FAILED");
const evidence = {
  schemaVersion: 1,
  gate: "FCC_CODE_VERSION",
  status: "ALLOWED_SIMULATED_VERSION",
  recordedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  network: { name: "flare-coston2", chainId: 114, blockNumber: receipt.blockNumber.toString() },
  publicIdentifiers: {
    manager,
    extensionId: extensionId.toString(),
    codeHash,
    platform,
    version: versionText,
    transactionHash,
  },
  assertions,
  blockers: ["THREE_PRODUCTION_MACHINES_NOT_REGISTERED", "LIVE_FCC_FOUNDATION_ACTION_NOT_VERIFIED"],
  notes: [
    "The code hash and platform are read from the signed local proxy info envelope for the simulated Coston2 runtime.",
    "This evidence does not claim hardware attestation, a registered machine, production status, or Gate A pass.",
    "No private key, API key, proxy signature, attestation body, TEE public key, or bid data is recorded.",
  ],
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({
  status: evidence.status,
  extensionId: extensionId.toString(),
  codeHash,
  platform,
  version: versionText,
  transactionHash,
  assertions,
  evidence: "evidence/coston2/fcc-code-version.json",
}, null, 2));
