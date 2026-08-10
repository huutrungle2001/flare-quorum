import tokenAbiJson from "@flarequorum/chain-bindings/abis/VeilBidTestUSDC";
import wrapperAbiJson from "@flarequorum/chain-bindings/abis/VeilBidConfidentialUSDC";
import deployment from "@flarequorum/chain-bindings/addresses/sepolia.release";
import { createViemHandleClient } from "@iexec-nox/handle";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatUnits,
  parseUnits,
  type Abi,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { createResilientSepoliaClient } from "../chain/sepoliaRpc";
import { defaultSepoliaRpcUrl } from "../public-market/loadPublicMarket";
import { ContextHelp } from "../shell/ContextHelp";
import { useToasts } from "../shell/ToastProvider";
import {
  finalizeWalletUnwrap,
  findPendingWalletUnwrap,
  requestWalletUnwrap,
  type WalletUnwrapStage,
} from "../transactions/walletUnwrap";
import type { WalletController } from "./WalletPanel";

const tokenAbi = tokenAbiJson as Abi;
const wrapperAbi = wrapperAbiJson as Abi;
const tokenAddress = deployment.contracts.VeilBidTestUSDC.address as Address;
const wrapperAddress = deployment.contracts
  .VeilBidConfidentialUSDC.address as Address;
const zeroHandle = `0x${"00".repeat(32)}` as Hex;

const wrapToastLabel: Record<WrapStage, string> = {
  checking: "Checking Test USDC balance and wrapper allowance…",
  approving: "Waiting for the approval signature and confirmation…",
  wrapping: "Waiting for the wrap signature and confirmation…",
};

const unwrapToastLabel: Record<WalletUnwrapStage, string> = {
  encrypting: "Encrypting the custom vcUSDC amount…",
  "signing-request": "Confirm the unwrap request in your wallet…",
  "confirming-request": "Waiting for the unwrap request confirmation…",
  "requesting-proof": "Waiting for the public Nox unwrap proof…",
  "signing-finalization": "Confirm public unwrap finalization in your wallet…",
  "confirming-finalization": "Waiting for Test USDC release confirmation…",
};

export type ConfidentialBalanceState =
  | "encrypted"
  | "none"
  | "unavailable";

export interface WalletBalances {
  eth: bigint;
  testUsdc: bigint;
  confidential: ConfidentialBalanceState;
  confidentialHandle: Hex | null;
}

export type BalanceLoader = (account: Address) => Promise<WalletBalances>;
export type FaucetRequester = (
  walletClient: WalletClient,
  account: Address,
) => Promise<void>;
export type BalanceRevealer = (
  walletClient: WalletClient,
  handle: Hex,
) => Promise<bigint>;
export type WrapStage = "checking" | "approving" | "wrapping";
export type BalanceWrapper = (
  walletClient: WalletClient,
  account: Address,
  amount: bigint,
  onStage: (stage: WrapStage) => void,
) => Promise<void>;
type BalanceMessage = {
  kind: "error" | "status";
  text: string;
};

function compactAmount(value: bigint, decimals: number, precision: number) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const visibleFraction = fraction
    .slice(0, precision)
    .replace(/0+$/, "");
  return visibleFraction ? `${whole}.${visibleFraction}` : whole;
}

export async function readWalletBalances(
  account: Address,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
): Promise<WalletBalances> {
  const client = createResilientSepoliaClient(rpcUrl);
  const [eth, testUsdc, confidentialResult] = await Promise.all([
    client.getBalance({ address: account }),
    client.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [account],
    }),
    client
      .readContract({
        address: wrapperAddress,
        abi: wrapperAbi,
        functionName: "confidentialBalanceOf",
        args: [account],
      })
      .then((handle) =>
        typeof handle === "string" && handle !== zeroHandle
          ? {
              state: "encrypted" as const,
              handle: handle as Hex,
            }
          : {
              state: "none" as const,
              handle: null,
            },
      )
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : "";
        return message.includes("ERC7984ZeroBalance")
          ? {
              state: "none" as const,
              handle: null,
            }
          : {
              state: "unavailable" as const,
              handle: null,
            };
      }),
  ]);
  if (typeof testUsdc !== "bigint") {
    throw new Error("Test USDC balance response is malformed.");
  }
  return {
    eth,
    testUsdc,
    confidential: confidentialResult.state,
    confidentialHandle: confidentialResult.handle,
  };
}

