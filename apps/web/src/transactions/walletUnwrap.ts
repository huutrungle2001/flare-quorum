import wrapperAbiJson from "@veilbid/chain-bindings/abis/VeilBidConfidentialUSDC";
import deployment from "@veilbid/chain-bindings/addresses/sepolia.release";
import { createViemHandleClient } from "@iexec-nox/handle";
import {
  decodeEventLog,
  getAddress,
  parseAbiItem,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { createResilientSepoliaClient } from "../chain/sepoliaRpc";
import { defaultSepoliaRpcUrl } from "../public-market/loadPublicMarket";
import { waitForPublicDecryption } from "./publicDecryption";

const wrapperAbi = wrapperAbiJson as Abi;
const wrapperDeployment = deployment.contracts.VeilBidConfidentialUSDC;
const wrapperAddress = wrapperDeployment.address as Address;
const wrapperDeploymentBlock = BigInt(wrapperDeployment.deploymentBlock);
const unwrapRequestedEvent = parseAbiItem(
  "event UnwrapRequested(address indexed receiver, bytes32 amount)",
);

export type WalletUnwrapStage =
  | "encrypting"
  | "signing-request"
  | "confirming-request"
  | "requesting-proof"
  | "signing-finalization"
  | "confirming-finalization";

export type WalletUnwrapInput =
  | { mode: "full"; balanceHandle: Hex }
  | { mode: "custom"; amount: bigint };

export interface WalletUnwrapRequest {
  requestHandle: Hex;
  transactionHash: Hex;
}

export interface WalletUnwrapFinalization {
  amount: bigint;
  transactionHash: Hex;
}

export function buildFullWalletUnwrapCall(
  account: Address,
  balanceHandle: Hex,
) {
  return {
    functionName: "unwrap" as const,
    args: [account, account, balanceHandle] as const,
  };
}

export function buildCustomWalletUnwrapCall(
  account: Address,
  encryptedAmountHandle: Hex,
  inputProof: Hex,
) {
  return {
    functionName: "unwrap" as const,
    args: [account, account, encryptedAmountHandle, inputProof] as const,
  };
}

export async function requestWalletUnwrap(
  walletClient: WalletClient,
  account: Address,
  input: WalletUnwrapInput,
  onStage: (stage: WalletUnwrapStage) => void,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
): Promise<WalletUnwrapRequest> {
  const client = createResilientSepoliaClient(rpcUrl);
  let args: readonly unknown[];
  if (input.mode === "full") {
    args = buildFullWalletUnwrapCall(account, input.balanceHandle).args;
  } else {
    if (input.amount <= 0n) throw new Error("Unwrap amount must be positive.");
    onStage("encrypting");
    const handles = await createViemHandleClient(walletClient);
    const encrypted = await handles.encryptInput(
      input.amount,
      "uint256",
      wrapperAddress,
    );
    args = buildCustomWalletUnwrapCall(
      account,
      encrypted.handle,
      encrypted.handleProof,
    ).args;
  }

  onStage("signing-request");
  const simulation = await client.simulateContract({
    account,
    address: wrapperAddress,
    abi: wrapperAbi,
    functionName: "unwrap",
    args,
  });
  const transactionHash = await walletClient.writeContract(simulation.request);
  onStage("confirming-request");
  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (receipt.status !== "success") {
    throw new Error("Unwrap request reverted.");
  }
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== wrapperAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: wrapperAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "UnwrapRequested") continue;
      const requestHandle = (decoded.args as unknown as { amount: Hex }).amount;
      return { requestHandle, transactionHash };
    } catch {
      // Ignore unrelated wrapper logs in the confirmed receipt.
    }
  }
  throw new Error("The confirmed transaction has no unwrap request event.");
}

export async function finalizeWalletUnwrap(
  walletClient: WalletClient,
  account: Address,
  requestHandle: Hex,
  onStage: (stage: WalletUnwrapStage) => void,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
): Promise<WalletUnwrapFinalization> {
  const client = createResilientSepoliaClient(rpcUrl);
  const requester = await client.readContract({
    address: wrapperAddress,
    abi: wrapperAbi,
    functionName: "unwrapRequester",
    args: [requestHandle],
  });
  if (
    typeof requester !== "string" ||
    requester.toLowerCase() === zeroAddress.toLowerCase()
  ) {
    throw new Error("This unwrap request has already been finalized.");
  }

  onStage("requesting-proof");
  const handles = await createViemHandleClient(walletClient);
  const revealed = await waitForPublicDecryption(handles, requestHandle);
  if (typeof revealed.value !== "bigint") {
    throw new Error("Public unwrap amount response is malformed.");
  }

  onStage("signing-finalization");
  const simulation = await client.simulateContract({
    account,
    address: wrapperAddress,
    abi: wrapperAbi,
    functionName: "finalizeUnwrap",
    args: [requestHandle, revealed.decryptionProof],
  });
  const transactionHash = await walletClient.writeContract(simulation.request);
  onStage("confirming-finalization");
  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (receipt.status !== "success") {
    throw new Error("Unwrap finalization reverted.");
  }
  return { amount: revealed.value, transactionHash };
}

export async function findPendingWalletUnwrap(
  recipient: Address,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
): Promise<Hex | null> {
  const client = createResilientSepoliaClient(rpcUrl);
  const latestBlock = await client.getBlockNumber();
  const chunkSize = 999n;
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (
    let fromBlock = wrapperDeploymentBlock;
    fromBlock <= latestBlock;
    fromBlock += chunkSize + 1n
  ) {
    const toBlock =
      fromBlock + chunkSize < latestBlock
        ? fromBlock + chunkSize
        : latestBlock;
    ranges.push({ fromBlock, toBlock });
  }
  const logs = (
    await Promise.all(
      ranges.map(({ fromBlock, toBlock }) =>
        client.getLogs({
          address: wrapperAddress,
          event: unwrapRequestedEvent,
          args: { receiver: recipient },
          fromBlock,
          toBlock,
        }),
      ),
    )
  ).flat();

  for (const log of logs.reverse()) {
    const requestHandle = log.args.amount;
    if (typeof requestHandle !== "string") continue;
    const requester = await client.readContract({
      address: wrapperAddress,
      abi: wrapperAbi,
      functionName: "unwrapRequester",
      args: [requestHandle],
    });
    if (
      typeof requester === "string" &&
      getAddress(requester) === getAddress(recipient)
    ) {
      return requestHandle;
    }
  }
  return null;
}
