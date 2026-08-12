import { coston2FlarePublicRelease, flareQuorumFlareMarketAbi } from "@flarequorum/flare-bindings";
import { createPublicClient, http, isAddressEqual, type Abi } from "viem";
import { useEffect, useMemo, useState } from "react";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import { ContextHelp } from "../shell/ContextHelp";
import { useToasts } from "../shell/ToastProvider";
import type { WalletController } from "../wallet/WalletPanel";
import { WalletPanel } from "../wallet/WalletPanel";
import { FlareRedemptionPanel } from "./FlareRedemptionPanel";

const coston2 = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

type DirectAction = "closeTender" | "cancelTender" | "refundExpiredSelection";
type Confirmation = { tenderId: bigint; action: "cancelTender" | "refundExpiredSelection" };
type ActivityState = "close" | "cancel-or-wait" | "wait-for-bids" | "request-selection" | "compute-live" | "retry-selection" | "refund-ready" | "terminal";

function deadline(timestamp: bigint) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(timestamp) * 1_000));
}

function actionState(tender: FlarePublicTender, now: bigint): ActivityState {
  if (tender.status === "Open") {
    const canClose = now >= tender.bidDeadline || tender.bidCount >= BigInt(tender.approvedVendorCount);
    return canClose ? "close" : tender.bidCount === 0n ? "cancel-or-wait" : "wait-for-bids";
  }
  if (tender.status === "Closed") return "request-selection";
  if (tender.status === "ComputePending") {
    const refundAt = tender.selectionStartedAt + 86_400n;
    if (tender.selectionStartedAt > 0n && now > refundAt) return "refund-ready";
    if (tender.resultExpiry > 0n && now > tender.resultExpiry) return "retry-selection";
    return "compute-live";
  }
  return "terminal";
}

function actionPresentation(state: ActivityState, buyerConnected: boolean) {
  switch (state) {
    case "close":
      return { title: "Ready to close", status: "ACTION AVAILABLE", permission: "ANYONE", lane: "action" };
    case "cancel-or-wait":
      return buyerConnected
        ? { title: "Waiting for the first bid", status: "OPTIONAL ACTION", permission: "BUYER ONLY · THIS WALLET", lane: "action" }
        : { title: "Accepting sealed bids", status: "WAITING", permission: "BUYER MAY CANCEL", lane: "waiting" };
    case "wait-for-bids":
      return { title: "Accepting sealed bids", status: "WAITING", permission: "NO ACTION REQUIRED", lane: "waiting" };
    case "request-selection":
      return { title: "Relay selection required", status: "RELAY QUEUE", permission: "DEDICATED RELAY", lane: "relay" };
    case "compute-live":
      return { title: "FCC computation in progress", status: "PROCESSING", permission: "NO ACTION REQUIRED", lane: "processing" };
    case "retry-selection":
      return { title: "Relay retry available", status: "RELAY QUEUE", permission: "DEDICATED RELAY", lane: "relay" };
    case "refund-ready":
      return buyerConnected
        ? { title: "Escrow recovery available", status: "ACTION AVAILABLE", permission: "BUYER ONLY · THIS WALLET", lane: "action" }
        : { title: "Buyer recovery available", status: "BUYER ACTION", permission: "BUYER ONLY", lane: "waiting" };
    default:
      return { title: "No action required", status: "COMPLETE", permission: "PUBLIC RECORD", lane: "complete" };
  }
}

