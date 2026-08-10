import { createViemHandleClient } from "@iexec-nox/handle";
import marketAbiJson from "@flarequorum/chain-bindings/abis/VeilBidMarket";
import deployment from "@flarequorum/chain-bindings/addresses/sepolia.release";
import {
  createPublicClient,
  http,
  parseUnits,
  type Abi,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { defaultSepoliaRpcUrl } from "../public-market/loadPublicMarket";

const marketAbi = marketAbiJson as Abi;
const marketAddress = deployment.contracts.VeilBidMarket.address as Address;

export type VendorBidStage =
  | "checking"
  | "encrypting"
  | "simulating"
  | "signing"
  | "confirming"
  | "confirmed";

export interface VendorBidResult {
  transactionHash: Hex;
  blockNumber: bigint;
}

export async function readVendorAdmission({
  tenderId,
  account,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  tenderId: bigint;
  account: Address;
  rpcUrl?: string;
}) {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const [approved, submitted] = await Promise.all([
    publicClient.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: "isApprovedVendor",
      args: [tenderId, account],
    }),
    publicClient.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: "hasSubmittedBid",
      args: [tenderId, account],
    }),
  ]);
  return { approved: approved === true, submitted: submitted === true };
}

export function parseVendorPrice(value: string, ceiling: bigint) {
  const normalized = value.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(normalized)) {
    throw new Error("Enter a positive vUSDC price with at most 6 decimals.");
  }
  const price = parseUnits(normalized, 6);
  if (price === 0n) throw new Error("Bid price must be greater than zero.");
  if (price > ceiling) {
    throw new Error("Bid price cannot exceed the public ceiling.");
  }
  return price;
}

export async function submitVendorBid({
  walletClient,
  account,
  tenderId,
  publicCeiling,
  bidDeadline,
  priceInput,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  walletClient: WalletClient;
  account: Address;
  tenderId: bigint;
  publicCeiling: bigint;
  bidDeadline: bigint;
  priceInput: string;
  onStage: (stage: VendorBidStage) => void;
  rpcUrl?: string;
}): Promise<VendorBidResult> {
  const price = parseVendorPrice(priceInput, publicCeiling);
  if (bidDeadline <= BigInt(Math.floor(Date.now() / 1_000))) {
    throw new Error(
      "This tender's bid deadline has passed. Choose another active tender.",
    );
  }
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  onStage("checking");
  const admission = await readVendorAdmission({ tenderId, account, rpcUrl });
  if (!admission.approved) {
    throw new Error("Connected account is not an approved vendor.");
  }
  if (admission.submitted) {
    throw new Error("Connected account already submitted an immutable bid.");
  }

  onStage("encrypting");
  const handleClient = await createViemHandleClient(walletClient);
  const encrypted = await handleClient.encryptInput(
    price,
    "uint256",
    marketAddress,
  );

  onStage("simulating");
  const simulation = await publicClient.simulateContract({
    account,
    address: marketAddress,
    abi: marketAbi,
    functionName: "submitBid",
    args: [tenderId, encrypted.handle, encrypted.handleProof],
  });

  onStage("signing");
  const transactionHash = await walletClient.writeContract(simulation.request);
  onStage("confirming");
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (receipt.status !== "success") {
    throw new Error("Bid transaction reverted.");
  }
  onStage("confirmed");
  return {
    transactionHash,
    blockNumber: receipt.blockNumber,
  };
}
