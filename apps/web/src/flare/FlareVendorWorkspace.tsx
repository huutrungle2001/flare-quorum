import { coston2FlarePublicRelease, flareQuorumFlareMarketAbi } from "@flarequorum/flare-bindings";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import type { WalletController } from "../wallet/WalletPanel";
import { WalletPanel } from "../wallet/WalletPanel";
import { ContextHelp } from "../shell/ContextHelp";
import { useToasts } from "../shell/ToastProvider";
import { createPublicClient, formatUnits, http, parseUnits, type Abi } from "viem";
import { useEffect, useMemo, useState } from "react";
import { submitFlareBid } from "./flareBidIngress";
import { FlareBuyerBriefPanel } from "./FlareBuyerBriefPanel";

const coston2 = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

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

export function flareVendorBidErrorMessage(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "FLARE_BID_FAILED";
  if (code === "FLARE_VENDOR_NOT_APPROVED") {
    return "This wallet is not on the buyer's approved vendor list. No encrypted bid was sent.";
  }
  if (code === "FLARE_INGRESS_UNAVAILABLE" || code === "FLARE_RECEIPT_PENDING") {
    return "The confidential ingress is unavailable or still pending. No on-chain bid was committed. A TEE may retain only this attempt's encrypted payload; retrying uses a new one-time nonce.";
  }
  if (code === "FLARE_CREDENTIALS_REQUIRED") {
    return "This tender requires credentials that this browser composer cannot collect. No bid was attempted.";
  }
  return code;
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
  const [reviewing, setReviewing] = useState(false);
  const [stage, setStage] = useState<keyof typeof stageLabels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ hash: string; block: bigint } | null>(null);
  const connected = wallet.state.status === "connected" && wallet.state.account && wallet.state.walletClient;
  const [eligibility, setEligibility] = useState<Record<string, boolean> | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadEligibility() {
      if (!connected || !wallet.state.account) {
        setEligibility(null);
        setEligibilityError(null);
        return;
      }
      const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
      if (!rpcUrl) {
        setEligibility(null);
        setEligibilityError("Coston2 eligibility is unavailable. Bid entry remains locked.");
        return;
      }
      setEligibilityLoading(true);
      setEligibilityError(null);
      try {
        const publicClient = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
        const entries = await Promise.all(openTenders.map(async (tender) => [
          tender.tenderId.toString(),
          await publicClient.readContract({
            address: coston2FlarePublicRelease.market,
            abi: flareQuorumFlareMarketAbi as Abi,
            functionName: "isApprovedVendor",
            args: [tender.tenderId, wallet.state.account!],
          }) === true,
        ] as const));
        if (!cancelled) setEligibility(Object.fromEntries(entries));
      } catch {
        if (!cancelled) {
          setEligibility(null);
          setEligibilityError("Coston2 eligibility could not be verified. No bid can be submitted.");
        }
      } finally {
        if (!cancelled) setEligibilityLoading(false);
      }
    }
    void loadEligibility();
    return () => { cancelled = true; };
  }, [connected, openTenders, wallet.state.account]);

  const eligibleTenders = connected && eligibility
    ? openTenders.filter((tender) => eligibility[tender.tenderId.toString()] === true)
    : openTenders;
  const ineligibleTenders = connected && eligibility
    ? openTenders.filter((tender) => eligibility[tender.tenderId.toString()] !== true)
    : [];
  useEffect(() => {
    if (!connected || !eligibility || eligibleTenders.length === 0) return;
    if (!selected || eligibility[selected.tenderId.toString()] !== true) {
      setSelectedId(eligibleTenders[0].tenderId.toString());
      setReviewing(false);
    }
  }, [connected, eligibility, eligibleTenders, selected]);
  const selectedEligible = Boolean(
    connected && selected && eligibility?.[selected.tenderId.toString()] === true,
  );
  const credentialSupported = Boolean(
    selected && selected.scoringPolicy.requiredCredentials.length === 0,
  );
  let priceError: string | null = null;
  if (selected) {
    try {
      parsePrice(price, selected.scoringPolicy.ceilingXrpMicros);
    } catch (cause) {
      priceError = price.trim() ? (cause as Error).message : "Enter your XRP quote.";
    }
  }
  const deliveryValue = Number(delivery);
  const deliveryError = !selected || !Number.isInteger(deliveryValue) || deliveryValue < 0 || deliveryValue > selected.scoringPolicy.maxDeliveryDays
    ? `Enter 0–${selected?.scoringPolicy.maxDeliveryDays ?? 0} delivery days.`
    : null;
  const warrantyValue = Number(warranty);
  const warrantyError = !selected || !Number.isInteger(warrantyValue) || warrantyValue < selected.scoringPolicy.minWarrantyDays || warrantyValue > selected.scoringPolicy.maxWarrantyDays
    ? `Enter ${selected?.scoringPolicy.minWarrantyDays ?? 0}–${selected?.scoringPolicy.maxWarrantyDays ?? 0} warranty days.`
    : null;
  const formValid = Boolean(selected && selectedEligible && credentialSupported && selected.scoringPolicy.allowXrp && !priceError && !deliveryError && !warrantyError);
  const entryLocked = !connected || eligibilityLoading || !selectedEligible || !credentialSupported || !selected?.scoringPolicy.allowXrp;

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
      setReviewing(false);
      toasts.succeed(toastId, "Three receipts accepted; bid committed on Coston2.");
      onRefresh();
    } catch (cause) {
      setError(flareVendorBidErrorMessage(cause));
      toasts.fail(toastId, "Bid stopped before an on-chain commitment. Plaintext was not persisted.");
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
      {!selected ? (
        <section className="state-panel">
          <span aria-hidden="true">0</span>
          <div><h2>No open Coston2 tenders</h2><p>Wait for a buyer to open a verified tender; no placeholder bid path is shown.</p></div>
        </section>
      ) : (
        <section className="evidence-panel flare-vendor-form" aria-label="Coston2 sealed bid composer">
          <header className="detail-header input-card-header">
            <div><p className="eyebrow">TENDER {selected.tenderId.toString()}</p><h2>Private commercial terms</h2></div>
            <div className="input-card-tools">
              <ContextHelp
                compact
                label="Help for sealed vendor bid"
                title="HOW TO SUBMIT A PRIVATE BID"
                steps={[
                  "Connect the approved Coston2 vendor wallet and choose an eligible open tender.",
                  "Review its public ceiling, deadline, service bounds, and scoring weights before entering private terms.",
                  "Review the quote once, then encrypt it to the three tender-fixed TEEs and commit their signed receipts.",
                ]}
                note="Private fields stay only in this browser session and are lost on refresh."
              />
              <span className="privacy-badge encrypted">◆ SEALED</span>
            </div>
          </header>
          {!connected && <div className="vendor-eligibility-strip"><strong>CONNECT TO CHECK ELIGIBILITY</strong><span>Open tenders are public. Private entry unlocks only for an approved vendor wallet.</span></div>}
          {connected && eligibilityLoading && <div className="vendor-eligibility-strip"><strong>CHECKING APPROVED VENDOR LISTS…</strong><span>Bid entry remains locked until Coston2 confirms eligibility.</span></div>}
          {connected && !eligibilityLoading && eligibility && <div className="vendor-eligibility-strip eligible"><strong>YOU ARE ELIGIBLE FOR {eligibleTenders.length} OPEN TENDER{eligibleTenders.length === 1 ? "" : "S"}</strong><span>{ineligibleTenders.length} other public tender{ineligibleTenders.length === 1 ? " is" : "s are"} visible but unavailable to this wallet.</span></div>}
          {eligibilityError && <p className="inline-error" role="alert">{eligibilityError}</p>}
          <label>
            Tender
            <select required value={selected.tenderId.toString()} onChange={(event) => { setSelectedId(event.target.value); setReviewing(false); setError(null); }} disabled={busy || eligibilityLoading}>
              {!connected && openTenders.map((tender) => <option key={tender.tenderId.toString()} value={tender.tenderId.toString()}>Tender #{tender.tenderId.toString()} · {formatUnits(tender.publicCeilingXrp, 6)} FTestXRP · connect to check</option>)}
              {connected && eligibleTenders.length > 0 && <optgroup label="ELIGIBLE OPEN TENDERS">{eligibleTenders.map((tender) => <option key={tender.tenderId.toString()} value={tender.tenderId.toString()}>Tender #{tender.tenderId.toString()} · {formatUnits(tender.publicCeilingXrp, 6)} FTestXRP</option>)}</optgroup>}
              {connected && ineligibleTenders.length > 0 && <optgroup label="OTHER PUBLIC TENDERS">{ineligibleTenders.map((tender) => <option disabled key={tender.tenderId.toString()} value={tender.tenderId.toString()}>Tender #{tender.tenderId.toString()} · not approved</option>)}</optgroup>}
            </select>
          </label>
          <section className="vendor-tender-summary" aria-label={`Public summary for tender ${selected.tenderId.toString()}`}>
            <header><div><p className="eyebrow">PUBLIC TENDER SUMMARY</p><h3>Tender #{selected.tenderId.toString()}</h3></div><span className="privacy-badge">{selectedEligible ? "ELIGIBLE" : "PUBLIC VIEW"}</span></header>
            <FlareBuyerBriefPanel tender={selected} compact />
            <dl className="term-grid">
              <div><dt>Public ceiling</dt><dd>{formatUnits(selected.publicCeilingXrp, 6)} FTestXRP</dd></div>
              <div><dt>Deadline</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(selected.bidDeadline) * 1_000))}</dd></div>
              <div><dt>Scoring</dt><dd>{selected.scoringPolicy.priceWeightBps / 100}% price · {selected.scoringPolicy.deliveryWeightBps / 100}% delivery · {selected.scoringPolicy.warrantyWeightBps / 100}% warranty</dd></div>
              <div><dt>Service bounds</dt><dd>≤ {selected.scoringPolicy.maxDeliveryDays}d delivery · {selected.scoringPolicy.minWarrantyDays}–{selected.scoringPolicy.maxWarrantyDays}d warranty</dd></div>
            </dl>
            <p>The registry brief is displayed only after this browser recomputes and matches the tender's immutable metadata hash.</p>
          </section>
          {!credentialSupported && <p className="inline-error" role="alert">This credential-gated tender is not supported by the current browser composer. No private bid can be entered.</p>}
          {!selected.scoringPolicy.allowXrp && <p className="inline-error" role="alert">This tender does not accept XRP quotes. The current browser composer cannot submit its supported currency.</p>}
          <div className="private-bid-memory-warning" role="note"><strong>THIS PRIVATE BID IS NOT SAVED.</strong><span>Do not refresh before submission. Price, delivery, and warranty remain only in this browser session.</span></div>
          <div className="form-grid-two">
            <label>
              Your XRP quote
              <input required inputMode="decimal" value={price} onChange={(event) => { setPrice(event.target.value); setReviewing(false); }} placeholder="e.g. 0.72" disabled={busy || entryLocked} autoComplete="off" aria-invalid={Boolean(price.trim() && priceError)} />
              <small>Maximum {formatUnits(selected.publicCeilingXrp, 6)} XRP; only FCC sees this value.</small>
              {price.trim() && priceError && <small className="field-error" role="alert">{priceError}</small>}
            </label>
            <label>
              Delivery days
              <input required inputMode="numeric" type="number" min={0} max={selected.scoringPolicy.maxDeliveryDays} value={delivery} onChange={(event) => { setDelivery(event.target.value); setReviewing(false); }} disabled={busy || entryLocked} aria-invalid={Boolean(deliveryError)} />
              <small>Maximum {selected.scoringPolicy.maxDeliveryDays} days.</small>
              {deliveryError && <small className="field-error" role="alert">{deliveryError}</small>}
            </label>
            <label>
              Warranty days
              <input required inputMode="numeric" type="number" min={selected.scoringPolicy.minWarrantyDays} max={selected.scoringPolicy.maxWarrantyDays} value={warranty} onChange={(event) => { setWarranty(event.target.value); setReviewing(false); }} disabled={busy || entryLocked} aria-invalid={Boolean(warrantyError)} />
              <small>{selected.scoringPolicy.minWarrantyDays}–{selected.scoringPolicy.maxWarrantyDays} days.</small>
              {warrantyError && <small className="field-error" role="alert">{warrantyError}</small>}
            </label>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {stage && <p className="form-hint" aria-live="polite">{stageLabels[stage]}</p>}
          {!selected.scoringPolicy.requiredCredentials.length && <WalletPanel wallet={wallet} network="coston2" compact />}
          {!reviewing ? (
            <button className="primary-button" type="button" onClick={() => setReviewing(true)} disabled={busy || !formValid}>REVIEW SEALED BID →</button>
          ) : (
            <section className="private-bid-review" aria-label="Review sealed bid before encryption">
              <header><div><p className="eyebrow">FINAL IN-SESSION REVIEW</p><h3>Confirm the private terms.</h3></div><span className="privacy-badge encrypted">NOT SAVED</span></header>
              <dl className="term-grid">
                <div><dt>XRP quote</dt><dd>{price} XRP</dd></div>
                <div><dt>Delivery</dt><dd>{delivery} days</dd></div>
                <div><dt>Warranty</dt><dd>{warranty} days</dd></div>
              </dl>
              <div className="finalizer-actions">
                <button className="primary-button" type="button" onClick={() => void submit()} disabled={busy || !formValid}>{busy ? "ENCRYPTING / WAITING…" : "ENCRYPT & SUBMIT BID →"}</button>
                <button className="secondary-button" type="button" onClick={() => setReviewing(false)} disabled={busy}>EDIT PRIVATE TERMS</button>
              </div>
            </section>
          )}
          {last && (
            <section className="readiness-strip" aria-live="polite">
              <span className="signal-dot" aria-hidden="true" />
              <div><strong>Bid receipt quorum committed</strong><span>Tx <a className="text-link" href={`https://coston2-explorer.flare.network/tx/${last.hash}`} target="_blank" rel="noreferrer">{short(last.hash)} ↗</a> · block {last.block.toString()}</span></div>
            </section>
          )}
        </section>
      )}
    </main>
  );
}
