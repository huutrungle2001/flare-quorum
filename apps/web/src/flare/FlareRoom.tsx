import { formatUnits } from "viem";
import { useSearchParams } from "react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { coston2FlarePublicRelease } from "@flarequorum/flare-bindings";
import type { FlareMarketState } from "../public-market/useFlareMarket";
import { useFlareMarket } from "../public-market/useFlareMarket";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import type { WalletController } from "../wallet/WalletPanel";
import { FlareVendorWorkspace } from "./FlareVendorWorkspace";
import { FlareBuyerWorkspace } from "./FlareBuyerWorkspace";
import { FlareAuditorWorkspace } from "./FlareAuditorWorkspace";
import { FlareFinalizerWorkspace } from "./FlareFinalizerWorkspace";
import { FlareWalletAssets } from "./FlareWalletAssets";
import { ContextHelp } from "../shell/ContextHelp";
import { PublicValue } from "../shell/PublicValue";
import { refreshStateEvent } from "../shell/refreshState";
import { scrollToPageTop } from "../shell/navigationScroll";
import { FlareBuyerBriefPanel, useVerifiedFlareBuyerBrief } from "./FlareBuyerBriefPanel";
import {
  clearPendingFlareTender,
  pendingTenderChangedEvent,
  readPendingFlareTender,
} from "./pendingFinality";

type FlareTenderFilter = "current" | "all" | "open" | "compute" | "awarded" | "refunded";
type FlareTenderSort = "newest" | "oldest";

const flareTenderFilters: readonly { value: FlareTenderFilter; label: string }[] = [
  { value: "current", label: "All except cancelled" },
  { value: "all", label: "All tenders" },
  { value: "open", label: "Open" },
  { value: "compute", label: "Close / compute pending" },
  { value: "awarded", label: "Awarded" },
  { value: "refunded", label: "Refunded" },
];

const flareTenderSorts: readonly { value: FlareTenderSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

const publicTendersPerPage = 5;

function short(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function statusClass(status: FlarePublicTender["status"]): string {
  if (status === "Awarded" || status === "Refunded") return "verified";
  if (status === "Open" || status === "Closed" || status === "ComputePending") return "encrypted";
  return "";
}

function explorerAddress(address: string): string {
  return `https://coston2-explorer.flare.network/address/${address}`;
}

function explorerBlock(block: bigint): string {
  return `https://coston2-explorer.flare.network/block/${block.toString()}`;
}

function formatDeadline(timestamp: bigint): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(timestamp) * 1_000));
}

function filterTenders(
  tenders: readonly FlarePublicTender[],
  filter: FlareTenderFilter,
) {
  if (filter === "all") return tenders;
  if (filter === "current") {
    return tenders.filter((tender) => !["Cancelled"].includes(tender.status));
  }
  if (filter === "open") return tenders.filter((tender) => tender.status === "Open");
  if (filter === "compute") {
    return tenders.filter((tender) => ["Closed", "ComputePending"].includes(tender.status));
  }
  return tenders.filter((tender) => tender.status.toLowerCase() === filter);
}

function sortTenders(
  tenders: readonly FlarePublicTender[],
  sort: FlareTenderSort,
) {
  return [...tenders].sort((left, right) => {
    if (left.tenderId === right.tenderId) return 0;
    const leftComesAfter = left.tenderId > right.tenderId;
    return sort === "newest"
      ? (leftComesAfter ? -1 : 1)
      : (leftComesAfter ? 1 : -1);
  });
}

