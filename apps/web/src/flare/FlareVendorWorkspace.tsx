import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import type { WalletController } from "../wallet/WalletPanel";
import { WalletPanel } from "../wallet/WalletPanel";
import { useToasts } from "../shell/ToastProvider";
import { parseUnits } from "viem";
import { useMemo, useState } from "react";
import { submitFlareBid } from "./flareBidIngress";
import { FlareRedemptionPanel } from "./FlareRedemptionPanel";

const stageLabels = {
  keys: "Checking the frozen TEE keys…",
  encrypting: "Encrypting the bid in this browser…",
  authorizing: "Authorizing ciphertext ingress…",
  "waiting-receipts": "Waiting for three TEE-signed receipts…",
  signing: "Submitting the receipt quorum on Coston2…",
  confirming: "Waiting for Coston2 confirmation…",
} as const;

function short(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function parsePrice(value: string, ceiling: bigint): bigint {
  const normalized = value.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(normalized)) {
    throw new Error("Enter a positive XRP quote with at most 6 decimals.");
  }
  const parsed = parseUnits(normalized, 6);
  if (parsed <= 0n || parsed > ceiling) throw new Error("Quote must be above zero and within the public ceiling.");
  return parsed;
}

export function FlareVendorWorkspace({
  wallet,
  tenders,
  onRefresh,
}: {
  wallet: WalletController;
  tenders: readonly FlarePublicTender[];
  onRefresh: () => void;
}) {
  const toasts = useToasts();
  const openTenders = useMemo(
    () => tenders.filter((tender) => tender.status === "Open"),
    [tenders],
  );
  const [selectedId, setSelectedId] = useState(() => openTenders[0]?.tenderId.toString() ?? "");
  const selected = openTenders.find((tender) => tender.tenderId.toString() === selectedId) ?? openTenders[0] ?? null;
  const [price, setPrice] = useState("");
  const [delivery, setDelivery] = useState("7");
  const [warranty, setWarranty] = useState("30");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<keyof typeof stageLabels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ hash: string; block: bigint } | null>(null);
  const connected = wallet.state.status === "connected" && wallet.state.account && wallet.state.walletClient;

  async function submit() {
    if (!connected || !selected) return;
    setError(null);
    setLast(null);
    setBusy(true);
    const toastId = toasts.startStack("SEALED BID", "Preparing an encrypted Coston2 bid…");
    try {
      const result = await submitFlareBid({
        tender: selected,
        vendor: wallet.state.account!,
        priceMicros: parsePrice(price, selected.scoringPolicy.ceilingXrpMicros),
        deliveryDays: Number(delivery),
        warrantyDays: Number(warranty),
        walletClient: wallet.state.walletClient!,
        onStage: (next) => {
          setStage(next);
          toasts.update(toastId, stageLabels[next]);
        },
      });
      setLast({ hash: result.transactionHash, block: result.blockNumber });
      setPrice("");
      toasts.succeed(toastId, "Three receipts accepted; bid committed on Coston2.");
      onRefresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "FLARE_BID_FAILED";
      setError(message);
      toasts.fail(toastId, "Bid stopped. No plaintext or ciphertext was saved.");
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  return (
    <main id="main-content" className="role-workspace flare-vendor-workspace">
      <section className="workspace-intro">
        <p className="eyebrow">COSTON2 VENDOR / PRIVATE INGRESS</p>
        <h1>Submit a sealed bid.</h1>
        <p>
          The bid is encoded and encrypted in this session, forwarded through the
          authenticated gateway to all three frozen TEEs, and admitted only after
          three matching signed receipts. This form never writes plaintext to
          browser storage, calldata, or public logs.
        </p>
      </section>
      <WalletPanel wallet={wallet} network="coston2" />
      {selected?.scoringPolicy.requiredCredentials.length ? (
        <section className="state-panel error" role="alert">
          <span aria-hidden="true">!</span>
          <div>
            <h2>Credential-gated tender</h2>
            <p>This release requires issuer credentials that the browser composer does not collect. No bid was attempted.</p>
          </div>
        </section>
      ) : null}
      {!selected ? (
        <section className="state-panel">
          <span aria-hidden="true">0</span>
          <div><h2>No open Coston2 tenders</h2><p>Wait for a buyer to open a verified tender; no placeholder bid path is shown.</p></div>
        </section>
      ) : (
        <section className="evidence-panel flare-vendor-form" aria-label="Coston2 sealed bid composer">
          <header className="detail-header">
            <div><p className="eyebrow">TENDER {selected.tenderId.toString()}</p><h2>Private commercial terms</h2></div>
            <span className="privacy-badge encrypted">◆ SEALED</span>
          </header>
          <label>
            Tender
            <select value={selected.tenderId.toString()} onChange={(event) => setSelectedId(event.target.value)} disabled={busy}>
              {openTenders.map((tender) => <option key={tender.tenderId.toString()} value={tender.tenderId.toString()}>#{tender.tenderId.toString()} · ceiling {tender.scoringPolicy.ceilingXrpMicros.toString()} micros</option>)}
            </select>
          </label>
          <div className="form-grid-two">
            <label>
              Your XRP quote
              <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="e.g. 0.72" disabled={busy} autoComplete="off" />
              <small>At most {selected.scoringPolicy.ceilingXrpMicros.toString()} micros; only the FCC sees this value.</small>
            </label>
            <label>
              Delivery days
              <input inputMode="numeric" type="number" min={0} max={selected.scoringPolicy.maxDeliveryDays} value={delivery} onChange={(event) => setDelivery(event.target.value)} disabled={busy} />
              <small>Maximum {selected.scoringPolicy.maxDeliveryDays} days.</small>
            </label>
            <label>
              Warranty days
              <input inputMode="numeric" type="number" min={selected.scoringPolicy.minWarrantyDays} max={selected.scoringPolicy.maxWarrantyDays} value={warranty} onChange={(event) => setWarranty(event.target.value)} disabled={busy} />
              <small>{selected.scoringPolicy.minWarrantyDays}–{selected.scoringPolicy.maxWarrantyDays} days.</small>
            </label>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {stage && <p className="form-hint" aria-live="polite">{stageLabels[stage]}</p>}
          <button className="primary-button" type="button" onClick={() => void submit()} disabled={busy || !connected || Boolean(selected.scoringPolicy.requiredCredentials.length)}>
            {busy ? "ENCRYPTING / WAITING…" : "ENCRYPT &amp; SUBMIT BID →"}
          </button>
          {last && (
            <section className="readiness-strip" aria-live="polite">
              <span className="signal-dot" aria-hidden="true" />
              <div><strong>Bid receipt quorum committed</strong><span>Tx <a className="text-link" href={`https://coston2-explorer.flare.network/tx/${last.hash}`} target="_blank" rel="noreferrer">{short(last.hash)} ↗</a> · block {last.block.toString()}</span></div>
            </section>
          )}
        </section>
      )}
      <FlareRedemptionPanel wallet={wallet} tenders={tenders} />
    </main>
  );
}
