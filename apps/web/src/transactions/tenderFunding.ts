import { createViemHandleClient } from "@iexec-nox/handle";
import marketAbiJson from "@flarequorum/chain-bindings/abis/VeilBidMarket";
import deployment from "@flarequorum/chain-bindings/addresses/sepolia.release";
import {
  decodeEventLog,
  type Abi,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { createResilientSepoliaClient } from "../chain/sepoliaRpc";
import {
  removeRecoveryRecord,
  saveRecoveryRecord,
} from "../activity/recoveryStore";
import { defaultSepoliaRpcUrl } from "../public-market/loadPublicMarket";
import { waitForPublicDecryption } from "./publicDecryption";

const marketAbi = marketAbiJson as Abi;
const marketAddress = deployment.contracts.VeilBidMarket.address as Address;

interface FundingTenderView {
  status: number;
  fundingCheckHandle: Hex;
}

export type FundingConfirmationStage =
  | "reading"
  | "requesting-proof"
  | "simulating"
  | "signing"
  | "confirming"
  | "open"
  | "cancelled";

export interface FundingConfirmationResult {
  tenderId: bigint;
  status: "open" | "cancelled";
  transactionHash: Hex | null;
  alreadyResolved: boolean;
}

function parseFundingTender(value: unknown): FundingTenderView {
  if (!value || typeof value !== "object") {
    throw new Error("Tender funding state is malformed.");
  }
  const candidate = value as Partial<FundingTenderView>;
  if (
    typeof candidate.status !== "number" ||
    typeof candidate.fundingCheckHandle !== "string"
  ) {
    throw new Error("Tender funding handle is unavailable.");
  }
  return candidate as FundingTenderView;
}

export async function findCreatedTenderId(
  transactionHash: Hex,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
) {
  const client = createResilientSepoliaClient(rpcUrl);
  const receipt = await client.getTransactionReceipt({ hash: transactionHash });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== marketAddress.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi: marketAbi,
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      if (event.eventName !== "TenderCreated") continue;
      const tenderId = (event.args as { tenderId?: unknown }).tenderId;
      if (typeof tenderId === "bigint") return tenderId;
    } catch {
      // Ignore unrelated Market logs in the same Safe execution receipt.
    }
  }
  throw new Error("TenderCreated event is not indexed for this transaction yet.");
}

export async function confirmCreatedTenderFunding({
  tenderId,
  triggerTransactionHash,
  walletClient,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  tenderId: bigint;
  triggerTransactionHash: Hex;
  walletClient: WalletClient;
  account: Address;
  onStage: (stage: FundingConfirmationStage) => void;
  rpcUrl?: string;
}): Promise<FundingConfirmationResult> {
  const recovery = saveRecoveryRecord({
    kind: "funding",
    tenderId,
    triggerTransactionHash,
  });
  const client = createResilientSepoliaClient(rpcUrl);
  onStage("reading");
  let tender = parseFundingTender(
    await client.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: "getTender",
      args: [tenderId],
    }),
  );
  if (tender.status === 1 || tender.status === 5) {
    removeRecoveryRecord(recovery.kind, tenderId);
    const status = tender.status === 1 ? "open" : "cancelled";
    onStage(status);
    return { tenderId, status, transactionHash: null, alreadyResolved: true };
  }
  if (tender.status !== 0) {
    throw new Error("Tender is no longer waiting for funding confirmation.");
  }

  onStage("requesting-proof");
  const handleClient = await createViemHandleClient(walletClient);
  const publicResult = await waitForPublicDecryption(
    handleClient,
    tender.fundingCheckHandle,
    { attempts: 20, delayMs: 3_000 },
  );
  let transactionHash: Hex;
  try {
    onStage("simulating");
    const simulation = await client.simulateContract({
      account,
      address: marketAddress,
      abi: marketAbi,
      functionName: "confirmTenderFunding",
      args: [tenderId, publicResult.decryptionProof],
    });
    onStage("signing");
    transactionHash = await walletClient.writeContract(simulation.request);
    onStage("confirming");
    const receipt = await client.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") {
      throw new Error("Funding confirmation transaction reverted.");
    }
  } catch (cause) {
    tender = parseFundingTender(
      await client.readContract({
        address: marketAddress,
        abi: marketAbi,
        functionName: "getTender",
        args: [tenderId],
      }),
    );
    if (tender.status === 1 || tender.status === 5) {
      removeRecoveryRecord(recovery.kind, tenderId);
      const status = tender.status === 1 ? "open" : "cancelled";
      onStage(status);
      return {
        tenderId,
        status,
        transactionHash: null,
        alreadyResolved: true,
      };
    }
    throw cause;
  }
  tender = parseFundingTender(
    await client.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: "getTender",
      args: [tenderId],
    }),
  );
  if (tender.status !== 1 && tender.status !== 5) {
    throw new Error("Funding confirmation did not resolve the tender.");
  }
  removeRecoveryRecord(recovery.kind, tenderId);
  const status = tender.status === 1 ? "open" : "cancelled";
  onStage(status);
  return {
    tenderId,
    status,
    transactionHash,
    alreadyResolved: false,
  };
}