function searchTenders(tenders: readonly FlarePublicTender[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return tenders;
  return tenders.filter((tender) => [
    tender.tenderId.toString(),
    `tender ${tender.tenderId.toString()}`,
    tender.buyer,
    tender.status,
    tender.metadataHash,
  ].some((value) => value.toLowerCase().includes(normalized)));
}

function ProtocolFacts({ compact = false }: { compact?: boolean }) {
  const release = coston2FlarePublicRelease;
  const fact = (label: string, address: string, description: string) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd>
        <a className="text-link" href={explorerAddress(address)} target="_blank" rel="noreferrer">
          {short(address)} ↗
        </a>
        <small>{description}</small>
      </dd>
    </div>
  );
  const facts = (
    <>
      <p>
        The public page exposes only deployment facts and finalized state. FCC
        keeps bids private; FTSO supplies the bound XRP/USD snapshot; FAssets,
        FDC, and Smart Account funding remain explicit testnet paths.
      </p>
      <dl className="term-grid">
        {fact("FCC manager", release.fcc.manager, `extension ${release.fcc.extensionId} · ${release.fcc.version}`)}
        {fact("FTestXRP escrow", release.protocols.fTestXRP, "public Coston2 settlement token")}
        {fact("FAssets FXRP manager", release.protocols.assetManagerFXRP, "FXRP mint/redeem integration")}
        {fact("FTSO v2", release.protocols.ftsoV2, "XRP/USD feed snapshot")}
        {fact("FDC hub", release.protocols.fdcHub, "XRPL payment attestation request")}
        {fact("FDC verification", release.protocols.fdcVerification, "proof verification endpoint")}
        {fact("Smart Account controller", release.protocols.masterAccountController, "XRPL-native direct mint execution")}
        {fact("Award receipt", release.awardReceipt, "non-transferable public settlement proof")}
      </dl>
      <p className="form-hint">FCC code hash: <code>{short(release.fcc.codeHash)}</code> · result threshold: {release.fcc.resultThreshold}/3</p>
    </>
  );
  if (compact) {
    return (
      <details className="evidence-panel protocol-facts protocol-facts-compact">
        <summary>
          <span>
            <span className="eyebrow">VERIFIED FLARE INTEGRATIONS</span>
            <strong>Inspect protocol deployment facts</strong>
          </span>
          <span className="protocol-facts-disclosure-action">
            <span className="privacy-badge verified">COSTON2 / 114</span>
            <span className="protocol-facts-disclosure-label when-closed">8 INTEGRATIONS · CLICK TO EXPAND</span>
            <span className="protocol-facts-disclosure-label when-open">CLICK TO COLLAPSE</span>
            <span className="protocol-facts-chevron" aria-hidden="true">⌄</span>
          </span>
        </summary>
        <div className="protocol-facts-body">{facts}</div>
      </details>
    );
  }
  return (
    <section className="evidence-panel protocol-facts" aria-label="Verified Flare integrations">
      <header className="detail-header">
        <div>
          <p className="eyebrow">VERIFIED FLARE INTEGRATIONS</p>
          <h2>One procurement path, five Flare primitives</h2>
        </div>
        <span className="privacy-badge verified">COSTON2 / 114</span>
      </header>
      {facts}
    </section>
  );
}

