import type { PendingFlareTender } from "./pendingFinality";

export function PendingTenderNotice({ pending }: { pending: PendingFlareTender }) {
  return (
    <section className="state-panel pending-tender-notice" aria-live="polite">
      <span aria-hidden="true">↻</span>
      <div>
        <h2>{pending.tenderId ? `Tender #${pending.tenderId}` : "New tender transaction"} is waiting for finality</h2>
        <p>
          Public, Activity, and Auditor will use the same canonical dossier after
          12-block finality. Until then, this browser shows only the public-safe
          transaction checkpoint—not reconstructed tender state. {" "}
          <a className="text-link" href={`https://coston2-explorer.flare.network/tx/${pending.transactionHash}`} target="_blank" rel="noreferrer">VIEW TX ↗</a>
        </p>
      </div>
    </section>
  );
}
