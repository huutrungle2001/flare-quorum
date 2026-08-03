import {
  getTenderReadiness,
  type PublicLifecycleEvent,
  type PublicTender,
} from "@veilbid/chain-bindings";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  closeTenderForRecovery,
  resumeRecovery,
  type RecoveryStage,
} from "./recoveryActions";
import {
  readRecoveryRecords,
  recoveryChangedEvent,
  type RecoveryRecord,
} from "./recoveryStore";
import { WalletPanel, type WalletController } from "../wallet/WalletPanel";
import { ContextHelp } from "../shell/ContextHelp";
import { useToasts } from "../shell/ToastProvider";
import { transactionErrorMessage } from "../transactions/errors";
import { WinnerNotificationHistory } from "./WinnerNotifications";

const stageLabel: Record<RecoveryStage, string> = {
  reading: "Reading canonical state",
  closing: "Simulating close",
  "waiting-close": "Waiting for close confirmation",
  "requesting-proof": "Requesting public Nox proof",
  simulating: "Simulating proof transaction",
  signing: "Awaiting wallet signature",
  confirming: "Waiting for confirmation",
  resolved: "Recovery resolved",
};

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function lifecycleLabel(event: PublicLifecycleEvent) {
  return event.name
    .replace(/^Tender/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace("Bid Submitted", "BID RECEIVED")
    .replace("Viewer Granted", "VIEWER ACCESS GRANTED")
    .toUpperCase();
}

export function ActivityWorkspace({
  wallet,
  tenders,
  onRefresh,
  onViewAward,
}: {
  wallet: WalletController;
  tenders: readonly PublicTender[];
  onRefresh: () => void;
  onViewAward: (tenderId: bigint) => void;
}) {
  const toasts = useToasts();
  const [records, setRecords] = useState<RecoveryRecord[]>(() =>
    readRecoveryRecords(),
  );
  const [automationExpanded, setAutomationExpanded] = useState(
    () => records.length > 0,
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [stage, setStage] = useState<RecoveryStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connected =
    wallet.state.status === "connected" &&
    wallet.state.account &&
    wallet.state.walletClient;
  const reload = useCallback(() => setRecords(readRecoveryRecords()), []);

  useEffect(() => {
    reload();
    window.addEventListener(recoveryChangedEvent, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(recoveryChangedEvent, reload);
      window.removeEventListener("storage", reload);
    };
  }, [reload]);

  useEffect(() => {
    if (records.length > 0) setAutomationExpanded(true);
  }, [records.length]);

  useEffect(() => {
    setActiveKey(null);
    setStage(null);
    setError(null);
  }, [wallet.state.sessionRevision]);

  const trackable = useMemo(
    () =>
      tenders.filter((tender) => {
        if (
          records.some(
            (record) =>
              record.kind === "winner" &&
              record.tenderId === tender.tenderId.toString(),
          )
        ) {
          return false;
        }
        const readiness = getTenderReadiness(
          tender,
          BigInt(Math.floor(Date.now() / 1_000)),
        );
        return tender.status === "Closed" || readiness.canClose;
      }),
    [records, tenders],
  );
  const lifecycleHistory = useMemo(
    () =>
      [...tenders].sort((left, right) => {
        if (left.updatedBlock === right.updatedBlock) {
          return Number(right.tenderId - left.tenderId);
        }
        return left.updatedBlock > right.updatedBlock ? -1 : 1;
      }),
    [tenders],
  );
  const readyNow = trackable.filter((tender) => tender.status !== "Closed");
  const processing = trackable.filter((tender) => tender.status === "Closed");
  const queueCount = records.length + readyNow.length + processing.length;

  async function resume(record: RecoveryRecord) {
    if (!connected) return;
    const toastId = toasts.startStack(
      "RESUME RECOVERY",
      "Reading the saved public checkpoint…",
    );
    const key = `${record.kind}:${record.tenderId}`;
    setActiveKey(key);
    setError(null);
    try {
      await resumeRecovery({
        record,
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        onStage: (nextStage) => {
          setStage(nextStage);
          toasts.update(toastId, stageLabel[nextStage]);
        },
      });
      reload();
      onRefresh();
      toasts.succeed(toastId, "Recovery completed and public state refreshed.");
    } catch (cause) {
      toasts.fail(
        toastId,
        "Recovery stopped. The public checkpoint remains available.",
      );
      setError(
        transactionErrorMessage(cause, "Recovery attempt failed."),
      );
    } finally {
      setActiveKey(null);
      setStage(null);
    }
  }

  async function close(tender: PublicTender) {
    if (!connected) return;
    const toastId = toasts.startStack(
      "CLOSE TENDER",
      "Checking canonical tender readiness…",
    );
    const key = `close:${tender.tenderId.toString()}`;
    setActiveKey(key);
    setError(null);
    try {
      await closeTenderForRecovery({
        tenderId: tender.tenderId,
        knownTransactionHash: tender.updatedTransaction,
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        onStage: (nextStage) => {
          setStage(nextStage);
          toasts.update(toastId, stageLabel[nextStage]);
        },
      });
      reload();
      onRefresh();
      toasts.succeed(
        toastId,
        "Close or proof tracking completed and state refreshed.",
      );
    } catch (cause) {
      toasts.fail(
        toastId,
        "Tender close or proof tracking stopped. Retry from Activity.",
      );
      setError(
        transactionErrorMessage(cause, "Tender close failed."),
      );
    } finally {
      setActiveKey(null);
      setStage(null);
    }
  }

  return (
    <main className="role-workspace activity-workspace" id="main-content">
      <section className="workspace-intro">
        <ContextHelp
          label="Help for Activity workspace"
          title="HOW TO USE ACTIVITY"
          steps={[
            "The web normally confirms funding immediately; the hosted relay remains a fallback and continues later lifecycle actions.",
            "Connect any Sepolia wallet with gas only when recovery is needed; these lifecycle writes are permissionless.",
            "Use Resume on a saved funding or winner-proof checkpoint; the app rereads required handles and proofs.",
            "Use Advance Manually only if the hosted relay is unavailable or delayed.",
          ]}
          note="Recovery persists public identifiers and transaction references only—never plaintext values, handles, or proofs."
        />
        <p className="eyebrow">ACTIVITY &amp; HISTORY / AUTOMATION &amp; RECOVERY</p>
        <h1>Automatic by default. Recoverable by design.</h1>
        <p>
          The web and relay can perform permissionless lifecycle writes. Manual
          recovery stores public IDs and transaction hashes only—never plaintext
          bids.
        </p>
      </section>
      <WalletPanel wallet={wallet} />

      <WinnerNotificationHistory
        wallet={wallet}
        tenders={tenders}
        onViewAward={onViewAward}
      />

      <section
        className="activity-section activity-action-queue"
        data-attention={records.length > 0}
      >
        <header>
          <div>
            <p className="eyebrow">AUTOMATION STATUS</p>
            <h2>{queueCount} {queueCount === 1 ? "item" : "items"}</h2>
          </div>
          <div className="activity-queue-header-controls">
            <ContextHelp
              compact
              label="Help for automation status"
              title="HOW TO READ AUTOMATION STATUS"
              steps={[
                "Needs Attention means this browser saved an interrupted public checkpoint that can be resumed.",
                "Auto-Ready means the relay can submit the next permissionless lifecycle transaction without user action.",
                "Automation In Progress means a tender is Closed and its public winner proof is being tracked.",
              ]}
              note="This section stays compact unless you open it or a recoverable checkpoint needs attention. Manual buttons are optional fallbacks."
            />
            <button
              className="icon-button"
              onClick={reload}
              aria-label="Refresh action queue"
            >
              ↻
            </button>
            <button
              className="activity-queue-toggle"
              type="button"
              aria-controls="automation-status-details"
              aria-expanded={automationExpanded}
              onClick={() => setAutomationExpanded((expanded) => !expanded)}
            >
              {automationExpanded ? "HIDE DETAILS" : "SHOW DETAILS"}
              <span aria-hidden="true">{automationExpanded ? "−" : "+"}</span>
            </button>
          </div>
        </header>
        <div className="activity-queue-summary" aria-label="Automation status summary">
          <span data-state="attention">
            <strong>{records.length}</strong> NEEDS ATTENTION
          </span>
          <span data-state="ready">
            <strong>{readyNow.length}</strong> AUTO-READY
          </span>
          <span data-state="processing">
            <strong>{processing.length}</strong> IN PROGRESS
          </span>
        </div>
        {automationExpanded && (
          <div className="activity-queue-details" id="automation-status-details">
            {queueCount === 0 ? (
              <p className="empty-activity activity-queue-empty">
                <strong>ALL CAUGHT UP</strong>
                <span>The web and relay are handling the current lifecycle.</span>
              </p>
            ) : (
              <div className="activity-list">
            {records.map((record) => {
              const key = `${record.kind}:${record.tenderId}`;
              return (
                <article className="activity-card" data-state="attention" key={key}>
                  <div className="activity-card-copy">
                    <span className="activity-state-badge" data-state="attention">
                      NEEDS ATTENTION
                    </span>
                    <p className="eyebrow">
                      {record.kind === "funding"
                        ? "EXACT-FUNDING PROOF INTERRUPTED"
                        : "WINNER-ID PROOF INTERRUPTED"}
                    </p>
                    <h3>Tender {record.tenderId}</h3>
                    <span>Resume from the saved public transaction checkpoint.</span>
                    <small title={record.triggerTransactionHash}>
                      Trigger · {shortHash(record.triggerTransactionHash)}
                    </small>
                  </div>
                  <button
                    className="primary-button"
                    disabled={!connected || activeKey !== null}
                    onClick={() => void resume(record)}
                  >
                    {activeKey === key ? "RECOVERING…" : "RESUME →"}
                  </button>
                </article>
              );
            })}
            {readyNow.map((tender) => {
              const key = `close:${tender.tenderId.toString()}`;
              const readiness = getTenderReadiness(
                tender,
                BigInt(Math.floor(Date.now() / 1_000)),
              );
              return (
                <article className="activity-card" data-state="ready" key={key}>
                  <div className="activity-card-copy">
                    <span className="activity-state-badge" data-state="ready">
                      AUTO-READY
                    </span>
                    <p className="eyebrow">READY TO CLOSE</p>
                    <h3>Tender {tender.tenderId.toString()}</h3>
                    <span>
                      {readiness.allVendorsSubmitted
                        ? `All ${tender.bidCount}/${tender.approvedVendorCount} vendors submitted.`
                        : `Deadline passed with ${tender.bidCount} valid bid${tender.bidCount === 1 ? "" : "s"}.`}
                    </span>
                    <small>No action required — the relay will advance this tender automatically.</small>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={!connected || activeKey !== null}
                    onClick={() => void close(tender)}
                  >
                    {activeKey === key ? "ADVANCING…" : "ADVANCE MANUALLY →"}
                  </button>
                </article>
              );
            })}
            {processing.map((tender) => {
              const key = `close:${tender.tenderId.toString()}`;
              return (
                <article className="activity-card" data-state="processing" key={key}>
                  <div className="activity-card-copy">
                    <span className="activity-state-badge" data-state="processing">
                      AUTOMATION IN PROGRESS
                    </span>
                    <p className="eyebrow">WINNER PROOF TRACKABLE</p>
                    <h3>Tender {tender.tenderId.toString()}</h3>
                    <span>
                      Closed with {tender.bidCount}/{tender.approvedVendorCount} vendor bids.
                    </span>
                    <small>No action required — the relay is tracking the public Nox winner-ID proof.</small>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={!connected || activeKey !== null}
                    onClick={() => void close(tender)}
                  >
                    {activeKey === key ? "CHECKING…" : "CHECK / ADVANCE MANUALLY →"}
                  </button>
                </article>
              );
            })}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="activity-section activity-history-section">
        <header>
          <div>
            <p className="eyebrow">LIFECYCLE HISTORY</p>
            <h2>{lifecycleHistory.length} dossiers</h2>
          </div>
          <ContextHelp
            compact
            label="Help for lifecycle history"
            title="HOW TO READ LIFECYCLE HISTORY"
            steps={[
              "Each dossier is a public lifecycle record indexed from canonical Market events.",
              "The timeline shows every indexed public lifecycle event and its confirmed transaction.",
              "Safe proposal signatures and confidential values stay in their dedicated Safe/private surfaces.",
            ]}
            note="Only public identifiers, statuses, blocks, and transaction links are shown here."
          />
        </header>
        {lifecycleHistory.length === 0 ? (
          <p className="empty-activity">
            No public tender history has been indexed yet.
          </p>
        ) : (
          <div className="activity-history-list">
            {lifecycleHistory.map((tender) => (
              <article
                className="activity-history-card"
                key={tender.tenderId.toString()}
              >
                <div className="activity-history-heading">
                  <div>
                    <p className="eyebrow">TENDER {tender.tenderId.toString()}</p>
                    <h3>{tender.status}</h3>
                  </div>
                  <span className="activity-history-meta">
                    {tender.bidCount}/{tender.approvedVendorCount} bids · block {tender.updatedBlock.toString()}
                  </span>
                </div>
                <ol className="activity-history-timeline">
                  {(tender.history ?? [
                    {
                      name: "TenderCreated",
                      blockNumber: tender.createdBlock,
                      transactionHash: tender.createdTransaction,
                    },
                    ...(tender.updatedTransaction !== tender.createdTransaction
                      ? [{
                          name: tender.status,
                          blockNumber: tender.updatedBlock,
                          transactionHash: tender.updatedTransaction,
                        }]
                      : []),
                  ]).map((event, index) => (
                    <li key={`${event.transactionHash}-${event.name}-${index}`}>
                      <span>{lifecycleLabel(event)}</span>
                      <span className="activity-history-event-meta">
                        <small>BLOCK {event.blockNumber.toString()}</small>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${event.transactionHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortHash(event.transactionHash)} ↗
                        </a>
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        )}
      </section>

      {stage && (
        <p className="progress-line activity-progress" aria-live="polite">
          <span className="signal-dot" aria-hidden="true" />
          {stageLabel[stage]}
        </p>
      )}
      {error && <p className="inline-error activity-error" role="alert">{error}</p>}
    </main>
  );
}
