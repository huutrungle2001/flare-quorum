import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  decodeDeployData,
  getAddress,
  http,
  parseEventLogs,
} from "viem";

import {
  evaluateFoundationRegistration,
  evmKeyType,
  foundationSenderReadAbi,
  teeManagerRegistrationAbi,
} from "../flare/fcc-foundation-registration.mjs";
import { compareMarketRuntime } from "../flare/market-runtime-verifier.mjs";

const root = resolve(import.meta.dirname, "../..");
const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
const foundations = JSON.parse(readFileSync(resolve(root, "tooling/flare/coston2-foundations.json"), "utf8"));
const evidence = JSON.parse(readFileSync(resolve(root, "evidence/coston2/fcc-extension-registration.json"), "utf8"));
const artifact = JSON.parse(readFileSync(
  resolve(root, "packages/flare-contracts/out/VeilBidFoundationSenderV2.sol/VeilBidFoundationSenderV2.json"),
  "utf8",
));
const identifiers = evidence.publicIdentifiers;
const manager = getAddress(identifiers.manager);
const sender = getAddress(identifiers.foundationSender);
const deployer = getAddress(identifiers.deployer);
const extensionId = BigInt(identifiers.extensionId);
if (manager !== getAddress(foundations.contracts.flareTeeManager)) {
  throw new Error("FCC_REGISTRATION_MANAGER_DRIFT");
}
const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }) });
const [
  chainId,
  runtime,
  deploymentReceipt,
  deploymentTransaction,
  registrationReceipt,
  nextPublicExtensionId,
  registeredSender,
  registeredStateVerifier,
  senderChainId,
  senderVersion,
  senderOwner,
  senderRegistry,
  senderMachineRegistry,
  senderExtensionId,
  machineOwnerAllowed,
  walletProjectOwnerAllowed,
  evmKeyTypeSupported,
] = await Promise.all([
  client.getChainId(),
  client.getCode({ address: sender }),
  client.getTransactionReceipt({ hash: identifiers.deploymentTransaction }),
  client.getTransaction({ hash: identifiers.deploymentTransaction }),
  client.getTransactionReceipt({ hash: identifiers.registrationTransaction }),
  client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "nextPublicExtensionId" }),
  client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionInstructionsSender", args: [extensionId] }),
  client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionStateVerifier", args: [extensionId] }),
  client.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "COSTON2_CHAIN_ID" }),
  client.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "FOUNDATION_SENDER_VERSION" }),
  client.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "owner" }),
  client.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "teeExtensionRegistry" }),
  client.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "teeMachineRegistry" }),
  client.readContract({ address: sender, abi: foundationSenderReadAbi, functionName: "getExtensionId" }),
  client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeMachineOwner", args: [extensionId, deployer] }),
  client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeWalletProjectOwner", args: [extensionId, deployer] }),
  client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isKeyTypeSupported", args: [extensionId, evmKeyType] }),
]);
if (!runtime || runtime === "0x") throw new Error("FOUNDATION_V2_RUNTIME_MISSING");
const decoded = decodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, data: deploymentTransaction.input });
if (
  decoded.args?.length !== 2 ||
  decoded.args.some((value) => getAddress(value) !== manager)
) throw new Error("FOUNDATION_V2_CONSTRUCTOR_MISMATCH");
const events = parseEventLogs({
  abi: teeManagerRegistrationAbi,
  logs: registrationReceipt.logs,
  eventName: "TeeExtensionRegistered",
  strict: true,
});
const registeredOwner = events.find((event) => event.args.extensionId === extensionId)?.args.owner;
const runtimeComparison = compareMarketRuntime(artifact, runtime);
const verification = evaluateFoundationRegistration({
  chainId,
  declaredDeployer: foundations.network.declaredDeployer,
  deployer,
  manager,
  sender,
  runtimeComparison,
  deploymentReceipt,
  registrationReceipt,
  extensionId,
  nextPublicExtensionId,
  registeredOwner,
  registeredSender,
  registeredStateVerifier,
  senderChainId,
  senderVersion,
  senderOwner,
  senderRegistry,
  senderMachineRegistry,
  senderExtensionId,
  machineOwnerAllowed,
  walletProjectOwnerAllowed,
  evmKeyTypeSupported,
});
const evidenceMatches = {
  recordedRuntimeHashMatches: identifiers.runtimeHash === runtimeComparison.runtimeHash,
  recordedMaskedRuntimeHashMatches: identifiers.maskedRuntimeHash === runtimeComparison.maskedRuntimeHash,
  artifactMaskedRuntimeHashMatches:
    identifiers.artifactMaskedRuntimeHash === runtimeComparison.artifactMaskedRuntimeHash,
  recordedAssertionsMatch:
    JSON.stringify(evidence.assertions) === JSON.stringify(verification.assertions),
};
if (verification.status !== "PASSED" || !Object.values(evidenceMatches).every(Boolean)) {
  throw new Error("FCC_FOUNDATION_REGISTRATION_VERIFICATION_FAILED");
}
console.log(JSON.stringify({
  status: "VERIFIED_REGISTERED_BOUND_CONFIGURATION_READY",
  chainId,
  foundationSender: sender,
  extensionId: extensionId.toString(),
  runtimeHash: runtimeComparison.runtimeHash,
  assertions: { ...verification.assertions, ...evidenceMatches },
}, null, 2));
