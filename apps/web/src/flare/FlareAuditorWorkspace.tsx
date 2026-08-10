import { coston2FlarePublicRelease } from "@flarequorum/flare-bindings";
import { formatUnits } from "viem";
import { useEffect, useMemo, useState } from "react";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import { ContextHelp } from "../shell/ContextHelp";

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
  const [selectedId, setSelectedId] = useState(() => tenders[0]?.tenderId.toString() ?? "");
  const selected = useMemo(
    () => tenders.find((tender) => tender.tenderId.toString() === selectedId) ?? tenders[0] ?? null,
    [selectedId, tenders],
  );

  useEffect(() => {
    if (selected && selected.tenderId.toString() !== selectedId) {
      setSelectedId(selected.tenderId.toString());
    }
  }, [selected, selectedId]);

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
      {tenders.length === 0 || !selected ? (
        <section className="state-panel">
          <span aria-hidden="true">0</span>
          <div><h2>No finalized dossier available</h2><p>No placeholder audit record is created.</p></div>
        </section>
      ) : (
        <>
          <section className="audit-selector" aria-label="Select tender to audit">
            <label>
              Public tender dossier
              <select value={selected.tenderId.toString()} onChange={(event) => setSelectedId(event.target.value)}>
                {tenders.map((tender) => (
                  <option key={tender.tenderId.toString()} value={tender.tenderId.toString()}>
                    Tender {tender.tenderId.toString()} · {tender.status}
                  </option>
                ))}
              </select>
            </label>
            <span className="privacy-badge verified">FINALIZED BLOCK {finalizedBlock.toString()}</span>
          </section>

          <section className="evidence-panel audit-binding-panel">
            <header className="detail-header">
              <div><p className="eyebrow">TRUST BINDING</p><h2>Three fixed machines. One exact result domain.</h2></div>
              <span className="privacy-badge">2 OF 3 REQUIRED</span>
            </header>
            <dl className="term-grid">
              <div><dt>Market</dt><dd><a className="text-link" href={explorer("address", coston2FlarePublicRelease.market)} target="_blank" rel="noreferrer">{short(coston2FlarePublicRelease.market)} ↗</a></dd></div>
              <div><dt>Extension / wire version</dt><dd>{selected.extensionId.toString()} / {coston2FlarePublicRelease.fcc.version}</dd></div>
              <div><dt>Code version</dt><dd title={selected.codeVersion}>{short(selected.codeVersion)}</dd></div>
              <div><dt>Rules hash</dt><dd title={selected.rulesHash}>{short(selected.rulesHash)}</dd></div>
              <div><dt>Ordered bid root</dt><dd title={selected.orderedBidRoot}>{short(selected.orderedBidRoot)}</dd></div>
              <div><dt>Common quorum</dt><dd>{selected.commonQuorumBitmap.toString(2).padStart(3, "0")} / threshold 2</dd></div>
            </dl>
            <div className="audit-machine-grid">
              {selected.teeIds.map((teeId, index) => (
                <article key={teeId}>
                  <span className="eyebrow">TEE {index + 1}</span>
                  <strong title={teeId}>{short(teeId)}</strong>
                  <code title={selected.teeKeyFingerprints[index]}>{short(selected.teeKeyFingerprints[index])}</code>
                  <a className="text-link" href={explorer("address", teeId)} target="_blank" rel="noreferrer">REGISTERED IDENTITY ↗</a>
                </article>
              ))}
            </div>
          </section>

          <section className="evidence-panel audit-receipt-panel">
            <header className="detail-header">
              <div><p className="eyebrow">PUBLIC BID RECEIPTS</p><h2>{selected.bidReferences.length} accepted commitment{selected.bidReferences.length === 1 ? "" : "s"}</h2></div>
              <span className="privacy-badge encrypted">NO PAYLOAD ACCESS</span>
            </header>
            {selected.bidReferences.length === 0 ? (
              <p className="form-hint">No accepted bid reference exists at this finalized checkpoint.</p>
            ) : (
              <div className="audit-bid-list">
                {selected.bidReferences.map((bid) => (
                  <article key={bid.bidId.toString()}>
                    <div><span className="eyebrow">BID {bid.bidId.toString()}</span><strong title={bid.vendor}>{short(bid.vendor)}</strong></div>
                    <dl>
                      <div><dt>Commitment</dt><dd title={bid.plaintextCommitment}>{short(bid.plaintextCommitment)}</dd></div>
                      <div><dt>Receipt bitmap</dt><dd>{bid.receiptBitmap.toString(2).padStart(3, "0")}</dd></div>
                      <div><dt>Accepted block</dt><dd><a className="text-link" href={explorer("block", bid.acceptedBlock.toString())} target="_blank" rel="noreferrer">{bid.acceptedBlock.toString()} ↗</a></dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={`award-proof-panel${selected.award ? " awarded" : ""}`}>
            <div>
              <p className="eyebrow">TEE-SIGNED RESULT / PUBLIC SETTLEMENT</p>
              <h2>{selected.award ? "AWARDED" : selected.status.toUpperCase()}</h2>
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
                <div><dt>Result digest</dt><dd title={selected.award.resultDigest}>{short(selected.award.resultDigest)}</dd></div>
                <div><dt>Finalized block</dt><dd>{selected.award.finalizedBlock.toString()}</dd></div>
                <div><dt>Winner payout</dt><dd>{formatUnits(selected.award.amount, 6)} FTestXRP</dd></div>
                <div><dt>Buyer remainder</dt><dd>{formatUnits(selected.publicCeilingXrp - selected.award.amount, 6)} FTestXRP</dd></div>
              </dl>
            )}
          </section>

          <section className="audit-boundary-grid" aria-label="Audit visibility boundary">
            <article><span className="privacy-badge verified">PUBLIC</span><h3>What can be checked</h3><p>Rules, participation, commitments, quorum, FTSO snapshot, result binding, winner, payout, remainder, and award receipt.</p></article>
            <article><span className="privacy-badge encrypted">SEALED</span><h3>What is deliberately absent</h3><p>Losing prices, delivery/warranty terms, credentials, salts, ciphertext, TEE working state, and component scores.</p></article>
          </section>
        </>
      )}
    </main>
  );
}
