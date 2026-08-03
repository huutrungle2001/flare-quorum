import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, getAddress, http, keccak256 } from "viem";
import { expectedFoundationRuntime } from "../flare/foundation-sender-verifier.mjs";

const root = resolve(import.meta.dirname, "../..");
const rpcUrl = process.env.COSTON2_RPC_URL?.trim();
if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");

const evidence = JSON.parse(readFileSync(resolve(root, "evidence/coston2/gate-a-fcc-result.json"), "utf8"));
const artifact = JSON.parse(readFileSync(resolve(root, "packages/flare-contracts/out/VeilBidFoundationSender.sol/VeilBidFoundationSender.json"), "utf8"));
const sender = getAddress(evidence.publicIdentifiers.foundationSender);
const manager = getAddress(evidence.publicIdentifiers.teeExtensionRegistry);
const expected = expectedFoundationRuntime(artifact, manager);
const client = createPublicClient({ transport: http(rpcUrl) });

const getterAbi = [
  { type: "function", name: "COSTON2_CHAIN_ID", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "teeExtensionRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "teeMachineRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getExtensionId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

const [chainId, code, receipt, registry, machineRegistry, extensionId] = await Promise.all([
  client.getChainId(),
  client.getCode({ address: sender }),
  client.getTransactionReceipt({ hash: evidence.publicIdentifiers.deploymentTransaction }),
  client.readContract({ address: sender, abi: getterAbi, functionName: "teeExtensionRegistry" }),
  client.readContract({ address: sender, abi: getterAbi, functionName: "teeMachineRegistry" }),
  client.readContract({ address: sender, abi: getterAbi, functionName: "getExtensionId" }),
]);
if (!code) throw new Error("FOUNDATION_SENDER_CODE_MISSING");

const assertions = {
  chainIdMatches: chainId === 114,
  transactionSucceeded: receipt.status === "success",
  transactionContractMatches: receipt.contractAddress?.toLowerCase() === sender.toLowerCase(),
  registryBindingMatches: registry.toLowerCase() === manager.toLowerCase(),
  machineRegistryBindingMatches: machineRegistry.toLowerCase() === manager.toLowerCase(),
  runtimeSizeMatches: (code.length - 2) / 2 === expected.size,
  runtimeHashMatches: keccak256(code) === expected.hash,
  evidenceRuntimeHashMatches: evidence.publicIdentifiers.runtimeCodeHash === expected.hash,
  extensionRemainsUnconfigured: extensionId === 0n,
};
if (!Object.values(assertions).every(Boolean)) throw new Error("FOUNDATION_SENDER_VERIFICATION_FAILED");

console.log(JSON.stringify({
  status: "VERIFIED_DEPLOYED_UNREGISTERED",
  chainId,
  blockNumber: receipt.blockNumber.toString(),
  foundationSender: sender,
  runtimeCodeHash: expected.hash,
  assertions,
}));