export async function revealConfidentialBalance(
  walletClient: WalletClient,
  handle: Hex,
) {
  const handleClient = await createViemHandleClient(walletClient);
  const revealed = await handleClient.decrypt(handle as never);
  if (typeof revealed.value !== "bigint") {
    throw new Error("Confidential balance response is malformed.");
  }
  return revealed.value;
}

export async function requestTestUsdc(
  walletClient: WalletClient,
  account: Address,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
) {
  const client = createResilientSepoliaClient(rpcUrl);
  const simulation = await client.simulateContract({
    account,
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "faucet",
  });
  const hash = await walletClient.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Test USDC faucet transaction reverted.");
  }
}

export function parseWrapAmount(input: string) {
  const normalized = input.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(normalized)) {
    throw new Error("Enter a positive amount with at most 6 decimals.");
  }
  const amount = parseUnits(normalized, 6);
  if (amount === 0n) {
    throw new Error("Wrap amount must be greater than zero.");
  }
  return amount;
}

export function parseUnwrapAmount(input: string) {
  const normalized = input.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(normalized)) {
    throw new Error("Enter a positive amount with at most 6 decimals.");
  }
  const amount = parseUnits(normalized, 6);
  if (amount === 0n) {
    throw new Error("Unwrap amount must be greater than zero.");
  }
  return amount;
}

