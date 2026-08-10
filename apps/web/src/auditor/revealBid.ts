import { createViemHandleClient, type HandleClient } from "@iexec-nox/handle";
import marketAbiJson from "@flarequorum/chain-bindings/abis/VeilBidMarket";
import deployment from "@flarequorum/chain-bindings/addresses/sepolia.release";
import {
  formatUnits,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { defaultSepoliaRpcUrl } from "../public-market/loadPublicMarket";
import { createResilientSepoliaClient } from "../chain/sepoliaRpc";

const marketAbi = marketAbiJson as Abi;
const marketAddress = deployment.contracts.VeilBidMarket.address as Address;

interface BidRevealView {
  encryptedPriceHandle: Hex;
}

function parseBid(value: unknown): BidRevealView {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Partial<BidRevealView>).encryptedPriceHandle !== "string"
  ) {
    throw new Error("Stored bid is unavailable.");
  }
  return value as BidRevealView;
}

export async function inspectBidViewer({
  publicClient,
  tenderId,
  bidId,
  account,
}: {
  publicClient: Pick<PublicClient, "readContract">;
  tenderId: bigint;
  bidId: bigint;
  account: Address;
}) {
  return (
    (await publicClient.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: "bidViewableBy",
      args: [tenderId, bidId, account],
    })) === true
  );
}

export async function revealBidWithClients({
  publicClient,
  handleClient,
  tenderId,
  bidId,
  account,
}: {
  publicClient: Pick<PublicClient, "readContract">;
  handleClient: Pick<HandleClient, "decrypt">;
  tenderId: bigint;
  bidId: bigint;
  account: Address;
}) {
  const viewable = await inspectBidViewer({
    publicClient,
    tenderId,
    bidId,
    account,
  });
  if (!viewable) {
    throw new Error("This wallet is not an authorized viewer for that bid.");
  }
  const bid = parseBid(
    await publicClient.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: "getBid",
      args: [tenderId, bidId],
    }),
  );
  const revealed = await handleClient.decrypt(
    bid.encryptedPriceHandle as never,
  );
  return {
    value:
      typeof revealed.value === "bigint"
        ? formatUnits(revealed.value, 6)
        : String(revealed.value),
    solidityType: revealed.solidityType,
  };
}

export async function revealAuthorizedBid({
  walletClient,
  tenderId,
  bidId,
  account,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  walletClient: WalletClient;
  tenderId: bigint;
  bidId: bigint;
  account: Address;
  rpcUrl?: string;
}) {
  const publicClient = createResilientSepoliaClient(rpcUrl);
  const handleClient = await createViemHandleClient(walletClient);
  return revealBidWithClients({
    publicClient,
    handleClient,
    tenderId,
    bidId,
    account,
  });
}

export function createAuditorPublicClient(
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
) {
  return createResilientSepoliaClient(rpcUrl);
}