function TenderEvidence({ tender }: { tender: FlarePublicTender }) {
  const quorum = tender.commonQuorumBitmap.toString(2).padStart(3, "0");
  const activeStep = tender.status === "Open" ? 0
    : tender.status === "Closed" ? 1
      : tender.status === "ComputePending" ? 2 : 3;
  return (
    <article className="detail-panel">
      <header className="detail-header">
        <div>
          <p className="eyebrow">COSTON2 DOSSIER / TENDER {tender.tenderId.toString()}</p>
          <h2>FCC-bound procurement evidence</h2>
        </div>
        <ContextHelp
          compact
          label={`Help for tender ${tender.tenderId.toString()}`}
          title="HOW TO READ THIS COSTON2 DOSSIER"
          steps={[
            "Public rules and the metadata hash are immutable contract facts.",
            "Each accepted commitment must carry all three tender-fixed TEE receipts.",
            "Close freezes the ordered root and XRP/USD FTSO snapshot before FCC scoring.",
            "An Awarded tender exposes the winner, payout, result digest, and receipt while losing terms remain sealed.",
          ]}
        />
        <span className={`privacy-badge ${statusClass(tender.status)}`}>{tender.status.toUpperCase()}</span>
      </header>
      <ol className="lifecycle" aria-label="Flare tender lifecycle">
        {["OPEN", "CLOSED", "FCC COMPUTE", "AWARD / REFUND"].map((step, index) => (
          <li key={step} className={index < activeStep ? "complete" : index === activeStep ? "active" : ""}>
            <span>{index < activeStep ? "✓" : index + 1}</span>{step}
          </li>
        ))}
      </ol>
      <FlareBuyerBriefPanel tender={tender} />
      <dl className="term-grid">
        <div><dt>Public escrow ceiling</dt><dd>{formatUnits(tender.publicCeilingXrp, 6)} FTestXRP</dd></div>
        <div><dt>Bid deadline</dt><dd>{formatDeadline(tender.bidDeadline)}</dd></div>
        <div><dt>Accepted bids</dt><dd>{tender.bidCount.toString()} / {tender.approvedVendorCount}</dd></div>
        <div><dt>Common TEE quorum</dt><dd>{quorum} / threshold 2</dd></div>
        <div><dt>Quote currencies</dt><dd>{[tender.scoringPolicy.allowXrp && "XRP", tender.scoringPolicy.allowUsd && "USD"].filter(Boolean).join(" + ")}</dd></div>
        <div><dt>Scoring weights</dt><dd>{tender.scoringPolicy.priceWeightBps / 100}% price / {tender.scoringPolicy.deliveryWeightBps / 100}% delivery / {tender.scoringPolicy.warrantyWeightBps / 100}% warranty</dd></div>
        <div><dt>Service bounds</dt><dd>≤ {tender.scoringPolicy.maxDeliveryDays}d delivery / {tender.scoringPolicy.minWarrantyDays}–{tender.scoringPolicy.maxWarrantyDays}d warranty</dd></div>
        <div><dt>Credential requirements</dt><dd>{tender.scoringPolicy.requiredCredentials.length}</dd></div>
      </dl>
      <section className="privacy-panel">
        <div className="aperture" aria-hidden="true"><span /></div>
        <div>
          <p className="eyebrow">PUBLIC CHECKPOINT / PRIVATE LOSING BIDS</p>
          <h3>{tender.status === "Awarded"
            ? "Winner published — losing bids remain private"
            : tender.status === "Refunded"
              ? "Tender refunded — bid details remain private"
              : "Result pending — losing bids remain private"}</h3>
          <p>Only commitments, receipt quorum, FTSO snapshot, and the threshold-signed public outcome appear here. Bid payloads are never fetched by this view.</p>
        </div>
      </section>
      {tender.award && (
        <section className="award-proof-panel awarded" aria-label="Public award receipt">
          <div>
            <p className="eyebrow">TEE-SIGNED RESULT / PUBLIC SETTLEMENT</p>
            <h3>AWARDED</h3>
            <p>Winner <strong>{short(tender.award.winner)}</strong> received <strong>{formatUnits(tender.award.amount, 6)} FTestXRP</strong>. Losing offers remain sealed.</p>
          </div>
          <dl>
            <div><dt>Award receipt</dt><dd>#{tender.award.tenderId.toString()} · NON-TRANSFERABLE</dd></div>
            <div><dt>Winning bid</dt><dd>#{tender.award.winnerBidId.toString()}</dd></div>
            <div><dt>Buyer remainder</dt><dd>{formatUnits(tender.publicCeilingXrp - tender.award.amount, 6)} FTestXRP</dd></div>
            <div><dt>Conservation</dt><dd>WINNER + REMAINDER = ESCROW</dd></div>
          </dl>
          <a className="secondary-button" href={explorerAddress(coston2FlarePublicRelease.awardReceipt)} target="_blank" rel="noreferrer">INSPECT AWARD CONTRACT →</a>
        </section>
      )}
      <details className="technical-verification-details">
        <summary>
          <span>
            <span className="eyebrow">TECHNICAL VERIFICATION DETAILS</span>
            <strong>Hashes, TEE identities, receipts &amp; protocol binding</strong>
          </span>
          <span className="technical-disclosure-action"><span>CLICK TO EXPAND</span><span aria-hidden="true">⌄</span></span>
        </summary>
        <div className="technical-verification-body">
          <dl className="term-grid">
            <div><dt>Buyer / PersonalAccount</dt><dd><PublicValue value={tender.buyer} label="buyer address" href={explorerAddress(tender.buyer)} /></dd></div>
            <div><dt>Public brief hash</dt><dd><PublicValue value={tender.metadataHash} label="public brief hash" /></dd></div>
            <div><dt>Canonical rules hash</dt><dd><PublicValue value={tender.rulesHash} label="canonical rules hash" /></dd></div>
            <div><dt>Extension</dt><dd>{tender.extensionId.toString()}</dd></div>
            <div><dt>Code version</dt><dd><PublicValue value={tender.codeVersion} label="code version" /></dd></div>
            <div><dt>Selection attempt</dt><dd>{tender.selectionAttempt || "Not requested"}</dd></div>
            <div><dt>Request ID</dt><dd><PublicValue value={tender.requestId} label="request ID" /></dd></div>
          </dl>
          <section className="tee-policy-panel" aria-label="Tender-fixed TEE policy">
            <header><p className="eyebrow">FROZEN MACHINE POLICY</p><span className="privacy-badge verified">3 RECEIPTS / 2 RESULTS</span></header>
            <div className="tee-policy-grid">
              {tender.teeIds.map((teeId, index) => (
                <article key={teeId}>
                  <strong>TEE {index + 1}</strong>
                  <PublicValue value={teeId} label={`TEE ${index + 1} identity`} href={explorerAddress(teeId)} />
                  <PublicValue value={tender.teeKeyFingerprints[index]} label={`TEE ${index + 1} key fingerprint`} />
                </article>
              ))}
            </div>
          </section>
          {tender.bidReferences.length > 0 && (
            <section className="public-bid-reference-panel" aria-label="Public accepted bid commitments">
              <header><p className="eyebrow">ACCEPTED COMMITMENTS</p><span>{tender.bidReferences.length} PUBLIC REFERENCES</span></header>
              <div>
                {tender.bidReferences.map((bid) => (
                  <article key={bid.bidId.toString()}>
                    <strong>BID {bid.bidId.toString()}</strong>
                    <span title={bid.vendor}>{short(bid.vendor)}</span>
                    <code title={bid.plaintextCommitment}>{short(bid.plaintextCommitment)}</code>
                    <span>RECEIPTS {bid.receiptBitmap.toString(2).padStart(3, "0")}</span>
                    <a className="text-link" href={explorerBlock(bid.acceptedBlock)} target="_blank" rel="noreferrer">BLOCK {bid.acceptedBlock.toString()} ↗</a>
                  </article>
                ))}
              </div>
            </section>
          )}
          <section className="technical-protocol-binding">
            <p className="eyebrow">FLARE PROTOCOL BINDING</p>
            <dl>
              <div><dt>Ordered bid root</dt><dd><PublicValue value={tender.orderedBidRoot} label="ordered bid root" /></dd></div>
              <div><dt>FTSO feed</dt><dd><PublicValue value={tender.ftsoFeedId} label="FTSO feed ID" /></dd></div>
              <div><dt>FTSO value / decimals</dt><dd>{tender.ftsoValue.toString()} / {tender.ftsoDecimals}</dd></div>
              <div><dt>FTSO timestamp</dt><dd>{tender.ftsoTimestamp.toString()}</dd></div>
              <div><dt>Close block</dt><dd>{tender.closeBlock.toString()}</dd></div>
              <div><dt>Result expiry</dt><dd>{tender.resultExpiry.toString()}</dd></div>
              {tender.award && <div><dt>Winner address</dt><dd><PublicValue value={tender.award.winner} label="winner address" href={explorerAddress(tender.award.winner)} /></dd></div>}
              {tender.award && <div><dt>Result digest</dt><dd><PublicValue value={tender.award.resultDigest} label="result digest" /></dd></div>}
              {tender.award && <div><dt>Finalized block</dt><dd>{tender.award.finalizedBlock.toString()}</dd></div>}
            </dl>
          </section>
        </div>
      </details>
    </article>
  );
}