export function FlareFinalizerWorkspace({
  wallet,
  tenders,
  onRefresh,
}: {
  wallet: WalletController;
  tenders: readonly FlarePublicTender[];
  onRefresh: () => void;
}) {
  const toasts = useToasts();
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1_000)));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const connected = wallet.state.status === "connected" && wallet.state.account && wallet.state.walletClient;

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(BigInt(Math.floor(Date.now() / 1_000))),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const queue = useMemo(
    () => tenders.filter((tender) => !["Awarded", "Refunded", "Cancelled"].includes(tender.status)),
    [tenders],
  );
  const actionableCount = queue.filter((tender) => {
    const state = actionState(tender, now);
    if (state === "close") return true;
    return Boolean(
      connected
      && (state === "cancel-or-wait" || state === "refund-ready")
      && isAddressEqual(wallet.state.account!, tender.buyer),
    );
  }).length;
  const hasWalletAction = actionableCount > 0;

  async function runDirectAction(tender: FlarePublicTender, action: DirectAction) {
    if (!connected) return;
    const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
    if (!rpcUrl) {
      setError("Coston2 RPC is unavailable. No write was attempted.");
      return;
    }
    const key = `${action}:${tender.tenderId.toString()}`;
    const labels: Record<DirectAction, string> = {
      closeTender: "CLOSE TENDER",
      cancelTender: "CANCEL EMPTY TENDER",
      refundExpiredSelection: "RECOVER ESCROW",
    };
    const toastId = toasts.startStack(labels[action], "Re-reading canonical Coston2 state…");
    setBusy(key);
    setError(null);
    try {
      const publicClient = createPublicClient({
        chain: coston2,
        transport: http(rpcUrl, { retryCount: 1, timeout: 8_000 }),
      });
      const simulation = await publicClient.simulateContract({
        account: wallet.state.account!,
        address: coston2FlarePublicRelease.market,
        abi: flareQuorumFlareMarketAbi as Abi,
        functionName: action,
        args: [tender.tenderId],
      });
      toasts.update(toastId, "Awaiting the Coston2 wallet signature…");
      const hash = await wallet.state.walletClient!.writeContract(simulation.request);
      toasts.update(toastId, "Waiting for the Coston2 transaction receipt…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("COSTON2_FINALIZER_TRANSACTION_FAILED");
      toasts.succeed(toastId, `${labels[action]} confirmed on Coston2.`);
      setConfirmation(null);
      onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The public lifecycle action failed without changing the displayed state.",
      );
      toasts.fail(toastId, "The action stopped. Canonical state was not treated as advanced.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main id="main-content" className="role-workspace flare-finalizer-workspace">
      <section className="workspace-intro">
        <ContextHelp
          label="Help for Public Finalizer"
          title="HOW PUBLIC FINALIZATION WORKS"
          steps={[
            "Close is permissionless once the deadline passes or every approved vendor has submitted.",
            "Selection dispatch and threshold-result collection stay with the dedicated stateless relay because they require public FCC endpoints and the live instruction fee.",
            "A browser never calculates a winner or chooses between split TEE digests.",
            "After the fixed 24-hour failed-compute grace, only the buyer can recover the original escrow with no award.",
          ]}
          note="This workspace fails closed. It never substitutes a manual price, mock TEE result, or client-provided winner."
        />
        <p className="eyebrow">COSTON2 PUBLIC FINALIZER / RECOVERY</p>
        <h1>Advance public checkpoints.</h1>
        <p>
          Anyone may close eligible tenders. FCC dispatch, result grouping, and
          threshold finalization remain relay operations with no bid-decryption
          capability. Buyer-only cancellation and failed-compute refund controls
          appear only when canonical rules permit them.
        </p>
      </section>
      <nav className="activity-section-nav" aria-label="Activity sections">
        <a href="#lifecycle-queue">LIFECYCLE QUEUE</a>
        <a href="#assets-redemption">ASSETS &amp; REDEMPTION</a>
      </nav>
      {error && <p className="inline-error finalizer-error" role="alert">{error}</p>}
      <section id="lifecycle-queue" className="evidence-panel finalizer-queue" aria-label="Public lifecycle queue">
        <header className="detail-header">
          <div>
            <p className="eyebrow">ACTION CENTER / CANONICAL CHECKPOINTS</p>
            <h2>{queue.length} active checkpoint{queue.length === 1 ? "" : "s"}</h2>
          </div>
          <button className="icon-button" onClick={onRefresh} aria-label="Refresh public lifecycle queue">↻</button>
        </header>
        <div className="activity-queue-summary" aria-label="Activity action summary">
          <div><strong>{actionableCount}</strong><span>NEED{actionableCount === 1 ? "S" : ""} ACTION</span></div>
          <div><strong>{queue.length - actionableCount}</strong><span>TRACKING ONLY</span></div>
          <p>Activity shows the next step only. Rules and evidence remain in each Public dossier.</p>
        </div>
        {hasWalletAction && <WalletPanel wallet={wallet} network="coston2" compact />}
        {queue.length === 0 ? (
          <div className="state-panel compact-state">
            <span aria-hidden="true">✓</span>
            <div><h3>No pending lifecycle action</h3><p>Every finalized tender in this checkpoint is terminal.</p></div>
          </div>
        ) : (
          <div className="finalizer-card-list">
            {queue.map((tender) => {
              const state = actionState(tender, now);
              const buyerConnected = Boolean(
                connected && isAddressEqual(wallet.state.account!, tender.buyer),
              );
              const closeKey = `closeTender:${tender.tenderId.toString()}`;
              const cancelKey = `cancelTender:${tender.tenderId.toString()}`;
              const refundKey = `refundExpiredSelection:${tender.tenderId.toString()}`;
              const isConfirming = confirmation?.tenderId === tender.tenderId;
              const presentation = actionPresentation(state, buyerConnected);
              return (
                <article key={tender.tenderId.toString()} className="finalizer-card activity-action-card" data-lane={presentation.lane}>
                  <header>
                    <div><p className="eyebrow">TENDER {tender.tenderId.toString()} · {tender.status.toUpperCase()}</p><h3>{presentation.title}</h3></div>
                    <span className={`privacy-badge${presentation.lane === "action" ? " verified" : ""}`}>{presentation.status}</span>
                  </header>
                  <div className="activity-action-meta">
                    <span>{presentation.permission}</span>
                    <span>{tender.bidCount.toString()} / {tender.approvedVendorCount} BIDS</span>
                    <span>DEADLINE {deadline(tender.bidDeadline)}</span>
                  </div>
                  <div className="finalizer-action-copy activity-action-copy">
                    {state === "close" && <p>Deadline/vendor quorum allows a permissionless close. The contract captures the live XRP/USD FTSO snapshot.</p>}
                    {state === "cancel-or-wait" && <p>Still accepting bids. The connected buyer may cancel only while zero bids are accepted.</p>}
                    {state === "wait-for-bids" && <p>Still accepting sealed bids until the deadline or full vendor participation.</p>}
                    {state === "request-selection" && <p>Closed and ready for the dedicated relay to pay the live FCC instruction fee and dispatch the frozen selection request.</p>}
                    {state === "compute-live" && <p>FCC attempt {tender.selectionAttempt} is live. A relay groups exact result bytes and submits only a matching 2-of-3 quorum.</p>}
                    {state === "retry-selection" && <p>The signed-result window expired. A relay may retry with a fresh nonce while every frozen input stays unchanged.</p>}
                    {state === "refund-ready" && <p>The failed-compute grace elapsed. Only the original buyer may recover the exact escrow; this creates no winner or award receipt.</p>}
                  </div>
                  <div className="finalizer-actions">
                    {state === "close" && (
                      <button className="primary-button" type="button" disabled={!connected || busy !== null} onClick={() => void runDirectAction(tender, "closeTender")}>
                        {busy === closeKey ? "CLOSING…" : "CLOSE & FREEZE FTSO →"}
                      </button>
                    )}
                    {state === "cancel-or-wait" && buyerConnected && (
                      <button className="destructive-button" type="button" disabled={busy !== null} onClick={() => setConfirmation({ tenderId: tender.tenderId, action: "cancelTender" })}>
                        {busy === cancelKey ? "CANCELLING…" : "CANCEL EMPTY TENDER"}
                      </button>
                    )}
                    {state === "refund-ready" && buyerConnected && (
                      <button className="destructive-button" type="button" disabled={busy !== null} onClick={() => setConfirmation({ tenderId: tender.tenderId, action: "refundExpiredSelection" })}>
                        {busy === refundKey ? "RECOVERING…" : "RECORD FAILURE & RECOVER ESCROW"}
                      </button>
                    )}
                    <a className="secondary-button" href={`/flare?status=all&tender=${tender.tenderId.toString()}`}>VIEW PUBLIC DOSSIER →</a>
                  </div>
                  {isConfirming && (
                    <div className="finalizer-confirmation" role="alertdialog" aria-labelledby={`confirm-title-${tender.tenderId.toString()}`}>
                      <div>
                        <p className="eyebrow">CONFIRM ON-CHAIN ACTION</p>
                        <h4 id={`confirm-title-${tender.tenderId.toString()}`}>
                          {confirmation.action === "cancelTender" ? "Cancel this empty tender?" : "Record failed compute and recover escrow?"}
                        </h4>
                        <p>
                          {confirmation.action === "cancelTender"
                            ? "The tender will become terminal. No bid or award receipt will be created."
                            : "The tender will become Refunded with no winner. The contract returns the original escrow to its buyer."}
                        </p>
                      </div>
                      <div className="finalizer-actions">
                        <button className="destructive-button" type="button" disabled={busy !== null} onClick={() => void runDirectAction(tender, confirmation.action)}>
                          {busy ? "SUBMITTING…" : "CONFIRM TRANSACTION"}
                        </button>
                        <button className="secondary-button" type="button" disabled={busy !== null} onClick={() => setConfirmation(null)}>KEEP TENDER</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <div id="assets-redemption" className="activity-assets-section">
        <FlareRedemptionPanel wallet={wallet} tenders={tenders} />
      </div>
    </main>
  );
}