export async function wrapTestUsdc(
  walletClient: WalletClient,
  account: Address,
  amount: bigint,
  onStage: (stage: WrapStage) => void,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
) {
  if (amount <= 0n) throw new Error("Wrap amount must be positive.");
  const client = createResilientSepoliaClient(rpcUrl);
  const transact = async (
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ) => {
    const simulation = await client.simulateContract({
      account,
      address,
      abi,
      functionName,
      args,
    });
    const hash = await walletClient.writeContract(simulation.request);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${functionName} reverted.`);
    }
  };
  const [balance, allowance] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [account],
    }),
    client.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "allowance",
      args: [account, wrapperAddress],
    }),
  ]);
  if (typeof balance !== "bigint" || balance < amount) {
    throw new Error("Insufficient Test USDC balance.");
  }
  if (typeof allowance !== "bigint" || allowance < amount) {
    onStage("approving");
    await transact(tokenAddress, tokenAbi, "approve", [
      wrapperAddress,
      amount,
    ]);
  }
  onStage("wrapping");
  await transact(wrapperAddress, wrapperAbi, "wrap", [account, amount]);
}

export function WalletBalancePanel({
  wallet,
  loadBalances = readWalletBalances,
  requestFaucet = requestTestUsdc,
  revealBalance = revealConfidentialBalance,
  requestWrap = wrapTestUsdc,
  requestUnwrap = requestWalletUnwrap,
  finalizeUnwrap = finalizeWalletUnwrap,
  findPendingUnwrap = findPendingWalletUnwrap,
}: {
  wallet: WalletController;
  loadBalances?: BalanceLoader;
  requestFaucet?: FaucetRequester;
  revealBalance?: BalanceRevealer;
  requestWrap?: BalanceWrapper;
  requestUnwrap?: typeof requestWalletUnwrap;
  finalizeUnwrap?: typeof finalizeWalletUnwrap;
  findPendingUnwrap?: typeof findPendingWalletUnwrap;
}) {
  const toasts = useToasts();
  const { state } = wallet;
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [faucetPending, setFaucetPending] = useState(false);
  const [wrapExpanded, setWrapExpanded] = useState(false);
  const [wrapAmount, setWrapAmount] = useState("");
  const [wrapStage, setWrapStage] = useState<WrapStage | null>(null);
  const [unwrapExpanded, setUnwrapExpanded] = useState(false);
  const [unwrapAmount, setUnwrapAmount] = useState("");
  const [unwrapFullBalance, setUnwrapFullBalance] = useState(false);
  const [unwrapStage, setUnwrapStage] = useState<WalletUnwrapStage | null>(null);
  const [pendingUnwrapHandle, setPendingUnwrapHandle] = useState<Hex | null>(null);
  const [pendingUnwrapCheck, setPendingUnwrapCheck] = useState(false);
  const [revealPending, setRevealPending] = useState(false);
  const [revealedBalance, setRevealedBalance] = useState<bigint | null>(
    null,
  );
  const [revealError, setRevealError] = useState<string | null>(null);
  const [message, setMessage] = useState<BalanceMessage | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const revealRequestId = useRef(0);
  const walletActionRequestId = useRef(0);
  const unwrapRecoveryRequestId = useRef(0);
  const activeToastIds = useRef(new Set<string>());
  const connected =
    state.status === "connected" &&
    state.account &&
    state.walletClient;

  const refresh = useCallback(async () => {
    if (!state.account || state.status !== "connected") return;
    revealRequestId.current += 1;
    setRevealedBalance(null);
    setRevealPending(false);
    setRevealError(null);
    setStatus("loading");
    setMessage(null);
    try {
      setBalances(await loadBalances(state.account));
      setStatus("ready");
    } catch {
      setBalances(null);
      setStatus("error");
    }
  }, [loadBalances, state.account, state.status]);

  useEffect(() => {
    walletActionRequestId.current += 1;
    for (const toastId of activeToastIds.current) {
      toasts.dismiss(toastId);
    }
    activeToastIds.current.clear();
    unwrapRecoveryRequestId.current += 1;
    setUnwrapExpanded(false);
    setUnwrapAmount("");
    setUnwrapFullBalance(false);
    setUnwrapStage(null);
    setPendingUnwrapHandle(null);
    setPendingUnwrapCheck(false);
    if (!connected) {
      revealRequestId.current += 1;
      setBalances(null);
      setStatus("idle");
      setFaucetPending(false);
      setRevealPending(false);
      setRevealedBalance(null);
      setRevealError(null);
      setWrapExpanded(false);
      setWrapAmount("");
      setWrapStage(null);
      setMessage(null);
      return;
    }
    void refresh();
  }, [connected, refresh, state.sessionRevision, toasts]);

  async function faucet() {
    if (!connected) return;
    const toastId = toasts.start(
      "GET TEST USDC",
      "Simulating the faucet request and waiting for your wallet…",
    );
    activeToastIds.current.add(toastId);
    const requestId = walletActionRequestId.current + 1;
    walletActionRequestId.current = requestId;
    setFaucetPending(true);
    setMessage(null);
    try {
      await requestFaucet(state.walletClient!, state.account!);
      if (walletActionRequestId.current !== requestId) return;
      await refresh();
      setMessage({
        kind: "status",
        text: "10,000 test USDC received.",
      });
      activeToastIds.current.delete(toastId);
      toasts.succeed(toastId, "10,000 Test USDC confirmed on Sepolia.");
    } catch {
      if (walletActionRequestId.current === requestId) {
        setMessage({
          kind: "error",
          text: "Faucet transaction was rejected or failed.",
        });
        activeToastIds.current.delete(toastId);
        toasts.fail(toastId, "Faucet request was rejected or failed.");
      }
    } finally {
      if (walletActionRequestId.current === requestId) {
        setFaucetPending(false);
      }
    }
  }

  async function reveal() {
    if (
      !connected ||
      !balances?.confidentialHandle ||
      balances.confidential !== "encrypted"
    ) {
      return;
    }
    const toastId = toasts.start(
      "REVEAL vcUSDC",
      "Waiting for wallet authorization and private decryption…",
    );
    activeToastIds.current.add(toastId);
    const requestId = revealRequestId.current + 1;
    revealRequestId.current = requestId;
    setRevealPending(true);
    setRevealError(null);
    try {
      const value = await revealBalance(
        state.walletClient!,
        balances.confidentialHandle,
      );
      if (revealRequestId.current === requestId) {
        setRevealedBalance(value);
        activeToastIds.current.delete(toastId);
        toasts.succeed(
          toastId,
          "vcUSDC revealed in this browser session only.",
        );
      }
    } catch {
      if (revealRequestId.current === requestId) {
        setRevealError(
          "Balance reveal was rejected or is unavailable.",
        );
        activeToastIds.current.delete(toastId);
        toasts.fail(
          toastId,
          "Balance reveal was rejected or unavailable.",
        );
      }
    } finally {
      if (revealRequestId.current === requestId) {
        setRevealPending(false);
      }
    }
  }

  async function wrap(event: React.FormEvent) {
    event.preventDefault();
    if (!connected || !balances) return;
    setMessage(null);
    let amount: bigint;
    try {
      amount = parseWrapAmount(wrapAmount);
    } catch (cause) {
      setMessage({
        kind: "error",
        text:
          cause instanceof Error
            ? cause.message
            : "Wrap amount is invalid.",
      });
      return;
    }
    if (amount > balances.testUsdc) {
      setMessage({
        kind: "error",
        text: "Wrap amount exceeds the available Test USDC balance.",
      });
      return;
    }
    const requestId = walletActionRequestId.current + 1;
    walletActionRequestId.current = requestId;
    const toastId = toasts.startStack(
      "WRAP TO vcUSDC",
      wrapToastLabel.checking,
    );
    activeToastIds.current.add(toastId);
    setWrapStage("checking");
    try {
      await requestWrap(
        state.walletClient!,
        state.account!,
        amount,
        (stage) => {
          if (walletActionRequestId.current === requestId) {
            setWrapStage(stage);
            toasts.update(toastId, wrapToastLabel[stage]);
          }
        },
      );
      if (walletActionRequestId.current !== requestId) return;
      await refresh();
      setWrapAmount("");
      setWrapExpanded(false);
      setMessage({
        kind: "status",
        text: `${compactAmount(amount, 6, 6)} Test USDC wrapped to vcUSDC.`,
      });
      activeToastIds.current.delete(toastId);
      toasts.succeed(
        toastId,
        `${compactAmount(amount, 6, 6)} Test USDC wrapped successfully.`,
      );
    } catch {
      if (walletActionRequestId.current === requestId) {
        setMessage({
          kind: "error",
          text: "Wrap transaction was rejected or failed.",
        });
        activeToastIds.current.delete(toastId);
        toasts.fail(toastId, "Wrap transaction was rejected or failed.");
      }
    } finally {
      if (walletActionRequestId.current === requestId) {
        setWrapStage(null);
      }
    }
  }

  async function toggleUnwrap() {
    if (unwrapExpanded) {
      unwrapRecoveryRequestId.current += 1;
      setUnwrapExpanded(false);
      setPendingUnwrapCheck(false);
      setMessage(null);
      return;
    }
    if (!connected) return;
    setWrapExpanded(false);
    setUnwrapExpanded(true);
    setMessage(null);
    const requestId = unwrapRecoveryRequestId.current + 1;
    unwrapRecoveryRequestId.current = requestId;
    setPendingUnwrapCheck(true);
    try {
      const handle = await findPendingUnwrap(state.account!);
      if (unwrapRecoveryRequestId.current === requestId) {
        setPendingUnwrapHandle(handle);
      }
    } catch {
      if (unwrapRecoveryRequestId.current === requestId) {
        setMessage({
          kind: "error",
          text: "Pending unwrap history is temporarily unavailable. You can still start a new unwrap if vcUSDC is available.",
        });
      }
    } finally {
      if (unwrapRecoveryRequestId.current === requestId) {
        setPendingUnwrapCheck(false);
      }
    }
  }

  async function unwrap(event: React.FormEvent) {
    event.preventDefault();
    if (!connected || !balances || pendingUnwrapCheck) return;
    setMessage(null);
    let requestHandle = pendingUnwrapHandle;
    let input:
      | { mode: "full"; balanceHandle: Hex }
      | { mode: "custom"; amount: bigint }
      | null = null;

    if (!requestHandle) {
      if (
        balances.confidential !== "encrypted" ||
        !balances.confidentialHandle
      ) {
        setMessage({
          kind: "error",
          text: "No confidential vcUSDC balance is available to unwrap.",
        });
        return;
      }
      if (unwrapFullBalance) {
        input = {
          mode: "full",
          balanceHandle: balances.confidentialHandle,
        };
      } else {
        if (revealedBalance === null) {
          setMessage({
            kind: "error",
            text: "Reveal the current vcUSDC balance before entering a custom amount, or choose FULL.",
          });
          return;
        }
        let amount: bigint;
        try {
          amount = parseUnwrapAmount(unwrapAmount);
        } catch (cause) {
          setMessage({
            kind: "error",
            text:
              cause instanceof Error
                ? cause.message
                : "Unwrap amount is invalid.",
          });
          return;
        }
        if (amount >= revealedBalance) {
          setMessage({
            kind: "error",
            text: "Custom unwrap must be smaller than the revealed balance. Choose FULL to unwrap everything.",
          });
          return;
        }
        input = { mode: "custom", amount };
      }
    }

    const toastId = toasts.startStack(
      "UNWRAP vcUSDC",
      requestHandle
        ? unwrapToastLabel["requesting-proof"]
        : input?.mode === "custom"
          ? unwrapToastLabel.encrypting
          : unwrapToastLabel["signing-request"],
    );
    activeToastIds.current.add(toastId);
    const requestId = walletActionRequestId.current + 1;
    walletActionRequestId.current = requestId;
    try {
      if (!requestHandle && input) {
        const request = await requestUnwrap(
          state.walletClient!,
          state.account!,
          input,
          (nextStage) => {
            if (walletActionRequestId.current === requestId) {
              setUnwrapStage(nextStage);
              toasts.update(toastId, unwrapToastLabel[nextStage]);
            }
          },
        );
        if (walletActionRequestId.current !== requestId) return;
        requestHandle = request.requestHandle;
        setPendingUnwrapHandle(request.requestHandle);
      }
      if (!requestHandle) throw new Error("Unwrap request is unavailable.");
      const finalized = await finalizeUnwrap(
        state.walletClient!,
        state.account!,
        requestHandle,
        (nextStage) => {
          if (walletActionRequestId.current === requestId) {
            setUnwrapStage(nextStage);
            toasts.update(toastId, unwrapToastLabel[nextStage]);
          }
        },
      );
      if (walletActionRequestId.current !== requestId) return;
      setPendingUnwrapHandle(null);
      setUnwrapAmount("");
      setUnwrapFullBalance(false);
      setUnwrapExpanded(false);
      await refresh();
      setMessage({
        kind: "status",
        text: `${compactAmount(finalized.amount, 6, 6)} vcUSDC unwrapped to public Test USDC.`,
      });
      activeToastIds.current.delete(toastId);
      toasts.succeed(
        toastId,
        `${compactAmount(finalized.amount, 6, 6)} Test USDC released to this wallet.`,
      );
    } catch {
      if (walletActionRequestId.current === requestId) {
        activeToastIds.current.delete(toastId);
        if (requestHandle) {
          setPendingUnwrapHandle(requestHandle);
          setMessage({
            kind: "error",
            text: "The unwrap request is confirmed, but public-proof finalization is still pending. Use FINALIZE PENDING UNWRAP to retry.",
          });
          toasts.fail(
            toastId,
            "Unwrap request confirmed; public-proof finalization is still pending.",
          );
        } else {
          setMessage({
            kind: "error",
            text: "Unwrap was rejected or stopped before an on-chain request was confirmed.",
          });
          toasts.fail(
            toastId,
            "Unwrap stopped before an on-chain request was confirmed.",
          );
        }
      }
    } finally {
      if (walletActionRequestId.current === requestId) {
        setUnwrapStage(null);
      }
    }
  }

  function hideRevealedBalance() {
    revealRequestId.current += 1;
    setRevealPending(false);
    setRevealedBalance(null);
    setRevealError(null);
  }

  const confidentialLabel =
    balances?.confidential === "encrypted"
      ? "ENCRYPTED"
      : balances?.confidential === "none"
        ? "NONE"
        : "UNAVAILABLE";

  return (
    <section
      className="sidebar-balances"
      aria-label="Wallet balances"
      data-mobile-expanded={mobileExpanded}
    >
      <header>
        <strong>BALANCES</strong>
        <div className="balance-header-actions">
          <ContextHelp
            compact
            label="Help for wallet balances"
            title="HOW TO USE BALANCES"
            steps={[
              "SEP ETH pays Sepolia gas; acquire it from a Sepolia faucet if needed.",
              "GET TEST USDC requests demo tokens from the FlareQuorum faucet contract.",
              "WRAP TO vcUSDC converts a chosen Test USDC amount after an ERC-20 approval. EOA Buyer requires enough Test USDC before creation and never calls the faucet automatically.",
              "When vcUSDC shows ENCRYPTED, use the eye and authorize your wallet to reveal it for this session only.",
              "UNWRAP vcUSDC releases public Test USDC to this wallet after an unwrap request and public-proof finalization.",
            ]}
            note="Full unwrap uses the encrypted balance directly; custom unwrap requires a private reveal. The finalized amount and recipient become public."
          />
          <button
            className="balance-refresh"
            type="button"
            onClick={() => void refresh()}
            disabled={!connected || status === "loading"}
            aria-label="Refresh wallet balances"
          >
            ↻
          </button>
          <button
            className="balance-mobile-toggle"
            type="button"
            aria-expanded={mobileExpanded}
            aria-label={mobileExpanded ? "Collapse wallet balances" : "Expand wallet balances"}
            onClick={() => setMobileExpanded((current) => !current)}
          >
            {mobileExpanded ? "−" : "+"}
          </button>
        </div>
      </header>
      {!connected ? (
        <p className="balance-empty">
          {state.status === "wrong-chain"
            ? "SEPOLIA REQUIRED"
            : "CONNECT WALLET"}
        </p>
      ) : status === "loading" && !balances ? (
        <p className="balance-empty" aria-live="polite">READING SEPOLIA…</p>
      ) : status === "error" ? (
        <p className="balance-empty" role="alert">BALANCES UNAVAILABLE</p>
      ) : balances ? (
        <dl>
          <div>
            <dt>SEP ETH</dt>
            <dd>{compactAmount(balances.eth, 18, 4)}</dd>
          </div>
          <div>
            <dt>TEST USDC</dt>
            <dd>{compactAmount(balances.testUsdc, 6, 2)}</dd>
          </div>
          <div>
            <dt>vcUSDC</dt>
            <dd>
              <span className="confidential-balance">
                <span>
                  {revealedBalance === null
                    ? confidentialLabel
                    : compactAmount(revealedBalance, 6, 2)}
                </span>
                {balances.confidential !== "unavailable" && (
                  <button
                    className="balance-reveal"
                    type="button"
                    onClick={() =>
                      revealedBalance === null
                        ? void reveal()
                        : hideRevealedBalance()
                    }
                    disabled={
                      balances.confidential !== "encrypted" ||
                      revealPending ||
                      status === "loading"
                    }
                    aria-label={
                      balances.confidential !== "encrypted"
                        ? "No confidential vcUSDC balance to reveal"
                        : revealedBalance === null
                        ? "Reveal confidential vcUSDC balance"
                        : "Hide confidential vcUSDC balance"
                    }
                    title={
                      balances.confidential !== "encrypted"
                        ? "Wrap Test USDC to create a confidential balance"
                        : revealedBalance === null
                        ? "Reveal with connected wallet"
                        : "Hide balance"
                    }
                  >
                    {revealedBalance === null ? (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                      >
                        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                      >
                        <path d="M3 3 21 21" />
                        <path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a15.7 15.7 0 0 1-2.2 2.8M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6a10.8 10.8 0 0 0 3.3-.5" />
                      </svg>
                    )}
                  </button>
                )}
              </span>
            </dd>
          </div>
        </dl>
      ) : null}
      <button
        className="balance-faucet"
        type="button"
        onClick={() => void faucet()}
        disabled={
          !connected ||
          faucetPending ||
          wrapStage !== null ||
          unwrapStage !== null
        }
      >
        {faucetPending ? "CONFIRMING…" : "GET TEST USDC"}
      </button>
      <button
        className="balance-wrap-toggle"
        type="button"
        aria-expanded={wrapExpanded}
        aria-controls="balance-wrap-form"
        onClick={() => {
          setWrapExpanded((current) => !current);
          unwrapRecoveryRequestId.current += 1;
          setUnwrapExpanded(false);
          setPendingUnwrapCheck(false);
          setMessage(null);
        }}
        disabled={
          !connected ||
          faucetPending ||
          wrapStage !== null ||
          unwrapStage !== null ||
          status === "loading" ||
          balances?.testUsdc === 0n
        }
        title={
          balances?.testUsdc === 0n
            ? "Get Test USDC before wrapping"
            : "Convert Test USDC to confidential vcUSDC"
        }
      >
        {wrapExpanded ? "CANCEL WRAP" : "WRAP TO vcUSDC"}
      </button>
      {wrapExpanded && balances && (
        <form
          className="balance-wrap-form"
          id="balance-wrap-form"
          onSubmit={(event) => void wrap(event)}
        >
          <label htmlFor="balance-wrap-amount">TEST USDC AMOUNT</label>
          <div>
            <input
              id="balance-wrap-amount"
              value={wrapAmount}
              onChange={(event) => setWrapAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              disabled={wrapStage !== null}
              required
            />
            <button
              type="button"
              onClick={() =>
                setWrapAmount(formatUnits(balances.testUsdc, 6))
              }
              disabled={wrapStage !== null}
            >
              MAX
            </button>
          </div>
          <button
            className="balance-wrap-confirm"
            type="submit"
            disabled={wrapStage !== null || wrapAmount.trim() === ""}
          >
            {wrapStage === "checking"
              ? "CHECKING ALLOWANCE…"
              : wrapStage === "approving"
              ? "APPROVE IN WALLET…"
              : wrapStage === "wrapping"
                ? "WRAP IN WALLET…"
                : "APPROVE & WRAP"}
          </button>
          <p>
            Two wallet confirmations may be required. Wrap only what you
            intend to use for testing.
          </p>
        </form>
      )}
      <button
        className="balance-wrap-toggle balance-unwrap-toggle"
        type="button"
        aria-expanded={unwrapExpanded}
        aria-controls="balance-unwrap-form"
        onClick={() => void toggleUnwrap()}
        disabled={
          !connected ||
          faucetPending ||
          wrapStage !== null ||
          unwrapStage !== null ||
          status === "loading"
        }
        title="Convert confidential vcUSDC back to public Test USDC"
      >
        {unwrapExpanded ? "CANCEL UNWRAP" : "UNWRAP vcUSDC"}
      </button>
      {unwrapExpanded && balances && (
        <form
          className="balance-wrap-form balance-unwrap-form"
          id="balance-unwrap-form"
          onSubmit={(event) => void unwrap(event)}
        >
          <label htmlFor="balance-unwrap-amount">vcUSDC AMOUNT</label>
          <div>
            <input
              id="balance-unwrap-amount"
              value={unwrapFullBalance ? "FULL BALANCE" : unwrapAmount}
              onChange={(event) => setUnwrapAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder={
                revealedBalance === null
                  ? "Reveal balance or use Full"
                  : "0.00"
              }
              disabled={
                unwrapStage !== null ||
                pendingUnwrapCheck ||
                pendingUnwrapHandle !== null ||
                unwrapFullBalance ||
                revealedBalance === null
              }
              required={!unwrapFullBalance && pendingUnwrapHandle === null}
            />
            <button
              type="button"
              aria-pressed={unwrapFullBalance}
              onClick={() => {
                setUnwrapFullBalance((current) => !current);
                setUnwrapAmount("");
                setMessage(null);
              }}
              disabled={
                unwrapStage !== null ||
                pendingUnwrapCheck ||
                pendingUnwrapHandle !== null
              }
              title="Use the encrypted full balance without revealing it"
            >
              {unwrapFullBalance ? "FULL ✓" : "FULL"}
            </button>
          </div>
          {!unwrapFullBalance &&
            pendingUnwrapHandle === null &&
            revealedBalance === null && (
              <p>
                Use the eye beside vcUSDC before entering a custom amount, or
                choose Full without revealing the balance.
              </p>
            )}
          {pendingUnwrapCheck && <p>CHECKING PENDING UNWRAP HISTORY…</p>}
          {pendingUnwrapHandle && (
            <p>
              A confirmed unwrap request is waiting for its public proof. No
              new amount or burn transaction is needed.
            </p>
          )}
          <button
            className="balance-wrap-confirm"
            type="submit"
            disabled={
              unwrapStage !== null ||
              pendingUnwrapCheck ||
              (!pendingUnwrapHandle &&
                (balances.confidential !== "encrypted" ||
                  (!unwrapFullBalance &&
                    (revealedBalance === null || unwrapAmount.trim() === ""))))
            }
          >
            {unwrapStage
              ? "UNWRAP IN PROGRESS…"
              : pendingUnwrapHandle
                ? "FINALIZE PENDING UNWRAP"
                : `UNWRAP ${unwrapFullBalance ? "FULL" : "CUSTOM"}`}
          </button>
          <p>
            Recipient: this connected wallet. Finalization makes the amount
            and recipient public; remaining vcUSDC stays confidential.
          </p>
        </form>
      )}
      <p className="balance-note">
        Use the eye to decrypt vcUSDC; the value stays in this browser session
        only. Wrap creates confidential funds; unwrap returns public Test USDC.
      </p>
      {revealError && (
        <p className="balance-message" role="alert">
          {revealError}
        </p>
      )}
      {message && (
        <p
          className="balance-message"
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