function PublicTenderCard({ tender, selected, onSelect }: {
  tender: FlarePublicTender;
  selected: boolean;
  onSelect: () => void;
}) {
  const briefState = useVerifiedFlareBuyerBrief(tender.metadataHash);
  const title = briefState.status === "verified" ? briefState.brief.title : `Tender #${tender.tenderId.toString()}`;
  return (
    <div className="tender-card-shell">
      <button type="button" onClick={onSelect} aria-pressed={selected} className={`tender-card ${selected ? "selected" : ""}`}>
        <span className="card-kicker">{tender.status.toUpperCase()} / TENDER #{tender.tenderId.toString()}</span>
        <span className="card-title">{title}</span>
        <span className="card-buyer">Buyer · {short(tender.buyer)}</span>
        <span className="card-facts"><span><strong>{formatUnits(tender.publicCeilingXrp, 6)} FTestXRP</strong>Public ceiling</span><span><strong>{tender.bidCount.toString()}/{tender.approvedVendorCount}</strong>Accepted bids</span></span>
        <span className="card-deadline">Deadline · {formatDeadline(tender.bidDeadline)}</span>
        <span className="card-footer"><span className={`privacy-badge ${statusClass(tender.status)}`}>{tender.status.toUpperCase()}</span><span className="card-arrow" aria-hidden="true">→</span></span>
      </button>
    </div>
  );
}

export function FlareEvidenceWorkspace({
  state,
  onRetry,
}: {
  state: FlareMarketState;
  onRetry: () => void;
}) {
  const tenders = state.data?.tenders ?? [];
  return (
    <main id="main-content" className="role-workspace flare-evidence-workspace">
      <section className="workspace-intro">
        <p className="eyebrow">COSTON2 ACTIVITY / PUBLIC EVIDENCE</p>
        <h1>Trace every public checkpoint.</h1>
        <p>
          This ledger rereads finalized Coston2 state only. It shows how a
          tender moved from public rules to FCC quorum and settlement without
          fetching bid payloads, credentials, or private TEE results.
        </p>
      </section>
      <ProtocolFacts />
      <span id="tenders" className="scroll-anchor" aria-hidden="true" />
      {state.status === "loading" && (
        <section className="state-panel" aria-live="polite">
          <span className="loading-mark" aria-hidden="true" />
          <div><h2>Reading finalized Coston2 checkpoints</h2><p>No placeholder activity is inserted.</p></div>
        </section>
      )}
      {state.status === "error" && (
        <section className="state-panel error" role="alert">
          <span aria-hidden="true">!</span>
          <div><h2>Evidence state unavailable</h2><p>{state.error}</p><button className="secondary-button" onClick={onRetry}>RETRY COSTON2 →</button></div>
        </section>
      )}
      {state.status === "ready" && state.data && tenders.length === 0 && (
        <section className="state-panel">
          <span aria-hidden="true">0</span>
          <div><h2>No public checkpoints yet</h2><p>The verified market has no tender records at its finalized block.</p></div>
        </section>
      )}
      {state.status === "ready" && state.data && tenders.length > 0 && (
        <section className="evidence-panel" aria-label="Coston2 public evidence ledger">
          <header className="detail-header">
            <div><p className="eyebrow">FINALIZED CHECKPOINT LEDGER</p><h2>{tenders.length} tender{tenders.length === 1 ? "" : "s"} in public state</h2></div>
          </header>
          <div className="flare-evidence-ledger">
            {tenders.map((tender) => (
              <article className="flare-evidence-row" key={tender.tenderId.toString()}>
                <header className="detail-header">
                  <div><p className="eyebrow">TENDER {tender.tenderId.toString()}</p><h3>Public rules → private compute → public outcome</h3></div>
                  <span className={`privacy-badge ${statusClass(tender.status)}`}>{tender.status.toUpperCase()}</span>
                </header>
                <ol className="lifecycle" aria-label={`Public lifecycle for tender ${tender.tenderId.toString()}`}>
                  {[
                    { label: "Rules / escrow", complete: tender.publicCeilingXrp > 0n },
                    { label: "TEE receipt quorum", complete: tender.bidCount > 0n },
                    { label: "FTSO close snapshot", complete: tender.closeBlock > 0n },
                    { label: "Settlement / refund", complete: tender.status === "Awarded" || tender.status === "Refunded" },
                  ].map(({ label, complete }, index) => (
                    <li key={label} className={complete ? "complete" : index === 0 ? "active" : ""}>
                      <span>{complete ? "✓" : index + 1}</span>{label}
                    </li>
                  ))}
                </ol>
                <dl className="term-grid">
                  <div><dt>Escrow ceiling</dt><dd>{formatUnits(tender.publicCeilingXrp, 6)} FTestXRP</dd></div>
                  <div><dt>Receipt quorum</dt><dd>{tender.commonQuorumBitmap.toString(2).padStart(3, "0")} · {tender.bidCount.toString()} accepted</dd></div>
                  <div><dt>Rules hash</dt><dd title={tender.rulesHash}>{short(tender.rulesHash)}</dd></div>
                  <div><dt>Ordered bid root</dt><dd title={tender.orderedBidRoot}>{short(tender.orderedBidRoot)}</dd></div>
                  <div><dt>FTSO snapshot</dt><dd>{tender.ftsoTimestamp > 0n ? `${tender.ftsoValue.toString()} @ ${tender.ftsoTimestamp.toString()}` : "Not captured"}</dd></div>
                  <div><dt>Close block</dt><dd>{tender.closeBlock > 0n ? tender.closeBlock.toString() : "Not closed"}</dd></div>
                  <div><dt>FCC binding</dt><dd>ext {tender.extensionId.toString()} · {short(tender.codeVersion)}</dd></div>
                  <div><dt>Outcome</dt><dd>{tender.winner ? `Winner ${short(tender.winner)} · ${formatUnits(tender.winningAmountXrp ?? 0n, 6)} FTestXRP` : tender.status === "Refunded" ? "Escrow refunded" : "Threshold result pending"}</dd></div>
                </dl>
                <p className="form-hint">Only public commitments, finalized checkpoints, and the award/refund state are exposed. Losing prices and TEE plaintext never enter this ledger.</p>
              </article>
            ))}
          </div>
          <footer className="form-hint">Finalized through block {state.data.finalizedBlock.toString()} · latest observed block {state.data.latestBlock.toString()}</footer>
        </section>
      )}
    </main>
  );
}

