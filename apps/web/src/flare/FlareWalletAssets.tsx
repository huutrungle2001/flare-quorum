import {
  assetManagerFAssetsAbi,
  coston2FlarePublicRelease,
} from "@flarequorum/flare-bindings";
import {
  createPublicClient,
  formatUnits,
  http,
  zeroAddress,
  type Address,
} from "viem";
import { useCallback, useEffect, useState } from "react";
import type { WalletController } from "../wallet/WalletPanel";
import { refreshStateEvent } from "../shell/refreshState";

const coston2 = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

const erc20Abi = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

type AssetValues = {
  c2flr: bigint;
  fxrp: bigint;
};

function displayAmount(value: bigint, decimals: number) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const visible = fraction.slice(0, 4).replace(/0+$/, "");
  return visible ? `${whole}.${visible}` : whole;
}

export function FlareWalletAssets({ wallet }: { wallet: WalletController }) {
  const account = wallet.state.account;
  const connected = wallet.state.status === "connected" && Boolean(account);
  const [values, setValues] = useState<AssetValues | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const refresh = useCallback(async () => {
    if (!connected || !account) {
      setValues(null);
      setStatus("idle");
      return;
    }
    const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
    if (!rpcUrl) {
      setValues(null);
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      const client = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
      const assetManager = coston2FlarePublicRelease.protocols.assetManagerFXRP;
      const [c2flr, fxrpAddress] = await Promise.all([
        client.getBalance({ address: account }),
        client.readContract({
          address: assetManager,
          abi: assetManagerFAssetsAbi,
          functionName: "fAsset",
        }),
      ]);
      const fxrp = fxrpAddress.toLowerCase() === zeroAddress
        ? 0n
        : await client.readContract({
          address: fxrpAddress as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        });
      setValues({ c2flr, fxrp });
      setStatus("ready");
    } catch {
      setValues(null);
      setStatus("error");
    }
  }, [account, connected]);

  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener(refreshStateEvent, onRefresh);
    return () => window.removeEventListener(refreshStateEvent, onRefresh);
  }, [refresh]);

  return (
    <section className="flare-wallet-assets" aria-label="Coston2 wallet assets">
      <header>
        <div>
          <p className="eyebrow">WALLET ASSETS</p>
          <strong>COSTON2 / 114</strong>
        </div>
        <span className="privacy-badge">READ-ONLY</span>
      </header>
      {!connected ? (
        <p className="flare-wallet-assets-message">
          {wallet.state.status === "wrong-chain"
            ? "SWITCH TO COSTON2 IN THE HEADER"
            : "CONNECT WALLET TO VIEW"}
        </p>
      ) : status === "loading" ? (
        <p className="flare-wallet-assets-message">READING BALANCES…</p>
      ) : status === "error" ? (
        <p className="flare-wallet-assets-message">UNAVAILABLE · PRESS ↻ TO RETRY</p>
      ) : values ? (
        <>
          <dl>
            <div><dt>C2FLR</dt><dd>{displayAmount(values.c2flr, 18)}</dd></div>
            <div><dt>FXRP</dt><dd>{displayAmount(values.fxrp, 6)}</dd></div>
          </dl>
          <p className="flare-wallet-assets-note">COSTON2: FXRP is represented by FTestXRP.</p>
        </>
      ) : null}
      <p className="flare-wallet-assets-note">Public RPC read · no signing request</p>
    </section>
  );
}
