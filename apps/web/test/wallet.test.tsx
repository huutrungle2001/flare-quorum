import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EIP1193Provider } from "viem";
import { selectedProviderStorageKey } from "../src/wallet/eip6963";
import { useWallet } from "../src/wallet/useWallet";

const account = "0x1111111111111111111111111111111111111111";
const secondAccount = "0x2222222222222222222222222222222222222222";

class TestProvider {
  chainId = "0xaa36a7";
  switchChainId = "0xaa36a7";
  accounts = [account];
  rejectSwitch = false;
  unknownChain = false;
  addedChain = false;
  requestedMethods: string[] = [];
  listeners = new Map<string, Set<(...parameters: unknown[]) => void>>();

  request = async ({ method }: { method: string }) => {
    this.requestedMethods.push(method);
    if (method === "eth_accounts" || method === "eth_requestAccounts") {
      return this.accounts;
    }
    if (method === "eth_chainId") return this.chainId;
    if (method === "wallet_switchEthereumChain") {
      if (this.rejectSwitch) throw new Error("Switch rejected");
      if (this.unknownChain && !this.addedChain) {
        throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
      }
      this.chainId = this.switchChainId;
      this.emit("chainChanged", this.chainId);
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      this.addedChain = true;
      return null;
    }
    throw new Error(`Unsupported method: ${method}`);
  };

  on = (event: string, listener: (...parameters: unknown[]) => void) => {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  };

  removeListener = (
    event: string,
    listener: (...parameters: unknown[]) => void,
  ) => {
    this.listeners.get(event)?.delete(listener);
  };

  emit(event: string, ...parameters: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...parameters);
    }
  }
}

function announce(provider: TestProvider) {
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: {
        info: {
          uuid: "test-wallet",
          name: "Test Wallet",
          icon: "",
          rdns: "test.wallet",
        },
        provider: provider as EIP1193Provider,
      },
    }),
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("provider-aware wallet session", () => {
  it("discovers an EIP-6963 provider and connects only on Sepolia", async () => {
    const provider = new TestProvider();
    const { result } = renderHook(() => useWallet());

    act(() => announce(provider));
    await waitFor(() => expect(result.current.state.providers).toHaveLength(1));
    await act(() => result.current.connect(result.current.state.providers[0]));

    expect(result.current.state.status).toBe("connected");
    expect(result.current.state.account).toBe(account);
    expect(result.current.state.chainId).toBe(11155111);
    expect(result.current.state.walletClient).not.toBeNull();
    expect(localStorage.getItem(selectedProviderStorageKey)).toBe("test.wallet");
  });

  it("connects and switches to Sepolia as one guided action", async () => {
    const provider = new TestProvider();
    provider.chainId = "0x1";
    const { result } = renderHook(() => useWallet());

    act(() => announce(provider));
    await waitFor(() => expect(result.current.state.providers).toHaveLength(1));
    await act(() => result.current.connect(result.current.state.providers[0]));
    expect(result.current.state.status).toBe("connected");
    expect(result.current.state.walletClient).not.toBeNull();
    expect(provider.requestedMethods).toContain("wallet_switchEthereumChain");
  });

  it("adds Coston2 when the wallet has not saved the network yet", async () => {
    const provider = new TestProvider();
    provider.chainId = "0x1";
    provider.switchChainId = "0x72";
    provider.unknownChain = true;
    const { result } = renderHook(() => useWallet("coston2"));

    act(() => announce(provider));
    await waitFor(() => expect(result.current.state.providers).toHaveLength(1));
    await act(() => result.current.connect(result.current.state.providers[0]));

    expect(result.current.state.status).toBe("connected");
    expect(result.current.state.chainId).toBe(114);
    expect(result.current.state.walletClient).not.toBeNull();
    expect(provider.requestedMethods).toEqual(expect.arrayContaining([
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
    ]));
  });

  it("keeps a connected wrong-chain wallet recoverable when switching is rejected", async () => {
    const provider = new TestProvider();
    provider.chainId = "0x1";
    provider.rejectSwitch = true;
    const { result } = renderHook(() => useWallet());

    act(() => announce(provider));
    await waitFor(() => expect(result.current.state.providers).toHaveLength(1));
    await act(() => result.current.connect(result.current.state.providers[0]));

    expect(result.current.state.status).toBe("wrong-chain");
    expect(result.current.state.account).toBe(account);
    expect(result.current.state.walletClient).toBeNull();
    expect(result.current.state.error).toMatch(/Confirm the switch/i);
  });

  it("clears the signing session when the connected account disappears", async () => {
    const provider = new TestProvider();
    const { result } = renderHook(() => useWallet());

    act(() => announce(provider));
    await waitFor(() => expect(result.current.state.providers).toHaveLength(1));
    await act(() => result.current.connect(result.current.state.providers[0]));
    const revision = result.current.state.sessionRevision;

    act(() => provider.emit("accountsChanged", []));
    expect(result.current.state.status).toBe("disconnected");
    expect(result.current.state.walletClient).toBeNull();
    expect(result.current.state.sessionRevision).toBe(revision + 1);
  });

  it("revises the session when the connected account changes", async () => {
    const provider = new TestProvider();
    const { result } = renderHook(() => useWallet());

    act(() => announce(provider));
    await waitFor(() => expect(result.current.state.providers).toHaveLength(1));
    await act(() => result.current.connect(result.current.state.providers[0]));
    const revision = result.current.state.sessionRevision;

    act(() => provider.emit("accountsChanged", [secondAccount]));
    expect(result.current.state.account).toBe(secondAccount);
    expect(result.current.state.sessionRevision).toBe(revision + 1);
  });
});
