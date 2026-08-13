import { coston2FlarePublicRelease } from "@flarequorum/flare-bindings";
import { formatUnits } from "viem";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import { ContextHelp } from "../shell/ContextHelp";
import { PublicValue } from "../shell/PublicValue";
import { FlareBuyerBriefPanel } from "./FlareBuyerBriefPanel";
import { PendingTenderNotice } from "./PendingTenderNotice";
import { usePendingFlareTender } from "./pendingFinality";

function short(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function explorer(kind: "address" | "block", value: string) {
  return `https://coston2-explorer.flare.network/${kind}/${value}`;
}

export function FlareAuditorWorkspace({
  tenders,
  finalizedBlock,
}: {
  tenders: readonly FlarePublicTender[];
  finalizedBlock: bigint;
}) {
  const [params, setParams] = useSearchParams();
  const orderedTenders = useMemo(
    () => [...tenders].sort((left, right) => left.tenderId > right.tenderId ? -1 : left.tenderId < right.tenderId ? 1 : 0),
    [tenders],
  );
  const preferredTender = orderedTenders[0] ?? null;
  const selectedId = params.get("tender") ?? preferredTender?.tenderId.toString() ?? "";
  const [statusFilter, setStatusFilter] = useState<"all" | "awarded" | "active" | "refunded">("all");
  const [query, setQuery] = useState("");
  const pendingTender = usePendingFlareTender(tenders.map((tender) => tender.tenderId.toString()));
  const filteredTenders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orderedTenders.filter((tender) => {
      const statusMatches = statusFilter === "all"
        || (statusFilter === "active" && ["Open", "Closed", "ComputePending"].includes(tender.status))
        || tender.status.toLowerCase() === statusFilter;
      const queryMatches = !normalized || [
        tender.tenderId.toString(),
        `tender ${tender.tenderId.toString()}`,
        tender.buyer,
        tender.status,
      ].some((value) => value.toLowerCase().includes(normalized));
      return statusMatches && queryMatches;
    });
  }, [orderedTenders, query, statusFilter]);
  const selected = useMemo(
    () => filteredTenders.find((tender) => tender.tenderId.toString() === selectedId) ?? filteredTenders[0] ?? null,
    [filteredTenders, selectedId],
  );

  useEffect(() => {
    if (selected && selected.tenderId.toString() !== selectedId) {
      const updated = new URLSearchParams(params);
      updated.set("tender", selected.tenderId.toString());
      setParams(updated, { replace: true });
    }
  }, [params, selected, selectedId, setParams]);

  function selectTender(tenderId: string) {
    const updated = new URLSearchParams(params);
    updated.set("tender", tenderId);
    setParams(updated);
  }

  return (
    <main id="main-content" className="role-workspace flare-auditor-workspace">
      <section className="workspace-intro">
        <ContextHelp
          label="Help for Auditor Evidence"
          title="WHAT THIS AUDIT CAN PROVE"
          steps={[
            "Confirm the market, extension, application image binding, three frozen TEE identities, and 2-of-3 result threshold.",
            "Confirm every accepted bid has a public commitment and all-three receipt bitmap without opening its commercial terms.",
            "Confirm the ordered root, close-time FTSO snapshot, result digest, award receipt, and escrow conservation.",
            "Use the same finalized block for every read so evidence cannot mix checkpoints.",
          ]}
          note="PUBLIC VERIFICATION ONLY · NO BID DECRYPTION · NO SPEND · NO WINNER OVERRIDE"
        />
        <p className="eyebrow">COSTON2 AUDITOR / PUBLIC VERIFICATION ONLY</p>
        <h1>Inspect the binding, not the bids.</h1>
        <p>
          This workspace presents finalized contract facts and public commitments.
          It has no signer, proxy credential, TEE decryption path, private reveal,
          or authority to choose a winner.
        </p>
      </section>
      {pendingTender && <PendingTenderNotice pending={pendingTender} />}
      {tenders.length === 0 ? (
        <section className="state-panel">
          <span aria-hidden="true">0</span>
          <div><h2>No finalized dossier available</h2><p>No placeholder audit record is created.</p></div>
        </section>
      ) : (
        <>
          <section className="audit-selector" aria-label="Select tender to audit">
            <label>
              Search public state
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tender ID, buyer or status" />
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="all">All statuses</option>
                <option value="awarded">Awarded</option>
                <option value="active">Open / compute</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>
            <label>
              Public tender dossier
              <select value={selected?.tenderId.toString() ?? ""} onChange={(event) => selectTender(event.target.value)} disabled={filteredTenders.length === 0}>
                {filteredTenders.length === 0 && <option value="">No matching dossier</option>}
                {filteredTenders.map((tender) => (
                  <option key={tender.tenderId.toString()} value={tender.tenderId.toString()}>
                    Tender {tender.tenderId.toString()} · {tender.status}
                  </option>
                ))}
              </select>
            </label>
            <span className="privacy-badge verified">FINALIZED BLOCK {finalizedBlock.toString()}</span>
          </section>

          {!selected ? (
            <section className="state-panel">
              <span aria-hidden="true">0</span>
              <div><h2>No dossiers match this view</h2><p>Clear the public search or choose another status. No placeholder audit record is created.</p></div>
            </section>
          ) : (
          <>
          <section className="evidence-panel audit-dossier-panel" aria-label={`Tender ${selected.tenderId.toString()} audit dossier`}>
            <header className="detail-header audit-dossier-header">
              <div><p className="eyebrow">TENDER {selected.tenderId.toString()} · AUDIT DOSSIER</p><h2>Binding → receipts → public outcome</h2></div>
              <span className="privacy-badge verified">{selected.status.toUpperCase()} · BLOCK {finalizedBlock.toString()}</span>
            </header>
          <FlareBuyerBriefPanel tender={selected} compact />
          <section className="audit-dossier-section audit-binding-panel">
            <header className="audit-section-header">
              <div><p className="eyebrow">01 / TRUST BINDING</p><h3>Three fixed machines. One exact result domain.</h3></div>
              <span className="privacy-badge">2 OF 3 REQUIRED</span>
            </header>
            <dl className="term-grid">
              <div><dt>Market</dt><dd><PublicValue value={coston2FlarePublicRelease.market} label="market address" href={explorer("address", coston2FlarePublicRelease.market)} /></dd></div>
              <div><dt>Extension / wire version</dt><dd>{selected.extensionId.toString()} / {coston2FlarePublicRelease.fcc.version}</dd></div>
              <div><dt>Code version</dt><dd><PublicValue value={selected.codeVersion} label="code version" /></dd></div>
              <div><dt>Rules hash</dt><dd><PublicValue value={selected.rulesHash} label="rules hash" /></dd></div>
              <div><dt>Ordered bid root</dt><dd><PublicValue value={selected.orderedBidRoot} label="ordered bid root" /></dd></div>
              <div><dt>Common quorum</dt><dd>{selected.commonQuorumBitmap.toString(2).padStart(3, "0")} / threshold 2</dd></div>
            </dl>
            <div className="audit-machine-grid">
              {selected.teeIds.map((teeId, index) => (
                <article key={teeId}>
                  <span className="eyebrow">TEE {index + 1}</span>
                  <PublicValue value={teeId} label={`TEE ${index + 1} identity`} href={explorer("address", teeId)} />
                  <PublicValue value={selected.teeKeyFingerprints[index]} label={`TEE ${index + 1} key fingerprint`} />
                </article>
              ))}
            </div>
          </section>

          <section className="audit-dossier-section audit-receipt-panel">
            <header className="audit-section-header">
              <div><p className="eyebrow">02 / ACCEPTED BID RECEIPTS</p><h3>{selected.bidReferences.length} accepted commitment{selected.bidReferences.length === 1 ? "" : "s"} for Tender #{selected.tenderId.toString()}</h3></div>
              <span className="privacy-badge encrypted">NO PAYLOAD ACCESS</span>
            </header>
            {selected.bidReferences.length === 0 ? (
              <p className="form-hint">No accepted bid reference exists at this finalized checkpoint.</p>
            ) : (
              <div className="audit-bid-list">
                {selected.bidReferences.map((bid) => (
                  <article key={bid.bidId.toString()}>
                    <div><span className="eyebrow">BID {bid.bidId.toString()}</span><PublicValue value={bid.vendor} label={`bid ${bid.bidId.toString()} vendor`} href={explorer("address", bid.vendor)} /></div>
                    <dl>
                      <div><dt>Commitment</dt><dd><PublicValue value={bid.plaintextCommitment} label={`bid ${bid.bidId.toString()} commitment`} /></dd></div>
                      <div><dt>Receipt bitmap</dt><dd>{bid.receiptBitmap.toString(2).padStart(3, "0")}</dd></div>
                      <div><dt>Accepted block</dt><dd><a className="text-link" href={explorer("block", bid.acceptedBlock.toString())} target="_blank" rel="noreferrer">{bid.acceptedBlock.toString()} ↗</a></dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={`audit-dossier-section audit-outcome-section${selected.award ? " awarded" : ""}`}>
            <div>
              <p className="eyebrow">03 / PUBLIC OUTCOME</p>
              <h3>{selected.award ? "AWARDED" : selected.status.toUpperCase()}</h3>
              <p>
                {selected.award
                  ? `Winner ${short(selected.award.winner)} received ${formatUnits(selected.award.amount, 6)} FTestXRP.`
                  : "No public award receipt exists for this finalized checkpoint."}
              </p>
            </div>
            {selected.award && (
              <dl>
                <div><dt>Receipt / tender ID</dt><dd>{selected.award.tenderId.toString()}</dd></div>
                <div><dt>Winning bid ID</dt><dd>{selected.award.winnerBidId.toString()}</dd></div>
                <div><dt>Result digest</dt><dd><PublicValue value={selected.award.resultDigest} label="result digest" /></dd></div>
                <div><dt>Finalized block</dt><dd>{selected.award.finalizedBlock.toString()}</dd></div>
                <div><dt>Winner payout</dt><dd>{formatUnits(selected.award.amount, 6)} FTestXRP</dd></div>
                <div><dt>Buyer remainder</dt><dd>{formatUnits(selected.publicCeilingXrp - selected.award.amount, 6)} FTestXRP</dd></div>
              </dl>
            )}
          </section>
          </section>

          <section className="audit-boundary-grid" aria-label="Audit visibility boundary">
            <article><span className="privacy-badge verified">PUBLIC</span><h3>What can be checked</h3><p>Rules, participation, commitments, quorum, FTSO snapshot, result binding, winner, payout, remainder, and award receipt.</p></article>
            <article><span className="privacy-badge encrypted">SEALED</span><h3>What is deliberately absent</h3><p>Losing prices, delivery/warranty terms, credentials, salts, ciphertext, TEE working state, and component scores.</p></article>
          </section>
          </>
          )}
        </>
      )}
    </main>
  );
}
