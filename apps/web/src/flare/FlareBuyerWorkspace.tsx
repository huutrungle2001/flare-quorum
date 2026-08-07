import {
  coston2FlarePublicRelease,
  veilBidFlareMarketAbi,
} from "@veilbid/flare-bindings";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseUnits,
  stringToHex,
  type Abi,
  type Address,
} from "viem";
import type { WalletController } from "../wallet/WalletPanel";
import { WalletPanel } from "../wallet/WalletPanel";
import { useToasts } from "../shell/ToastProvider";
import { useState } from "react";

const coston2 = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

const erc20Abi = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

function parseVendors(value: string): Address[] {
  const entries = value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  if (entries.length === 0 || entries.length > 8) throw new Error("Enter 1–8 approved vendor addresses.");
  const vendors = entries.map((entry) => {
    if (!isAddress(entry)) throw new Error("Every vendor must be a valid EVM address.");
    return getAddress(entry);
  });
  if (new Set(vendors.map((entry) => entry.toLowerCase())).size !== vendors.length) throw new Error("Vendor addresses must be unique.");
  return vendors;
}

function parseCeiling(value: string): bigint {
  const normalized = value.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(normalized)) throw new Error("Enter a positive FTestXRP ceiling with at most 6 decimals.");
  const amount = parseUnits(normalized, 6);
  if (amount <= 0n) throw new Error("Ceiling must be above zero.");
  return amount;
}