type FlareRole = "public" | "buyer" | "vendor" | "finalizer" | "evidence";

export function FlareRoleBar({
  activeRole,
  onRoleChange,
}: {
  activeRole: FlareRole;
  onRoleChange: (role: FlareRole) => void;
}) {
  const items: readonly [FlareRole, string][] = [
    ["public", "PUBLIC"],
    ["buyer", "BUYER"],
    ["vendor", "PRIVATE BIDS"],
    ["finalizer", "ACTIVITY"],
    ["evidence", "AUDITOR"],
  ];
  return (
    <nav className="rolebar flare-rolebar" aria-label="Coston2 workspaces">
      <div className="rolebar-links">
        {items.map(([role, label]) => (
          <button
            key={role}
            type="button"
            className={activeRole === role ? "active" : ""}
            aria-current={activeRole === role ? "page" : undefined}
            onClick={() => {
              scrollToPageTop();
              onRoleChange(role);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function FlareAppSidebar({
  activeRole,
  onRoleChange,
  wallet,
}: {
  activeRole: FlareRole;
  onRoleChange: (role: FlareRole) => void;
  wallet?: WalletController;
}) {
  const connected =
    wallet?.state.status === "connected" && Boolean(wallet.state.account);
  const actionWorkspace = ["buyer", "vendor", "finalizer"].includes(activeRole);
  return (
    <aside className="flare-app-sidebar" aria-label="Tender application sidebar">
      <div className="flare-sidebar-heading">
        <p className="eyebrow">TENDER ROOM</p>
        <strong>FLARE / COSTON2</strong>
      </div>
      <FlareRoleBar activeRole={activeRole} onRoleChange={onRoleChange} />
      {wallet && (connected || actionWorkspace) ? (
        <FlareWalletAssets wallet={wallet} />
      ) : (
        <section className="flare-sidebar-readonly" aria-label="Wallet-free workspace">
          <p className="eyebrow">WALLET OPTIONAL</p>
          <strong>PUBLIC READS NEED NO SIGNATURE</strong>
          <p>Connect only after moving to a workspace with an on-chain action.</p>
        </section>
      )}
      <section className="flare-sidebar-assets" aria-label="Coston2 asset actions">
        <p className="eyebrow">COSTON2 ASSETS</p>
        <a className="sidebar-asset-button" href="https://faucet.flare.network/coston2" target="_blank" rel="noreferrer">GET TEST C2FLR &amp; FXRP ↗</a>
        <p className="sidebar-asset-note">Funding options are inside BUYER. XRP redemption eligibility appears under ACTIVITY / ASSETS for a connected winning vendor. FTestXRP settlement amounts are public.</p>
      </section>
      <p className="flare-sidebar-footnote">PUBLIC READS · 12-BLOCK FINALITY · NO BID PAYLOADS</p>
    </aside>
  );
}

function FlareRoleWorkspace({
  activeRole,
  onRoleChange,
  wallet,
  children,
}: {
  activeRole: FlareRole;
  onRoleChange: (role: FlareRole) => void;
  wallet?: WalletController;
  children: ReactNode;
}) {
  return (
    <div className="tender-layout flare-tender-layout">
      <FlareAppSidebar activeRole={activeRole} onRoleChange={onRoleChange} wallet={wallet} />
      <div className="flare-app-main">{children}</div>
    </div>
  );
}

export function FlareExplorerView({ state, onRetry }: { state: FlareMarketState; onRetry: () => void }) {
  const [params, setParams] = useSearchParams();
  const tenders = state.data?.tenders ?? [];
  const [pendingTender, setPendingTender] = useState(readPendingFlareTender);
  useEffect(() => {
    const syncPendingTender = () => setPendingTender(readPendingFlareTender());
    window.addEventListener(pendingTenderChangedEvent, syncPendingTender);
    return () => window.removeEventListener(pendingTenderChangedEvent, syncPendingTender);
  }, []);
  useEffect(() => {
    if (!pendingTender) return;
    if (tenders.some((tender) => tender.tenderId.toString() === pendingTender.tenderId)) {
      clearPendingFlareTender(pendingTender.tenderId);
    }
  }, [pendingTender, tenders]);
  const pendingFinality = pendingTender
    && !tenders.some((tender) => tender.tenderId.toString() === pendingTender.tenderId)
    ? pendingTender
    : null;
  const requestedFilter = params.get("status");
  const filter = flareTenderFilters.some((option) => option.value === requestedFilter)
    ? requestedFilter as FlareTenderFilter
    : "current";
  const requestedSort = params.get("sort");
  const sort = flareTenderSorts.some((option) => option.value === requestedSort)
    ? requestedSort as FlareTenderSort
    : "newest";
  const query = params.get("q")?.trim() ?? "";
  const visibleTenders = useMemo(
    () => searchTenders(sortTenders(filterTenders(tenders, filter), sort), query),
    [filter, query, sort, tenders],
  );
  const selectedId = params.get("tender");
  const selectedIndex = visibleTenders.findIndex((tender) => tender.tenderId.toString() === selectedId);
  const requestedPage = Number(params.get("page"));
  const pageCount = Math.max(1, Math.ceil(visibleTenders.length / publicTendersPerPage));
  const inferredPage = selectedIndex >= 0 ? Math.floor(selectedIndex / publicTendersPerPage) + 1 : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= pageCount
    ? requestedPage
    : inferredPage;
  const pageTenders = visibleTenders.slice((page - 1) * publicTendersPerPage, page * publicTendersPerPage);
  const selected = visibleTenders.find((tender) => tender.tenderId.toString() === selectedId) ?? pageTenders[0] ?? null;

  function setFilter(nextFilter: FlareTenderFilter) {
    const updated = new URLSearchParams(params);
    if (nextFilter === "current") updated.delete("status");
    else updated.set("status", nextFilter);
    updated.delete("tender");
    updated.delete("page");
    setParams(updated);
  }

  function setSort(nextSort: FlareTenderSort) {
    const updated = new URLSearchParams(params);
    if (nextSort === "newest") updated.delete("sort");
    else updated.set("sort", nextSort);
    updated.delete("tender");
    updated.delete("page");
    setParams(updated);
  }

  function setQuery(nextQuery: string) {
    const updated = new URLSearchParams(params);
    if (nextQuery.trim()) updated.set("q", nextQuery);
    else updated.delete("q");
    updated.delete("tender");
    updated.delete("page");
    setParams(updated, { replace: true });
  }

  function setPage(nextPage: number) {
    const updated = new URLSearchParams(params);
    if (nextPage <= 1) updated.delete("page");
    else updated.set("page", nextPage.toString());
    updated.delete("tender");
    setParams(updated);
    window.setTimeout(() => document.getElementById("tenders")?.scrollIntoView?.({ block: "start" }), 0);
  }

  function clearExplorerFilters() {
    const updated = new URLSearchParams(params);
    updated.delete("status");
    updated.delete("q");
    updated.delete("tender");
    updated.delete("page");
    setParams(updated);
  }

  function selectTender(tenderId: bigint) {
    const updated = new URLSearchParams(params);
    updated.set("tender", tenderId.toString());
    if (page <= 1) updated.delete("page");
    else updated.set("page", page.toString());
    setParams(updated);
    window.setTimeout(() => document.getElementById("tenders")?.scrollIntoView?.({ block: "start" }), 0);
  }

  return (
    <main id="main-content" className="tender-surface">
      <section className="explorer-intro flare-explorer-intro">
        <ContextHelp
          label="Help for Public workspace"
          title="HOW TO USE PUBLIC"
          steps={[
            "Choose a finalized Coston2 tender from the dossier list.",
            "Review the public ceiling, deadline, lifecycle, rules, bid receipts, and award state.",
            "Use Auditor for a checkpoint proof view; losing prices and TEE plaintext never appear here.",
          ]}
          note="Public reads never require a wallet and never substitute Sepolia or mock chain state."
        />
        <div><p className="eyebrow">CONFIDENTIAL PROCUREMENT / LIVE COSTON2 STATE</p><h1>Public rules.<br /><em>Private bids.</em></h1></div>
        <div className="intro-copy"><p>Browse finalized tender coordination without connecting a wallet. Commercial terms remain sealed while public award and settlement evidence stay inspectable.</p><span className="deployment-label">{state.data?.deploymentStatus === "verified" ? "VERIFIED COSTON2 RELEASE" : "COSTON2 DEPLOYMENT · NOT YET VERIFIED"}</span></div>
      </section>
      <ProtocolFacts compact />
      {pendingFinality && (
        <section className="my-submission-card pending-finality public-pending-tender" aria-live="polite">
          <header>
            <div><p className="eyebrow">TENDER {pendingFinality.tenderId} · JUST CREATED</p><h3>Confirmed on Coston2</h3></div>
            <span className="privacy-badge encrypted">WAITING FOR 12-BLOCK FINALITY</span>
          </header>
          <p className="submission-explainer">This public-safe checkpoint came from the confirmed creation receipt in this tab. Public refresh runs every 3 seconds and will replace it with the canonical dossier after finality.</p>
          <div className="my-submission-actions">
            <a className="secondary-button" href={`https://coston2-explorer.flare.network/tx/${pendingFinality.transactionHash}`} target="_blank" rel="noreferrer">VIEW TRANSACTION ↗</a>
          </div>
        </section>
      )}
      {state.status === "loading" && <section className="state-panel"><span className="loading-mark" /><div><h2>Reading Coston2 state</h2><p>No placeholder tender is inserted.</p></div></section>}
      {state.status === "error" && <section className="state-panel error" role="alert"><span>!</span><div><h2>Flare state unavailable</h2><p>{state.error}</p><button className="secondary-button" onClick={onRetry}>RETRY COSTON2 →</button></div></section>}
      {state.status === "ready" && tenders.length === 0 && <section className="state-panel"><span>0</span><div><h2>No Coston2 tenders yet</h2><p>The configured market has no public tender records.</p></div></section>}
      {state.status === "ready" && state.data && tenders.length > 0 && (
        <section className="flare-explorer-heading">
          <div>
            <p className="eyebrow">WALLET-FREE COSTON2 EXPLORER</p>
            <h2>Public rules. Private commercial terms.</h2>
          </div>
          <p>Every dossier below is read at finalized block {state.data.finalizedBlock.toString()}. No mock tender or Sepolia fallback is inserted.</p>
        </section>
      )}
      {state.status === "ready" && state.data && tenders.length > 0 && visibleTenders.length === 0 && (
        <section className="state-panel">
          <span aria-hidden="true">0</span>
          <div><h2>No tenders match this view</h2><p>Canonical Coston2 state loaded successfully; clear the search or choose another public status filter.</p><button className="secondary-button" type="button" onClick={clearExplorerFilters}>CLEAR FILTERS →</button></div>
        </section>
      )}
      {state.status === "ready" && state.data && selected && (
        <section id="tenders" className="explorer-grid">
          <aside className="dossier-list">
            <div className="dossier-list-controls">
              <header><div><p className="eyebrow">COSTON2 DOSSIERS</p><h2>{visibleTenders.length} tender{visibleTenders.length === 1 ? "" : "s"}</h2></div></header>
              <label className="public-search-control">
                <span>Search public state</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tender ID, buyer or status" />
              </label>
              <div className="public-filter-controls">
                <label className="public-filter-control"><span>Show</span><select aria-label="Filter Coston2 tenders" value={filter} onChange={(event) => setFilter(event.target.value as FlareTenderFilter)}>{flareTenderFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="public-filter-control"><span>Sort by</span><select aria-label="Sort Coston2 tenders" value={sort} onChange={(event) => setSort(event.target.value as FlareTenderSort)}>{flareTenderSorts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </div>
            </div>
            {pageTenders.map((tender) => <PublicTenderCard key={tender.tenderId.toString()} tender={tender} selected={selected?.tenderId === tender.tenderId} onSelect={() => selectTender(tender.tenderId)} />)}
            {pageCount > 1 && (
              <nav className="public-pagination" aria-label="Tender list pages">
                <button className="secondary-button" type="button" onClick={() => setPage(page - 1)} disabled={page === 1}>← PREVIOUS</button>
                <span>PAGE {page} / {pageCount}</span>
                <button className="secondary-button" type="button" onClick={() => setPage(page + 1)} disabled={page === pageCount}>NEXT →</button>
              </nav>
            )}
          </aside>
          <TenderEvidence tender={selected} />
        </section>
      )}
      <section className="flare-visibility-section">
        <div><p className="eyebrow">KNOW THE PRIVACY BOUNDARY</p><h2>Public coordination. Sealed competition.</h2></div>
        <div className="audit-boundary-grid">
          <article><span className="privacy-badge verified">PUBLIC</span><h3>Rules &amp; settlement</h3><p>Buyer, approved participation, deadline, ceiling, scoring policy, commitments, TEE identities, FTSO snapshot, winner, and payout.</p></article>
          <article><span className="privacy-badge encrypted">SEALED IN TEE</span><h3>Commercial terms</h3><p>Losing prices, delivery, warranty, qualification credentials, salt, intermediate eligibility, and component penalties.</p></article>
        </div>
      </section>
      <section className="flare-faq-section">
        <div><p className="eyebrow">BEFORE YOU START</p><h2>Common questions.</h2></div>
        <div>
          <details><summary>Do I need a wallet to inspect FlareQuorum?</summary><p>No. Public dossiers and Auditor evidence are wallet-free. Connect a Coston2 wallet only for a transaction action.</p></details>
          <details><summary>Can the buyer or finalizer choose the winner?</summary><p>No. The market settles only a result signed by two distinct tender-fixed FCC identities over the exact frozen domain.</p></details>
          <details><summary>Are bidder identities and winning amounts private?</summary><p>No. Participation, transaction timing, winner, and ordinary FTestXRP settlement amounts are public by design.</p></details>
          <details><summary>What happens when a TEE restarts?</summary><p>Its identity rotates. A normally registered replacement serves new tenders; an existing tender never swaps its frozen machine set.</p></details>
        </div>
      </section>
      <footer><div><span className="wordmark inverted">FLAREQUORUM</span><p>Threshold confidential procurement on Coston2.</p></div><div className="footer-meta"><span>FLARE COSTON2 / 114</span><span>TEST ASSETS ONLY</span><span>UNAUDITED HACKATHON SOFTWARE</span></div></footer>
    </main>
  );
}

export function FlareRoom({ wallet }: { wallet?: WalletController } = {}) {
  const { state, refresh } = useFlareMarket();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const onRefresh = () => void refresh();
    window.addEventListener(refreshStateEvent, onRefresh);
    return () => window.removeEventListener(refreshStateEvent, onRefresh);
  }, [refresh]);
  const role = params.get("role")?.toLowerCase();
  const legacyTreasury = role === "treasury";
  const activeRole: FlareRole = legacyTreasury
    ? "buyer"
    : role === "buyer" || role === "vendor"
    || role === "finalizer" || role === "evidence"
    ? role
    : role === "auditor"
      ? "evidence"
      : role === "activity"
        ? "finalizer"
        : "public";
  const onRoleChange = (next: FlareRole) => {
    const updated = new URLSearchParams(params);
    if (next === "public") updated.delete("role");
    else updated.set("role", next);
    setParams(updated);
  };
  if (activeRole === "evidence") {
    return (
      <FlareRoleWorkspace activeRole={activeRole} onRoleChange={onRoleChange} wallet={wallet}>
        {state.status === "ready" && state.data ? (
          <FlareAuditorWorkspace tenders={state.data.tenders} finalizedBlock={state.data.finalizedBlock} />
        ) : (
          <FlareEvidenceWorkspace state={state} onRetry={() => void refresh()} />
        )}
      </FlareRoleWorkspace>
    );
  }
  if (activeRole === "buyer" && wallet) {
    return (
      <FlareRoleWorkspace activeRole={activeRole} onRoleChange={onRoleChange} wallet={wallet}>
        <FlareBuyerWorkspace wallet={wallet} onRefresh={() => void refresh()} initialFundingMethod={legacyTreasury ? "xrpl" : "coston2"} />
      </FlareRoleWorkspace>
    );
  }
  if ((activeRole === "vendor" || activeRole === "finalizer") && wallet) {
    return (
      <FlareRoleWorkspace activeRole={activeRole} onRoleChange={onRoleChange} wallet={wallet}>
        {state.status === "ready" && state.data ? (
          activeRole === "vendor"
            ? <FlareVendorWorkspace wallet={wallet} tenders={state.data.tenders} onRefresh={() => void refresh()} />
            : <FlareFinalizerWorkspace wallet={wallet} tenders={state.data.tenders} onRefresh={() => void refresh()} />
        ) : (
          <main id="main-content" className="role-workspace">
            <section className={`state-panel${state.status === "error" ? " error" : ""}`} role={state.status === "error" ? "alert" : undefined}>
              <span className={state.status === "loading" ? "loading-mark" : undefined} aria-hidden="true">{state.status === "error" ? "!" : ""}</span>
              <div><h1>{state.status === "loading" ? "Reading finalized Coston2 state" : "Coston2 state unavailable"}</h1><p>{state.error ?? "No placeholder workspace is inserted while canonical state loads."}</p></div>
            </section>
          </main>
        )}
      </FlareRoleWorkspace>
    );
  }
  return (
    <FlareRoleWorkspace activeRole="public" onRoleChange={onRoleChange} wallet={wallet}>
      <FlareExplorerView state={state} onRetry={() => void refresh()} />
    </FlareRoleWorkspace>
  );
}
