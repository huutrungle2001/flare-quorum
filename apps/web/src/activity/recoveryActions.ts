import { createViemHandleClient } from "@iexec-nox/handle";
import marketAbiJson from "@veilbid/chain-bindings/abis/VeilBidMarket";
import deployment from "@veilbid/chain-bindings/addresses/sepolia.release";
import {
  createPublicClient,
  http,
  type Abi,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { defaultSepoliaRpcUrl } from "../public-market/loadPublicMarket";
import { waitForPublicDecryption } from "../transactions/publicDecryption";
import {
  removeRecoveryRecord,
  saveRecoveryRecord,
  type RecoveryRecord,
} from "./recoveryStore";

const marketAbi = marketAbiJson as Abi;
const marketAddress = deployment.contracts.VeilBidMarket.address as Address;

interface TenderRecoveryView {
  status: number;
  fundingCheckHandle: Hex;
  encryptedWinnerBidIdHandle: Hex;
}

export type RecoveryStage =
  | "reading"
  | "closing"
  | "waiting-close"
  | "requesting-proof"
  | "simulating"
  | "signing"
  | "confirming"
  | "resolved";

function parseTenderView(value: unknown): TenderRecoveryView {
  if (!value || typeof value !== "object") {
    throw new Error("Tender recovery state is malformed.");
  }
  const candidate = value as Partial<TenderRecoveryView>;
  if (
    typeof candidate.status !== "number" ||
    typeof candidate.fundingCheckHandle !== "string" ||
    typeof candidate.encryptedWinnerBidIdHandle !== "string"
  ) {
    throw new Error("Tender recovery handles are unavailable.");
  }
  return candidate as TenderRecoveryView;
}

function terminalFor(kind: RecoveryRecord["kind"], status: number) {
  return kind === "funding"
    ? status !== 0
    : status === 3 || status === 4 || status === 5;
}

export async function resumeRecovery({
  record,
  walletClient,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  record: RecoveryRecord;
  walletClient: WalletClient;
  account: Address;
  onStage: (stage: RecoveryStage) => void;
  rpcUrl?: string;
}) {
  const tenderId = BigInt(record.tenderId);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  onStage("reading");
  let tender = parseTenderView(
    await publicClient.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: "getTender",
      args: [tenderId],
    }),
  );
  if (terminalFor(record.kind, tender.status)) {
    removeRecoveryRecord(record.kind, tenderId);
    onStage("resolved");
    return { transactionHash: null, alreadyResolved: true };
  }
  if (
    (record.kind === "funding" && tender.status !== 0) ||
    (record.kind === "winner" && tender.status !== 2)
  ) {
    throw new Error(
      record.kind === "winner"
        ? "Tender must be closed before winner-proof recovery."
        : "Tender is no longer funding-pending.",
    );
  }

  onStage("requesting-proof");
  const handleClient = await createViemHandleClient(walletClient);
  const publicResult = await waitForPublicDecryption(
    handleClient,
    record.kind === "funding"
      ? tender.fundingCheckHandle
      : tender.encryptedWinnerBidIdHandle,
  );
  onStage("simulating");
  const functionName =
    record.kind === "funding" ? "confirmTenderFunding" : "finalizeTender";
  const simulation = await publicClient.simulateContract({
    account,
    address: marketAddress,
    abi: marketAbi,
    functionName,
    args: [tenderId, publicResult.decryptionProof],
  });
  onStage("signing");
  const transactionHash = await walletClient.writeContract(simulation.request);
  onStage("confirming");
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (receipt.status !== "success") {
    throw new Error(`${functionName} reverted.`);
  }

  tender = parseTenderView(
    await publicClient.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: "getTender",
      args: [tenderId],
    }),
  );
  if (!terminalFor(record.kind, tender.status)) {
    throw new Error("Recovery transaction did not reach the expected state.");
  }
  removeRecoveryRecord(record.kind, tenderId);
  onStage("resolved");
  return { transactionHash, alreadyResolved: false };
}

export async function closeTenderForRecovery({
  tenderId,
  knownTransactionHash,
  walletClient,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  tenderId: bigint;
  knownTransactionHash: Hex;
  walletClient: WalletClient;
  account: Address;
  onStage: (stage: RecoveryStage) => void;
  rpcUrl?: string;
}) {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  onStage("reading");
  const canClose = await publicClient.readContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: "canClose",
    args: [tenderId],
  });
  if (canClose !== true) {
    const tender = parseTenderView(
      await publicClient.readContract({
        address: marketAddress,
        abi: marketAbi,
        functionName: "getTender",
        args: [tenderId],
      }),
    );
    if (tender.status !== 2) {
      throw new Error("Tender is not currently closeable.");
    }
    return saveRecoveryRecord({
      kind: "winner",
      tenderId,
      triggerTransactionHash: knownTransactionHash,
    });
  }
  onStage("closing");
  const simulation = await publicClient.simulateContract({
    account,
    address: marketAddress,
    abi: marketAbi,
    functionName: "closeTender",
    args: [tenderId],
  });
  onStage("signing");
  const transactionHash = await walletClient.writeContract(simulation.request);
  onStage("waiting-close");
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (receipt.status !== "success") throw new Error("closeTender reverted.");
  return saveRecoveryRecord({
    kind: "winner",
    tenderId,
    triggerTransactionHash: transactionHash,
  });
}

export function recoveryExpectation(kind: RecoveryRecord["kind"], status: number) {
  if (terminalFor(kind, status)) return "resolved";
  if (kind === "funding" && status === 0) return "resume";
  if (kind === "winner" && status === 2) return "resume";
  return "wait";
}
