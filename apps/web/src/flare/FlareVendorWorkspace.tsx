import { coston2FlarePublicRelease, flareQuorumFlareMarketAbi } from "@flarequorum/flare-bindings";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import type { WalletController } from "../wallet/WalletPanel";
import { WalletPanel } from "../wallet/WalletPanel";
import { ContextHelp } from "../shell/ContextHelp";
import { useToasts } from "../shell/ToastProvider";
import { scrollToPageTop } from "../shell/navigationScroll";
import { createPublicClient, formatUnits, http, isAddressEqual, parseUnits, type Abi, type Hex } from "viem";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { submitFlareBid } from "./flareBidIngress";
import { FlareBuyerBriefPanel } from "./FlareBuyerBriefPanel";
import {
  clearPendingFlareBid,
  readPendingFlareBid,
  savePendingFlareBid,
} from "./pendingFinality";

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

function deadline(timestamp: bigint): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(timestamp) * 1_000));
}

function receiptCount(bitmap: number): number {
  return bitmap.toString(2).split("").filter((bit) => bit === "1").length;
}

function submissionState(tender: FlarePublicTender, bidId: bigint): string {
  if (tender.status === "Awarded") {
    return tender.winnerBidId === bidId ? "WINNER" : "NOT SELECTED";
  }
  if (tender.status === "Refunded") return "REFUNDED · NO AWARD";
  if (tender.status === "Closed" || tender.status === "ComputePending") return "IN SELECTION";
  return "ACCEPTED";
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
  if (code === "FLARE_BID_ALREADY_SUBMITTED" || code.includes("AlreadySubmitted")) {
    return "This wallet already has an accepted bid for this tender. Refresh state and open My submissions; do not submit it again.";
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
  const [params, setParams] = useSearchParams();
  const section = params.get("vendor") === "submissions" ? "submissions" : "submit";
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
  const [activeAttempt, setActiveAttempt] = useState<{ tenderId: bigint; stage: keyof typeof stageLabels } | null>(null);
  const [error, setError] = useState<string | null>(null);
  type PendingBidView = {
    tenderId: bigint;
    hash: Hex;
    block: bigint | null;
    commitment: Hex;
    submissionNonce: bigint;
    receiptExpiry: bigint;
  };
  const [last, setLast] = useState<PendingBidView | null>(null);
  const connected = wallet.state.status === "connected" && wallet.state.account && wallet.state.walletClient;
  const [eligibility, setEligibility] = useState<Record<string, boolean> | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  const mySubmissions = useMemo(() => {
    if (!connected || !wallet.state.account) return [];
    return tenders
      .flatMap((tender) => tender.bidReferences
        .filter((bid) => isAddressEqual(bid.vendor, wallet.state.account!))
        .map((bid) => ({ tender, bid })))
      .sort((left, right) => Number(right.bid.acceptedBlock - left.bid.acceptedBlock));
  }, [connected, tenders, wallet.state.account]);
  const recentPendingFinality = Boolean(
    last && !mySubmissions.some(({ tender, bid }) => (
      tender.tenderId === last.tenderId
      && bid.plaintextCommitment.toLowerCase() === last.commitment.toLowerCase()
    )),
  );
  const visibleSubmissionCount = mySubmissions.length + (recentPendingFinality || activeAttempt ? 1 : 0);

  useEffect(() => {
    if (!connected || !wallet.state.account) return;
    const pending = readPendingFlareBid();
    if (!pending || !isAddressEqual(pending.vendor, wallet.state.account)) return;
    setLast({
      tenderId: BigInt(pending.tenderId),
      hash: pending.transactionHash,
      block: pending.blockNumber === null ? null : BigInt(pending.blockNumber),
      commitment: pending.commitment,
      submissionNonce: BigInt(pending.submissionNonce),
      receiptExpiry: BigInt(pending.receiptExpiry),
    });
  }, [connected, wallet.state.account]);

  useEffect(() => {
    if (!last || recentPendingFinality) return;
    clearPendingFlareBid(last.commitment);
    setLast(null);
  }, [last, recentPendingFinality]);

  function selectSection(next: "submit" | "submissions") {
    const updated = new URLSearchParams(params);
    if (next === "submit") updated.delete("vendor");
    else updated.set("vendor", "submissions");
    scrollToPageTop();
    setParams(updated);
  }

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
    setActiveAttempt({ tenderId: selected.tenderId, stage: "keys" });
    selectSection("submissions");
    let broadcasted = false;
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
          setActiveAttempt({ tenderId: selected.tenderId, stage: next });
          toasts.update(toastId, stageLabels[next]);
        },
        onBroadcast: (pending) => {
          broadcasted = true;
          setActiveAttempt(null);
          const pendingView = {
            tenderId: selected.tenderId,
            hash: pending.transactionHash,
            block: null,
            commitment: pending.commitment,
            submissionNonce: pending.submissionNonce,
            receiptExpiry: pending.receiptExpiry,
          } satisfies PendingBidView;
          setLast(pendingView);
          savePendingFlareBid({
            version: 1,
            tenderId: pendingView.tenderId.toString(),
            vendor: wallet.state.account!,
            transactionHash: pendingView.hash,
            blockNumber: null,
            commitment: pendingView.commitment,
            submissionNonce: pendingView.submissionNonce.toString(),
            receiptExpiry: pendingView.receiptExpiry.toString(),
          });
          setPrice("");
          setReviewing(false);
          selectSection("submissions");
        },
      });
      const pendingView = {
        tenderId: selected.tenderId,
        hash: result.transactionHash,
        block: result.blockNumber,
        commitment: result.commitment,
        submissionNonce: result.submission.submissionNonce,
        receiptExpiry: result.submission.receiptExpiry,
      } satisfies PendingBidView;
      setLast(pendingView);
      savePendingFlareBid({
        version: 1,
        tenderId: pendingView.tenderId.toString(),
        vendor: wallet.state.account!,
        transactionHash: pendingView.hash,
        blockNumber: pendingView.block.toString(),
        commitment: pendingView.commitment,
        submissionNonce: pendingView.submissionNonce.toString(),
        receiptExpiry: pendingView.receiptExpiry.toString(),
      });
      setPrice("");
      setReviewing(false);
      toasts.succeed(toastId, "Three receipts accepted; bid committed on Coston2.");
      onRefresh();
    } catch (cause) {
      setActiveAttempt(null);
      setError(flareVendorBidErrorMessage(cause));
      toasts.fail(toastId, broadcasted
        ? "Transaction was broadcast, but confirmation could not yet be verified. Check My submissions before retrying."
        : "Bid stopped before an on-chain commitment. Plaintext was not persisted.");
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  return (
    <main id="main-content" className="role-workspace flare-vendor-workspace">
      <section className="workspace-intro">
        <p className="eyebrow">COSTON2 VENDOR / PRIVATE INGRESS</p>
        <h1>{section === "submit" ? "Submit a sealed bid." : "Track your submissions."}</h1>
        {section === "submit" ? (
          <p>
            The bid is encoded and encrypted in this session, forwarded through the
            authenticated gateway to all three frozen TEEs, and admitted only after
            three matching signed receipts. This form never writes plaintext to
            browser storage, calldata, or public logs.
          </p>
        ) : (
          <p>
            This wallet-scoped view finds its finalized public bid receipts on Coston2.
            It proves which tenders you entered without retrieving price, delivery,
            warranty, ciphertext, or any other private bid payload.
          </p>
        )}
      </section>
      <nav className="vendor-section-nav" aria-label="Private Bids sections">
        <button type="button" className={section === "submit" ? "active" : ""} aria-current={section === "submit" ? "page" : undefined} onClick={() => selectSection("submit")}>SUBMIT BID</button>
        <button type="button" className={section === "submissions" ? "active" : ""} aria-current={section === "submissions" ? "page" : undefined} onClick={() => selectSection("submissions")}>MY SUBMISSIONS{connected && visibleSubmissionCount > 0 ? ` · ${visibleSubmissionCount}` : ""}</button>
      </nav>
      {section === "submissions" ? (
        <section className="evidence-panel vendor-submissions-panel" aria-label="My finalized bid submissions">
          <header className="detail-header">
            <div><p className="eyebrow">MY SUBMISSIONS / PUBLIC RECEIPTS</p><h2>{connected ? `${mySubmissions.length} finalized${recentPendingFinality ? " · 1 waiting finality" : activeAttempt ? " · 1 submitting" : ""}` : "Connect to find your submissions"}</h2></div>
            <span className={`privacy-badge${connected ? " verified" : ""}`}>{connected ? "WALLET FILTER ACTIVE" : "WALLET REQUIRED"}</span>
          </header>
          <div className="my-submissions-boundary" role="note">
            <strong>RECEIPTS, NOT BID CONTENT</strong>
            <span>Only your public commitment and quorum proof can be recovered. Private terms were deliberately not persisted.</span>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {!connected && (
            <div className="my-submissions-connect">
              <WalletPanel wallet={wallet} network="coston2" compact />
            </div>
          )}
          {connected && activeAttempt && !last && (
            <article className="my-submission-card pending-finality" aria-live="polite">
              <header>
                <div><p className="eyebrow">TENDER {activeAttempt.tenderId.toString()} · SUBMISSION IN PROGRESS</p><h3>Preparing sealed commitment</h3></div>
                <span className="privacy-badge encrypted">IN PROGRESS</span>
              </header>
              <p className="submission-explainer">{stageLabels[activeAttempt.stage]} This is an in-progress attempt, not an accepted on-chain bid yet.</p>
            </article>
          )}
          {connected && recentPendingFinality && last && (
            <article className="my-submission-card pending-finality">
              <header>
                <div><p className="eyebrow">TENDER {last.tenderId.toString()} · JUST SUBMITTED</p><h3>{last.block === null ? "Transaction broadcast" : "Receipt quorum committed"}</h3></div>
                <span className="privacy-badge encrypted">{last.block === null ? "CONFIRMATION PENDING" : "CONFIRMED · FINALITY PENDING"}</span>
              </header>
              <dl className="submission-facts">
                <div><dt>Receipt quorum</dt><dd>3 / 3</dd></div>
                <div><dt>Transaction block</dt><dd>{last.block === null ? "Pending" : last.block.toString()}</dd></div>
                <div><dt>Private terms</dt><dd>Not recoverable</dd></div>
              </dl>
              <p className="submission-explainer">{last.block === null
                ? "The wallet broadcast the transaction. FlareQuorum is checking Coston2 confirmation before asserting acceptance."
                : "The transaction succeeded. Automatic refresh replaces this card with a finalized submission after the public reader reaches 12-block finality."}</p>
              <div className="my-submission-actions">
                <a className="secondary-button" href={`https://coston2-explorer.flare.network/tx/${last.hash}`} target="_blank" rel="noreferrer">VIEW TRANSACTION ↗</a>
                <a className="text-link" href={`/flare?status=all&tender=${last.tenderId.toString()}`}>VIEW PUBLIC DOSSIER →</a>
              </div>
              <details className="submission-receipt-details">
                <summary>PUBLIC RECEIPT DETAILS <span aria-hidden="true">⌄</span></summary>
                <dl>
                  <div><dt>Commitment</dt><dd><code>{last.commitment}</code></dd></div>
                  <div><dt>Submission nonce</dt><dd><code>{last.submissionNonce.toString()}</code></dd></div>
                  <div><dt>Receipt expiry</dt><dd>{deadline(last.receiptExpiry)}</dd></div>
                </dl>
              </details>
            </article>
          )}
          {connected && mySubmissions.length === 0 && !recentPendingFinality && (
            <div className="state-panel compact-state">
              <span aria-hidden="true">0</span>
              <div><h3>No finalized submissions for this wallet</h3><p>Use Submit Bid for an eligible open tender. A confirmed submission appears here after 12-block finality.</p></div>
            </div>
          )}
          {connected && mySubmissions.length > 0 && (
            <div className="my-submission-list">
              {mySubmissions.map(({ tender, bid }) => (
                <article className="my-submission-card" key={`${tender.tenderId.toString()}:${bid.bidId.toString()}`}>
                  <header>
                    <div><p className="eyebrow">TENDER {tender.tenderId.toString()} · YOUR BID {bid.bidId.toString()}</p><h3>Submission accepted</h3></div>
                    <span className={`privacy-badge${tender.winnerBidId === bid.bidId ? " verified" : ""}`}>{submissionState(tender, bid.bidId)}</span>
                  </header>
                  <dl className="submission-facts">
                    <div><dt>Tender state</dt><dd>{tender.status}</dd></div>
                    <div><dt>Receipt quorum</dt><dd>{receiptCount(bid.receiptBitmap)} / 3</dd></div>
                    <div><dt>Accepted block</dt><dd><a className="text-link" href={`https://coston2-explorer.flare.network/block/${bid.acceptedBlock.toString()}`} target="_blank" rel="noreferrer">{bid.acceptedBlock.toString()} ↗</a></dd></div>
                  </dl>
                  <p className="submission-explainer">Your public receipt is finalized. Price, delivery, and warranty remain sealed and cannot be reopened by this interface.</p>
                  <div className="my-submission-actions">
                    <a className="secondary-button" href={`/flare?status=all&tender=${tender.tenderId.toString()}`}>VIEW PUBLIC DOSSIER →</a>
                  </div>
                  <details className="submission-receipt-details">
                    <summary>PUBLIC RECEIPT DETAILS <span aria-hidden="true">⌄</span></summary>
                    <dl>
                      <div><dt>Commitment</dt><dd><code>{bid.plaintextCommitment}</code></dd></div>
                      <div><dt>Submission nonce</dt><dd><code>{bid.submissionNonce.toString()}</code></dd></div>
                      <div><dt>Receipt bitmap</dt><dd><code>{bid.receiptBitmap.toString(2).padStart(3, "0")}</code></dd></div>
                      <div><dt>Receipt expiry</dt><dd>{deadline(bid.receiptExpiry)}</dd></div>
                    </dl>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : !selected ? (
        <section className="state-panel">
          <span aria-hidden="true">0</span>
          <div><h2>No open Coston2 tenders</h2><p>Wait for a buyer to open a verified tender, or use My Submissions to inspect this wallet's finalized receipts.</p></div>
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
              <div><strong>{last.block === null ? "Bid transaction broadcast" : "Bid receipt quorum committed"}</strong><span>Tx <a className="text-link" href={`https://coston2-explorer.flare.network/tx/${last.hash}`} target="_blank" rel="noreferrer">{short(last.hash)} ↗</a> · {last.block === null ? "confirmation pending" : `block ${last.block.toString()}`}</span></div>
            </section>
          )}
        </section>
      )}
    </main>
  );
}