function parseWeight(value: string, label: string): number {
  if (!/^[0-9]+$/.test(value)) throw new Error(`${label} weight is invalid.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 10_000) throw new Error(`${label} weight is invalid.`);
  return parsed;
}

export function FlareBuyerWorkspace({
  wallet,
  onRefresh,
}: {
  wallet: WalletController;
  onRefresh: () => void;
}) {
  const toasts = useToasts();
  const [title, setTitle] = useState("");
  const [ceiling, setCeiling] = useState("1");
  const [vendors, setVendors] = useState("");
  const [deadlineMinutes, setDeadlineMinutes] = useState("30");
  const [priceWeight, setPriceWeight] = useState("6000");
  const [deliveryWeight, setDeliveryWeight] = useState("2500");
  const [warrantyWeight, setWarrantyWeight] = useState("1500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ hash: string; tenderId: string } | null>(null);
  const connected = wallet.state.status === "connected" && wallet.state.account && wallet.state.walletClient;

  async function createTender() {
    if (!connected) return;
    setError(null);
    setLast(null);
    setBusy(true);
    const toastId = toasts.startStack("CREATE TENDER", "Reading Coston2 time and building public rules…");
    try {
      const market = coston2FlarePublicRelease.market;
      const token = coston2FlarePublicRelease.protocols.fTestXRP;
      const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
      if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
      const publicClient = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
      const block = await publicClient.getBlock({ blockTag: "latest" });
      const minutes = Number(deadlineMinutes);
      if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 30 * 24 * 60) throw new Error("Deadline must be between 5 minutes and 30 days.");
      const price = parseWeight(priceWeight, "Price");
      const delivery = parseWeight(deliveryWeight, "Delivery");
      const warranty = parseWeight(warrantyWeight, "Warranty");
      if (price + delivery + warranty !== 10_000) throw new Error("Scoring weights must total 10000 bps.");
      const approvedVendors = parseVendors(vendors);
      const amount = parseCeiling(ceiling);
      const metadata = title.trim();
      if (metadata.length < 3 || metadata.length > 160) throw new Error("Add a short public procurement title (3–160 characters).");
      const scoringPolicy = {
        schemaVersion: 1,
        ceilingXrpMicros: amount,
        bidDeadline: block.timestamp + BigInt(minutes * 60),
        allowXrp: true,
        allowUsd: true,
        ftsoFeedId: coston2FlarePublicRelease.protocols.xrpUsdFeedId,
        maxDeliveryDays: 30,
        minWarrantyDays: 7,
        maxWarrantyDays: 90,
        priceWeightBps: price,
        deliveryWeightBps: delivery,
        warrantyWeightBps: warranty,
        requiredCredentials: [],
      } as const;
      const terms = {
        metadataHash: keccak256(stringToHex(metadata)),
        scoringPolicy,
        approvedVendors,
        extensionId: BigInt(coston2FlarePublicRelease.fcc.extensionId),
        codeVersion: coston2FlarePublicRelease.fcc.codeHash,
        teeIds: coston2FlarePublicRelease.fcc.teeIds as [Address, Address, Address],
        teeKeyFingerprints: coston2FlarePublicRelease.fcc.teeKeyFingerprints as [string, string, string],
      };
      if (terms.teeKeyFingerprints.length !== 3) throw new Error("COSTON2_FCC_KEYS_UNAVAILABLE");
      const approval = await publicClient.simulateContract({ account: wallet.state.account!, address: token, abi: erc20Abi, functionName: "approve", args: [market, amount] });
      toasts.update(toastId, "Approving the exact public FTestXRP ceiling…");
      const approvalHash = await wallet.state.walletClient!.writeContract(approval.request);
      const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      if (approvalReceipt.status !== "success") throw new Error("FLARE_APPROVAL_FAILED");
      toasts.update(toastId, "Creating the funded tender with frozen FCC identities…");
      const creation = await publicClient.simulateContract({ account: wallet.state.account!, address: market, abi: veilBidFlareMarketAbi as Abi, functionName: "createTender", args: [terms] });
      const creationHash = await wallet.state.walletClient!.writeContract(creation.request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: creationHash });
      if (receipt.status !== "success") throw new Error("FLARE_TENDER_CREATION_FAILED");
      const count = await publicClient.readContract({ address: market, abi: veilBidFlareMarketAbi, functionName: "tenderCount" });
      setLast({ hash: creationHash, tenderId: String(count) });
      toasts.succeed(toastId, `Tender #${String(count)} is open on Coston2.`);
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "FLARE_TENDER_CREATION_FAILED");
      toasts.fail(toastId, "Tender creation stopped; no partial success is shown.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="role-workspace flare-buyer-workspace">
      <section className="workspace-intro">
        <p className="eyebrow">COSTON2 BUYER / EVM RECOVERY PATH</p>
        <h1>Fund transparent rules.</h1>
        <p>Approve the exact public FTestXRP ceiling, then create a tender frozen to the verified FCC extension and three production-status identities. Bid values remain outside the contract.</p>
      </section>
      <WalletPanel wallet={wallet} network="coston2" />
      <section className="evidence-panel flare-buyer-form" aria-label="Coston2 buyer tender composer">
        <header className="detail-header"><div><p className="eyebrow">PUBLIC PROCUREMENT RULES</p><h2>Open a Coston2 tender</h2></div><span className="privacy-badge verified">FTestXRP / TESTNET</span></header>
        <label>Public title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="e.g. XRP treasury reporting" disabled={busy} autoComplete="off" /><small>Only its hash is committed in this release slice; the Buyer Brief clarity pass remains scheduled.</small></label>
        <div className="form-grid-two">
          <label>Escrow ceiling (FTestXRP)<input inputMode="decimal" value={ceiling} onChange={(event) => setCeiling(event.target.value)} disabled={busy} /></label>
          <label>Bid deadline (minutes)<input type="number" min={5} max={43200} value={deadlineMinutes} onChange={(event) => setDeadlineMinutes(event.target.value)} disabled={busy} /></label>
          <label>Approved vendor addresses<textarea value={vendors} onChange={(event) => setVendors(event.target.value)} rows={3} placeholder="0x… (one or more, comma/newline separated)" disabled={busy} /></label>
          <div className="form-hint"><strong>Rules are public; bids are sealed.</strong><br />The market records only the rules hash, ceiling, vendor allowlist, FCC binding, and lifecycle checkpoints.</div>
        </div>
        <div className="form-grid-three">
          <label>Price weight (bps)<input inputMode="numeric" value={priceWeight} onChange={(event) => setPriceWeight(event.target.value)} disabled={busy} /></label>
          <label>Delivery weight (bps)<input inputMode="numeric" value={deliveryWeight} onChange={(event) => setDeliveryWeight(event.target.value)} disabled={busy} /></label>
          <label>Warranty weight (bps)<input inputMode="numeric" value={warrantyWeight} onChange={(event) => setWarrantyWeight(event.target.value)} disabled={busy} /></label>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button className="primary-button" type="button" onClick={() => void createTender()} disabled={busy || !connected}>{busy ? "WAITING FOR C2FLR…" : "APPROVE &amp; OPEN TENDER →"}</button>
        {last && <p className="form-hint" aria-live="polite">Tender #{last.tenderId} created · <a className="text-link" href={`https://coston2-explorer.flare.network/tx/${last.hash}`} target="_blank" rel="noreferrer">inspect transaction ↗</a></p>}
      </section>
    </main>
  );
}
