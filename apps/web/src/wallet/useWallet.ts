import {
  createWalletClient,
  custom,
  getAddress,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  selectedProviderStorageKey,
  subscribeToWalletProviders,
  type WalletProviderDetail,
} from "./eip6963";
import { useToasts } from "../shell/ToastProvider";

export type WalletStatus =
  | "discovering"
  | "disconnected"
  | "connecting"
  | "connected"
  | "wrong-chain"
  | "error";

export interface WalletState {
  status: WalletStatus;
  providers: readonly WalletProviderDetail[];
  selectedProvider: WalletProviderDetail | null;
  account: Address | null;
  chainId: number | null;
  walletClient: WalletClient | null;
  error: string | null;
  sessionRevision: number;
}

const initialState: WalletState = {
  status: "discovering",
  providers: [],
  selectedProvider: null,
  account: null,
  chainId: null,
  walletClient: null,
  error: null,
  sessionRevision: 0,
};

function chainIdNumber(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function accounts(
  provider: EIP1193Provider,
  requestAccess: boolean,
) {
  const result = await provider.request({
    method: requestAccess ? "eth_requestAccounts" : "eth_accounts",
  });
  if (!Array.isArray(result) || typeof result[0] !== "string") return null;
  return getAddress(result[0]);
}

async function currentChain(provider: EIP1193Provider) {
  return chainIdNumber(
    await provider.request({
      method: "eth_chainId",
    }),
  );
}

function connectedState(
  current: WalletState,
  selectedProvider: WalletProviderDetail,
  account: Address,
  chainId: number,
): WalletState {
  const correctChain = chainId === sepolia.id;
  return {
    ...current,
    status: correctChain ? "connected" : "wrong-chain",
    selectedProvider,
    account,
    chainId,
    walletClient: correctChain
      ? createWalletClient({
          account,
          chain: sepolia,
          transport: custom(selectedProvider.provider),
        })
      : null,
    error: null,
  };
}

export function useWallet() {
  const toasts = useToasts();
  const [state, setState] = useState<WalletState>(initialState);
  const reconnectAttempted = useRef(new Set<string>());

  const clearSession = useCallback((status: WalletStatus, error: string | null) => {
    setState((current) => ({
      ...current,
      status,
      account: null,
      chainId: null,
      walletClient: null,
      error,
      sessionRevision: current.sessionRevision + 1,
    }));
  }, []);

  const connect = useCallback(async (detail: WalletProviderDetail) => {
    const toastId = toasts.start(
      "CONNECT WALLET",
      `Waiting for ${detail.info.name} authorization…`,
    );
    let authorizedAccount: Address | null = null;
    let detectedChainId: number | null = null;
    setState((current) => ({
      ...current,
      status: "connecting",
      selectedProvider: detail,
      error: null,
    }));
    try {
      const [account, chainId] = await Promise.all([
        accounts(detail.provider, true),
        currentChain(detail.provider),
      ]);
      if (!account || chainId === null) {
        throw new Error("Wallet did not return an account and chain");
      }
      authorizedAccount = account;
      detectedChainId = chainId;
      localStorage.setItem(selectedProviderStorageKey, detail.info.rdns);

      if (chainId !== sepolia.id) {
        toasts.update(
          toastId,
          `${detail.info.name} authorized. Confirm the switch to Ethereum Sepolia…`,
        );
        await detail.provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: numberToHex(sepolia.id) }],
        });
        detectedChainId = await currentChain(detail.provider);
        if (detectedChainId !== sepolia.id) {
          throw new Error("Wallet did not switch to Ethereum Sepolia");
        }
      }

      setState((current) =>
        connectedState(current, detail, account, sepolia.id),
      );
      toasts.succeed(toastId, `${detail.info.name} connected on Sepolia.`);
    } catch {
      if (authorizedAccount && detectedChainId !== null) {
        setState((current) => ({
          ...connectedState(
            current,
            detail,
            authorizedAccount as Address,
            detectedChainId as number,
          ),
          error: "Confirm the switch to Ethereum Sepolia to enable signing.",
        }));
        toasts.fail(
          toastId,
          "Wallet connected, but the Sepolia switch was rejected or unavailable.",
        );
      } else {
        toasts.fail(toastId, "Wallet connection was rejected or unavailable.");
        clearSession("error", "Wallet connection was rejected or unavailable.");
      }
    }
  }, [clearSession, toasts]);

  const switchToSepolia = useCallback(async () => {
    const detail = state.selectedProvider;
    if (!detail) return;
    const toastId = toasts.start(
      "SWITCH NETWORK",
      "Waiting for the wallet to switch to Ethereum Sepolia…",
    );
    try {
      await detail.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: numberToHex(sepolia.id) }],
      });
      const account = await accounts(detail.provider, false);
      if (!account) throw new Error("Wallet has no connected account");
      setState((current) =>
        connectedState(current, detail, account, sepolia.id),
      );
      toasts.succeed(toastId, "Wallet switched to Ethereum Sepolia.");
    } catch {
      toasts.fail(toastId, "Network switch was rejected or unavailable.");
      setState((current) => ({
        ...current,
        status: "wrong-chain",
        error: "Switch the selected wallet to Ethereum Sepolia.",
      }));
    }
  }, [state.selectedProvider, toasts]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(selectedProviderStorageKey);
    setState((current) => ({
      ...initialState,
      status: "disconnected",
      providers: current.providers,
      sessionRevision: current.sessionRevision + 1,
    }));
  }, []);

  useEffect(
    () =>
      subscribeToWalletProviders((detail) => {
        setState((current) => {
          if (
            current.providers.some(
              (provider) => provider.info.uuid === detail.info.uuid,
            )
          ) {
            return current;
          }
          return {
            ...current,
            status:
              current.status === "discovering"
                ? "disconnected"
                : current.status,
            providers: [...current.providers, detail],
          };
        });

        const remembered = localStorage.getItem(selectedProviderStorageKey);
        if (
          remembered !== detail.info.rdns ||
          reconnectAttempted.current.has(detail.info.uuid)
        ) {
          return;
        }
        reconnectAttempted.current.add(detail.info.uuid);
        void Promise.all([
          accounts(detail.provider, false),
          currentChain(detail.provider),
        ]).then(([account, chainId]) => {
          if (account && chainId !== null) {
            setState((current) =>
              connectedState(current, detail, account, chainId),
            );
          }
        });
      }),
    [],
  );

  useEffect(() => {
    const detail = state.selectedProvider;
    if (!detail) return;
    const provider = detail.provider;
    const onAccountsChanged = (...parameters: unknown[]) => {
      const values = parameters[0];
      if (!Array.isArray(values) || typeof values[0] !== "string") {
        clearSession("disconnected", null);
        return;
      }
      const account = getAddress(values[0]);
      setState((current) =>
        ({
          ...connectedState(
            current,
            detail,
            account,
            current.chainId ?? 0,
          ),
          sessionRevision: current.sessionRevision + 1,
        }),
      );
    };
    const onChainChanged = (...parameters: unknown[]) => {
      const chainId = chainIdNumber(parameters[0]);
      setState((current) =>
        current.account && chainId !== null
          ? {
              ...connectedState(
                current,
                detail,
                current.account,
                chainId,
              ),
              sessionRevision: current.sessionRevision + 1,
            }
          : current,
      );
    };
    const onDisconnect = () => clearSession("disconnected", null);
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    provider.on?.("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [clearSession, state.selectedProvider]);

  return { state, connect, switchToSepolia, disconnect };
}
