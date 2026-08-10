import {
  assetManagerFAssetsAbi,
  coston2FlarePublicRelease,
} from "@flarequorum/flare-bindings";
import {
  createPublicClient,
  http,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  type Abi,
  type Address,
} from "viem";
import { useEffect, useMemo, useState } from "react";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import type { WalletController } from "../wallet/WalletPanel";
import { useToasts } from "../shell/ToastProvider";

const coston2 = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function parseRedemptionAmount(value: string): bigint {
  const normalized = value.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(normalized)) {
    throw new Error("Enter a positive FTestXRP amount with at most 6 decimals.");
  }
  const amount = parseUnits(normalized, 6);
  if (amount <= 0n) throw new Error("Redemption amount must be above zero.");
  return amount;
}

function validateXrplAddress(value: string): string {
  const normalized = value.trim();
  // This intentionally validates only the XRPL Base58 shape. The FAssets
  // contract remains the authority for whether the address is payable.
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(normalized)) {
    throw new Error("Enter a valid XRPL address for the redemption payout.");
  }
  return normalized;
}

function short(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function FlareRedemptionPanel({
  wallet,
  tenders,
}: {
  wallet: WalletController;
  tenders: readonly FlarePublicTender[];
}) {
  const toasts = useToasts();
  const [amount, setAmount] = useState("5");
  const [xrplAddress, setXrplAddress] = useState("");
  const [fAsset, setFAsset] = useState<Address | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [minimum, setMinimum] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ hash: string; requestIds: string[] } | null>(null);
  const connected = wallet.state.status === "connected" && Boolean(wallet.state.account && wallet.state.walletClient);
  const awarded = useMemo(
    () => connected
      ? tenders.filter((tender) => tender.status === "Awarded" && tender.winner?.toLowerCase() === wallet.state.account?.toLowerCase())
      : [],
    [connected, tenders, wallet.state.account],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadBalance() {
      if (!connected || !wallet.state.account) {
        setFAsset(null);
        setBalance(null);
        setMinimum(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
        if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
        const publicClient = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
        const manager = coston2FlarePublicRelease.protocols.assetManagerFXRP;
        const [resolvedFAsset, resolvedMinimum] = await Promise.all([
          publicClient.readContract({ address: manager, abi: assetManagerFAssetsAbi, functionName: "fAsset" }),
          publicClient.readContract({ address: manager, abi: assetManagerFAssetsAbi, functionName: "minimumRedeemAmountUBA" }),
        ]);
        const resolvedBalance = await publicClient.readContract({
          address: resolvedFAsset,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet.state.account],
        });
        if (!cancelled) {
          setFAsset(resolvedFAsset);
          setMinimum(resolvedMinimum);
          setBalance(resolvedBalance);
        }
      } catch {
        if (!cancelled) setError("FXRP redemption state is unavailable. No redemption transaction was attempted.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBalance();
    return () => { cancelled = true; };
  }, [connected, wallet.state.account]);

  async function redeem() {
    if (!connected || !wallet.state.account || !wallet.state.walletClient || !fAsset || balance === null || minimum === null) return;
    setError(null);
    setLast(null);
    setBusy(true);
    const toastId = toasts.startStack("FXRP REDEMPTION", "Checking the official FAssets redemption bounds…");
    try {
      const redemptionAmount = parseRedemptionAmount(amount);
      const underlyingAddress = validateXrplAddress(xrplAddress);
      if (redemptionAmount < minimum) throw new Error(`Minimum redemption is ${minimum.toString()} UBA.`);
      if (redemptionAmount > balance) throw new Error("Redemption amount exceeds this wallet's FTestXRP balance.");
      const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
      if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
      const publicClient = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
      const manager = coston2FlarePublicRelease.protocols.assetManagerFXRP;
      const approval = await publicClient.simulateContract({
        account: wallet.state.account,
        address: fAsset,
        abi: erc20Abi,
        functionName: "approve",
        args: [manager, redemptionAmount],
      });
      toasts.update(toastId, "Approving only the requested FTestXRP amount…");
      const approvalHash = await wallet.state.walletClient.writeContract(approval.request);
      const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      if (approvalReceipt.status !== "success") throw new Error("FXRP_REDEMPTION_APPROVAL_FAILED");
      const request = await publicClient.simulateContract({
        account: wallet.state.account,
        address: manager,
        abi: assetManagerFAssetsAbi as Abi,
        functionName: "redeemAmount",
        args: [redemptionAmount, underlyingAddress, zeroAddress],
      });
      toasts.update(toastId, "Submitting the official redemption request…");
      const txHash = await wallet.state.walletClient.writeContract(request.request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") throw new Error("FXRP_REDEMPTION_REQUEST_FAILED");
      const redemptionEvents = parseEventLogs({
        abi: assetManagerFAssetsAbi,
        eventName: "RedemptionRequested",
        logs: receipt.logs,
        strict: false,
      });
      const requestIds = redemptionEvents.flatMap((event) => {
        const { redeemer, requestId } = event.args;
        if (!redeemer || requestId === undefined || redeemer.toLowerCase() !== wallet.state.account!.toLowerCase()) return [];
        return [requestId.toString()];
      });
      if (requestIds.length === 0) throw new Error("FXRP_REDEMPTION_EVENT_MISSING");
      setLast({ hash: txHash, requestIds });
      toasts.succeed(toastId, "Redemption request recorded; the agent payment is still pending.");
      setBalance((current) => current === null ? null : current - redemptionAmount);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "FXRP_REDEMPTION_FAILED";
      setError(message);
      toasts.fail(toastId, "Redemption stopped; no success fallback is shown.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="evidence-panel flare-redemption-panel" aria-label="Official FXRP redemption">
      <header className="detail-header">
        <div><p className="eyebrow">FASSETS EXIT / COSTON2 TESTNET</p><h2>Request XRP redemption</h2></div>
        <span className="privacy-badge verified">OFFICIAL MANAGER</span>
      </header>
      <p>
        An awarded vendor may request redemption of public FTestXRP through the
        verified AssetManager. The wallet signs both approval and request; FlareQuorum
        never asks for an XRPL secret. The agent pays the XRPL address later, so a
        submitted request is not an instant payout.
      </p>
      {!connected ? <p className="form-hint">Connect the winning Coston2 wallet to request a redemption.</p> : null}
      {connected && awarded.length === 0 ? <p className="form-hint">This wallet is not the public winner of a finalized tender. Redemption controls appear only for the awarded vendor.</p> : null}
      {connected && awarded.length > 0 ? (
        <>
          <p className="form-hint">Eligible award{awarded.length === 1 ? "" : "s"}: {awarded.map((tender) => `#${tender.tenderId.toString()} · ${tender.winningAmountXrp === null ? "—" : `${tender.winningAmountXrp.toString()} UBA`}`).join("; ")}</p>
          <div className="form-grid-two">
            <label>FTestXRP amount<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy || loading} /><small>{minimum === null ? "Reading protocol minimum…" : `Minimum ${minimum.toString()} UBA`} · balance {balance === null ? "—" : balance.toString()} UBA</small></label>
            <label>XRPL payout address<input value={xrplAddress} onChange={(event) => setXrplAddress(event.target.value)} placeholder="r…" autoComplete="off" disabled={busy || loading} /><small>Use an XRPL testnet address you control.</small></label>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button className="primary-button" type="button" onClick={() => void redeem()} disabled={busy || loading || !fAsset || balance === null || minimum === null}>
            {busy ? "WAITING FOR C2FLR…" : "APPROVE &amp; REQUEST XRP REDEMPTION →"}
          </button>
          {last && <p className="form-hint" aria-live="polite">Request{last.requestIds.length === 1 ? "" : "s"} {last.requestIds.join(", ")} recorded · <a className="text-link" href={`https://coston2-explorer.flare.network/tx/${last.hash}`} target="_blank" rel="noreferrer">inspect transaction ↗</a></p>}
        </>
      ) : null}
      <p className="form-hint">Official guide: <a className="text-link" href="https://dev.flare.network/fassets/developer-guides/fassets-redeem-amount" target="_blank" rel="noreferrer">redeem FXRP by amount ↗</a> · manager <a className="text-link" href={`https://coston2-explorer.flare.network/address/${coston2FlarePublicRelease.protocols.assetManagerFXRP}`} target="_blank" rel="noreferrer">{short(coston2FlarePublicRelease.protocols.assetManagerFXRP)} ↗</a></p>
    </section>
  );
}
