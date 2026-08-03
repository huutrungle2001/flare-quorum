import { formatUnits } from "viem";
import { useState } from "react";
import type { FlareMarketState } from "../public-market/useFlareMarket";
import { useFlareMarket } from "../public-market/useFlareMarket";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";

function short(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function statusClass(status: FlarePublicTender["status"]): string {
  if (status === "Awarded" || status === "Refunded") return "verified";
  if (status === "Open" || status === "Closed" || status === "ComputePending") return "encrypted";
  return "";
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
        </div>
      </section>
      {state.status === "loading" && <section className="state-panel"><span className="loading-mark" /><div><h2>Reading Coston2 state</h2><p>No placeholder tender is inserted.</p></div></section>}
      {state.status === "error" && <section className="state-panel error" role="alert"><span>!</span><div><h2>Flare state unavailable</h2><p>{state.error}</p><button className="secondary-button" onClick={onRetry}>RETRY COSTON2 →</button></div></section>}
      {state.status === "ready" && tenders.length === 0 && <section className="state-panel"><span>0</span><div><h2>No Coston2 tenders yet</h2><p>The configured market has no public tender records.</p></div></section>}
      {state.status === "ready" && state.data && selected && (
        <section className="explorer-grid" id="tenders">
          <aside className="dossier-list">
            <header><div><p className="eyebrow">COSTON2 DOSSIERS</p><h2>{tenders.length} tenders</h2></div><button className="icon-button" onClick={onRetry} aria-label="Refresh Coston2 state">↻</button></header>
            {tenders.map((tender) => <div className="tender-card-shell" key={tender.tenderId.toString()}><button type="button" onClick={() => setSelectedId(tender.tenderId.toString())} className={`tender-card ${selected?.tenderId === tender.tenderId ? "selected" : ""}`}><span className="card-kicker">TENDER / {tender.tenderId.toString()}</span><span className="card-title">Flare confidential procurement</span><span className="card-facts"><span><strong>{formatUnits(tender.publicCeilingXrp, 6)} FXRP</strong>Public ceiling</span><span><strong>{tender.bidCount.toString()}/{tender.approvedVendorCount}</strong>TEE receipts</span></span><span className="card-footer"><span className={`privacy-badge ${statusClass(tender.status)}`}>{tender.status.toUpperCase()}</span></span></button></div>)}
          </aside>
          <TenderEvidence tender={selected} />
        </section>
      )}
      <footer><div><span className="wordmark inverted">VEILBID FLARE</span><p>Threshold confidential procurement on Coston2.</p></div><div className="footer-meta"><span>FLARE COSTON2 / 114</span><span>TEST ASSETS ONLY</span><span>UNAUDITED HACKATHON SOFTWARE</span></div></footer>
    </main>
  );
}

export function FlareRoom() {
  const { state, refresh } = useFlareMarket();
  return <FlareExplorerView state={state} onRetry={() => void refresh()} />;
}
