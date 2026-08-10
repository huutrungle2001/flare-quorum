import marketAbiJson from "@flarequorum/chain-bindings/abis/VeilBidMarket";
import tokenAbiJson from "@flarequorum/chain-bindings/abis/VeilBidTestUSDC";
import wrapperAbiJson from "@flarequorum/chain-bindings/abis/VeilBidConfidentialUSDC";
import deployment from "@flarequorum/chain-bindings/addresses/sepolia.release";
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
  keccak256,
  maxUint48,
  parseUnits,
  toBytes,
  type Abi,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { saveRecoveryRecord } from "../activity/recoveryStore";
import { defaultSepoliaRpcUrl } from "../public-market/loadPublicMarket";

const marketAbi = marketAbiJson as Abi;
const tokenAbi = tokenAbiJson as Abi;
const wrapperAbi = wrapperAbiJson as Abi;
const marketAddress = deployment.contracts.VeilBidMarket.address as Address;
const tokenAddress = deployment.contracts.VeilBidTestUSDC.address as Address;
const wrapperAddress = deployment.contracts
  .VeilBidConfidentialUSDC.address as Address;

export type BuyerTenderStage =
  | "approve-wrapper"
  | "wrap"
  | "approve-market"
  | "create"
  | "confirmed";

export interface BuyerTenderDraft {
  metadata: string;
  ceilingInput: string;
  deadlineInput: string;
  vendorInput: string;
}

export interface ParsedBuyerTender {
  metadataHash: Hex;
  publicCeiling: bigint;
  bidDeadline: bigint;
  approvedVendors: Address[];
}

export function parseBuyerTender(
  draft: BuyerTenderDraft,
  now = Date.now(),
): ParsedBuyerTender {
  const metadata = draft.metadata.trim();
  if (metadata.length < 3 || metadata.length > 240) {
    throw new Error("Public metadata must contain 3 to 240 characters.");
  }
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(draft.ceilingInput.trim())) {
    throw new Error("Enter a positive ceiling with at most 6 decimals.");
  }
  const publicCeiling = parseUnits(draft.ceilingInput.trim(), 6);
  if (publicCeiling === 0n) throw new Error("Public ceiling must be positive.");
  const deadlineMilliseconds = Date.parse(draft.deadlineInput);
  if (
    !Number.isFinite(deadlineMilliseconds) ||
    deadlineMilliseconds <= now + 60_000
  ) {
    throw new Error("Bid deadline must be at least one minute in the future.");
  }
  const rawVendors = draft.vendorInput
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (rawVendors.length === 0 || rawVendors.length > 8) {
    throw new Error("Provide between one and eight approved vendors.");
  }
  if (rawVendors.some((value) => !isAddress(value))) {
    throw new Error("Every approved vendor must be a valid address.");
  }
  const approvedVendors = rawVendors.map((value) => getAddress(value));
  if (new Set(approvedVendors.map((value) => value.toLowerCase())).size !== approvedVendors.length) {
    throw new Error("Approved vendor addresses must be unique.");
  }
  return {
    metadataHash: keccak256(toBytes(metadata)),
    publicCeiling,
    bidDeadline: BigInt(Math.floor(deadlineMilliseconds / 1_000)),
    approvedVendors,
  };
}

export function requireTestUsdcBalance(
  balance: unknown,
  publicCeiling: bigint,
) {
  if (typeof balance !== "bigint") {
    throw new Error("Test USDC balance response is malformed.");
  }
  if (balance < publicCeiling) {
    throw new Error(
      "Public ceiling exceeds this wallet's Test USDC balance. Use GET TEST USDC in BALANCES, then try again.",
    );
  }
}

export async function createBuyerTender({
  walletClient,
  account,
  draft,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  walletClient: WalletClient;
  account: Address;
  draft: BuyerTenderDraft;
  onStage: (stage: BuyerTenderStage) => void;
  rpcUrl?: string;
}) {
  const parsed = parseBuyerTender(draft);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const transact = async (
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
  ) => {
    const simulation = await publicClient.simulateContract({
      account,
      address,
      abi,
      functionName,
      args,
    });
    const hash = await walletClient.writeContract(simulation.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted.`);
    return receipt;
  };

  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [account],
  });
  requireTestUsdcBalance(balance, parsed.publicCeiling);
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "allowance",
    args: [account, wrapperAddress],
  });
  if (typeof allowance !== "bigint" || allowance < parsed.publicCeiling) {
    onStage("approve-wrapper");
    await transact(tokenAddress, tokenAbi, "approve", [
      wrapperAddress,
      parsed.publicCeiling,
    ]);
  }
  onStage("wrap");
  await transact(wrapperAddress, wrapperAbi, "wrap", [
    account,
    parsed.publicCeiling,
  ]);

  const operator = await publicClient.readContract({
    address: wrapperAddress,
    abi: wrapperAbi,
    functionName: "isOperator",
    args: [account, marketAddress],
  });
  if (operator !== true) {
    onStage("approve-market");
    await transact(wrapperAddress, wrapperAbi, "setOperator", [
      marketAddress,
      maxUint48,
    ]);
  }

  onStage("create");
  const createReceipt = await transact(marketAddress, marketAbi, "createTender", [
    parsed.metadataHash,
    parsed.publicCeiling,
    parsed.bidDeadline,
    parsed.approvedVendors,
  ]);
  const createdLog = createReceipt.logs
    .filter((log) => log.address.toLowerCase() === marketAddress.toLowerCase())
    .map((log) => {
      try {
        return decodeEventLog({
          abi: marketAbi,
          data: log.data,
          topics: log.topics,
          strict: true,
        });
      } catch {
        return null;
      }
    })
    .find((event) => event?.eventName === "TenderCreated");
  if (!createdLog || !createdLog.args || typeof createdLog.args !== "object") {
    throw new Error("TenderCreated event was not found in the receipt.");
  }
  const tenderId = (createdLog.args as { tenderId?: unknown }).tenderId;
  if (typeof tenderId !== "bigint") throw new Error("Tender ID is malformed.");
  saveRecoveryRecord({
    kind: "funding",
    tenderId,
    triggerTransactionHash: createReceipt.transactionHash,
  });

  onStage("confirmed");
  return {
    tenderId,
    transactionHash: createReceipt.transactionHash,
  };
}
