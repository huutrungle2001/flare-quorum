import { formatUnits } from "viem";
import { useSearchParams } from "react-router";
import { useState } from "react";
import { coston2FlarePublicRelease } from "@veilbid/flare-bindings";
import type { FlareMarketState } from "../public-market/useFlareMarket";
import { useFlareMarket } from "../public-market/useFlareMarket";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import type { WalletController } from "../wallet/WalletPanel";
import { FlareVendorWorkspace } from "./FlareVendorWorkspace";
import { FlareBuyerWorkspace } from "./FlareBuyerWorkspace";

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

function ProtocolFacts() {
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
  return (
    <section className="evidence-panel protocol-facts" aria-label="Verified Flare integrations">
      <header className="detail-header">
        <div>
          <p className="eyebrow">VERIFIED FLARE INTEGRATIONS</p>
          <h2>One procurement path, five Flare primitives</h2>
        </div>
        <span className="privacy-badge verified">COSTON2 / 114</span>
      </header>
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
        <span className={`privacy-badge ${statusClass(tender.status)}`}>{tender.status.toUpperCase()}</span>
      </header>
      <ol className="lifecycle" aria-label="Flare tender lifecycle">
        {["OPEN", "CLOSED", "FCC COMPUTE", "AWARD / REFUND"].map((step, index) => (
          <li key={step} className={index < activeStep ? "complete" : index === activeStep ? "active" : ""}>
            <span>{index < activeStep ? "✓" : index + 1}</span>{step}
          </li>
        ))}
      </ol>
      <dl className="term-grid">
        <div><dt>Public escrow ceiling</dt><dd>{formatUnits(tender.publicCeilingXrp, 6)} FTestXRP</dd></div>
        <div><dt>Accepted bids</dt><dd>{tender.bidCount.toString()} / {tender.approvedVendorCount}</dd></div>
        <div><dt>Buyer / PersonalAccount</dt><dd title={tender.buyer}>{short(tender.buyer)}</dd></div>
        <div><dt>Common TEE quorum</dt><dd>{quorum} / threshold 2</dd></div>
        <div><dt>Quote currencies</dt><dd>{[tender.scoringPolicy.allowXrp && "XRP", tender.scoringPolicy.allowUsd && "USD"].filter(Boolean).join(" + ")}</dd></div>
        <div><dt>Scoring weights</dt><dd>{tender.scoringPolicy.priceWeightBps / 100}% price / {tender.scoringPolicy.deliveryWeightBps / 100}% delivery / {tender.scoringPolicy.warrantyWeightBps / 100}% warranty</dd></div>
        <div><dt>Service bounds</dt><dd>≤ {tender.scoringPolicy.maxDeliveryDays}d delivery / {tender.scoringPolicy.minWarrantyDays}–{tender.scoringPolicy.maxWarrantyDays}d warranty</dd></div>
        <div><dt>Credential requirements</dt><dd>{tender.scoringPolicy.requiredCredentials.length}</dd></div>
        <div><dt>Extension</dt><dd>{tender.extensionId.toString()}</dd></div>
        <div><dt>Code version</dt><dd title={tender.codeVersion}>{short(tender.codeVersion)}</dd></div>
        <div><dt>Selection attempt</dt><dd>{tender.selectionAttempt || "Not requested"}</dd></div>
        <div><dt>Request ID</dt><dd title={tender.requestId}>{short(tender.requestId)}</dd></div>
      </dl>
      <section className="privacy-panel">
        <div className="aperture" aria-hidden="true"><span /></div>
        <div>
          <p className="eyebrow">PUBLIC CHECKPOINT / PRIVATE LOSING BIDS</p>
          <h3>{tender.winner ? `Awarded to ${short(tender.winner)}` : "No threshold result published yet"}</h3>
          <p>Only commitments, receipt quorum, FTSO snapshot, and the threshold-signed public outcome appear here. Bid payloads are never fetched by this view.</p>
        </div>
      </section>
      <section className="evidence-panel">
        <p className="eyebrow">FLARE PROTOCOL BINDING</p>
        <dl>
          <div><dt>Ordered bid root</dt><dd title={tender.orderedBidRoot}>{short(tender.orderedBidRoot)}</dd></div>
          <div><dt>FTSO feed</dt><dd title={tender.ftsoFeedId}>{short(tender.ftsoFeedId)}</dd></div>
          <div><dt>FTSO value / decimals</dt><dd>{tender.ftsoValue.toString()} / {tender.ftsoDecimals}</dd></div>
          <div><dt>FTSO timestamp</dt><dd>{tender.ftsoTimestamp.toString()}</dd></div>
          <div><dt>Close block</dt><dd>{tender.closeBlock.toString()}</dd></div>
          <div><dt>Result expiry</dt><dd>{tender.resultExpiry.toString()}</dd></div>
        </dl>
      </section>
    </article>
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
            <button className="icon-button" onClick={onRetry} aria-label="Refresh Coston2 evidence">↻</button>
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

type FlareRole = "public" | "buyer" | "vendor" | "evidence";

function FlareRoleBar({
  activeRole,
  onRoleChange,
}: {
  activeRole: FlareRole;
  onRoleChange: (role: FlareRole) => void;
}) {
  const items: readonly [FlareRole, string][] = [
    ["public", "PUBLIC EVIDENCE"],
    ["buyer", "BUYER"],
    ["vendor", "VENDOR"],
    ["evidence", "ACTIVITY / EVIDENCE"],
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
            onClick={() => onRoleChange(role)}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function FlareExplorerView({ state, onRetry }: { state: FlareMarketState; onRetry: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tenders = state.data?.tenders ?? [];
  const selected = tenders.find((tender) => tender.tenderId.toString() === selectedId) ?? tenders[0] ?? null;
  return (
    <main id="main-content" className="tender-surface">
      <section className="explorer-intro">
        <div>
          <p className="eyebrow">VEILBID FLARE / COSTON2</p>
          <h1>Public rules.<br /><em>TEE-selected bids.</em></h1>
        </div>
        <div className="intro-copy">
          <p>Wallet-free evidence view for the Flare release. FCC, FTSO, FAssets and Smart Account facts are read only from configured Coston2 contracts.</p>
          <span className="deployment-label">{state.data?.deploymentStatus === "verified" ? "VERIFIED COSTON2 RELEASE" : "PLANNED / NOT YET VERIFIED"}</span>
          <div className="intro-actions" role="group" aria-label="Open Flare workspaces">
            <a className="secondary-button" href="?role=buyer">OPEN BUYER WORKSPACE →</a>
            <a className="secondary-button" href="?role=vendor">OPEN VENDOR WORKSPACE →</a>
            <a className="secondary-button" href="?role=evidence">OPEN ACTIVITY LEDGER →</a>
          </div>
        </div>
      </section>
      <ProtocolFacts />
      {state.status === "loading" && <section className="state-panel"><span className="loading-mark" /><div><h2>Reading Coston2 state</h2><p>No placeholder tender is inserted.</p></div></section>}
      {state.status === "error" && <section className="state-panel error" role="alert"><span>!</span><div><h2>Flare state unavailable</h2><p>{state.error}</p><button className="secondary-button" onClick={onRetry}>RETRY COSTON2 →</button></div></section>}
      {state.status === "ready" && tenders.length === 0 && <section className="state-panel"><span>0</span><div><h2>No Coston2 tenders yet</h2><p>The configured market has no public tender records.</p></div></section>}
      {state.status === "ready" && state.data && selected && (
        <section className="explorer-grid" id="tenders">
          <aside className="dossier-list">
            <header><div><p className="eyebrow">COSTON2 DOSSIERS</p><h2>{tenders.length} tenders</h2></div><button className="icon-button" onClick={onRetry} aria-label="Refresh Coston2 state">↻</button></header>
            {tenders.map((tender) => <div className="tender-card-shell" key={tender.tenderId.toString()}><button type="button" onClick={() => setSelectedId(tender.tenderId.toString())} className={`tender-card ${selected?.tenderId === tender.tenderId ? "selected" : ""}`}><span className="card-kicker">TENDER / {tender.tenderId.toString()}</span><span className="card-title">Flare confidential procurement</span><span className="card-facts"><span><strong>{formatUnits(tender.publicCeilingXrp, 6)} FTestXRP</strong>Public ceiling</span><span><strong>{tender.bidCount.toString()}/{tender.approvedVendorCount}</strong>TEE receipts</span></span><span className="card-footer"><span className={`privacy-badge ${statusClass(tender.status)}`}>{tender.status.toUpperCase()}</span></span></button></div>)}
          </aside>
          <TenderEvidence tender={selected} />
        </section>
      )}
      <footer><div><span className="wordmark inverted">VEILBID FLARE</span><p>Threshold confidential procurement on Coston2.</p></div><div className="footer-meta"><span>FLARE COSTON2 / 114</span><span>TEST ASSETS ONLY</span><span>UNAUDITED HACKATHON SOFTWARE</span></div></footer>
    </main>
  );
}

export function FlareRoom({ wallet }: { wallet?: WalletController } = {}) {
  const { state, refresh } = useFlareMarket();
  const [params, setParams] = useSearchParams();
  const role = params.get("role")?.toLowerCase();
  const activeRole: FlareRole = role === "buyer" || role === "vendor" || role === "evidence" ? role : "public";
  const onRoleChange = (next: FlareRole) => {
    const updated = new URLSearchParams(params);
    if (next === "public") updated.delete("role");
    else updated.set("role", next);
    setParams(updated);
  };
  if (activeRole === "evidence") {
    return (
      <>
        <FlareRoleBar activeRole={activeRole} onRoleChange={onRoleChange} />
        <FlareEvidenceWorkspace state={state} onRetry={() => void refresh()} />
      </>
    );
  }
  if ((role === "vendor" || role === "buyer") && wallet && state.status === "ready" && state.data) {
    return (
      <>
        <FlareRoleBar activeRole={activeRole} onRoleChange={onRoleChange} />
        {role === "buyer" ? <FlareBuyerWorkspace wallet={wallet} onRefresh={() => void refresh()} /> : <FlareVendorWorkspace wallet={wallet} tenders={state.data.tenders} onRefresh={() => void refresh()} />}
      </>
    );
  }
  return <FlareExplorerView state={state} onRetry={() => void refresh()} />;
}
