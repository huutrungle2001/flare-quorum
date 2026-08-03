import marketAbiJson from "@veilbid/chain-bindings/abis/VeilBidMarket";
import deployment from "@veilbid/chain-bindings/addresses/sepolia.release";
import {
  createPublicClient,
  http,
  isAddress,
  type Abi,
  type Address,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { defaultSepoliaRpcUrl } from "../public-market/loadPublicMarket";

const marketAbi = marketAbiJson as Abi;
const marketAddress = deployment.contracts.VeilBidMarket.address as Address;
export type ViewerGrantStage = "simulating" | "signing" | "confirming";

export async function grantStoredBidViewer({
  walletClient,
  account,
  tenderId,
  bidId,
  viewer,
  onStage = () => undefined,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  walletClient: WalletClient;
  account: Address;
  tenderId: bigint;
  bidId: bigint;
  viewer: string;
  onStage?: (stage: ViewerGrantStage) => void;
  rpcUrl?: string;
}) {
  if (!isAddress(viewer)) throw new Error("Viewer must be a valid nonzero address.");
  if (/^0x0{40}$/i.test(viewer)) throw new Error("Viewer must be a valid nonzero address.");
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  onStage("simulating");
  const simulation = await publicClient.simulateContract({
    account,
    address: marketAddress,
    abi: marketAbi,
    functionName: "grantBidViewer",
    args: [tenderId, bidId, viewer],
  });
  onStage("signing");
  const transactionHash = await walletClient.writeContract(simulation.request);
  onStage("confirming");
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (receipt.status !== "success") throw new Error("Viewer grant reverted.");
  return transactionHash;
}
