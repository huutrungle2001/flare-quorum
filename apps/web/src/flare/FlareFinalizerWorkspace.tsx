import { coston2FlarePublicRelease, flareQuorumFlareMarketAbi } from "@flarequorum/flare-bindings";
import { createPublicClient, http, isAddressEqual, type Abi } from "viem";
import { useEffect, useMemo, useState } from "react";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import { ContextHelp } from "../shell/ContextHelp";
import { useToasts } from "../shell/ToastProvider";
import type { WalletController } from "../wallet/WalletPanel";
import { WalletPanel } from "../wallet/WalletPanel";

const coston2 = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

type DirectAction = "closeTender" | "cancelTender" | "refundExpiredSelection";
type Confirmation = { tenderId: bigint; action: "cancelTender" | "refundExpiredSelection" };

function short(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function deadline(timestamp: bigint) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(timestamp) * 1_000));
}

function actionState(tender: FlarePublicTender, now: bigint) {
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
  const hasWalletAction = queue.some((tender) => ["close", "cancel-or-wait", "refund-ready"].includes(actionState(tender, now)));

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
      {error && <p className="inline-error finalizer-error" role="alert">{error}</p>}
      <section className="evidence-panel finalizer-queue" aria-label="Public lifecycle queue">
        <header className="detail-header">
          <div>
            <p className="eyebrow">CANONICAL ACTION QUEUE</p>
            <h2>{queue.length} non-terminal tender{queue.length === 1 ? "" : "s"}</h2>
          </div>
          <button className="icon-button" onClick={onRefresh} aria-label="Refresh public lifecycle queue">↻</button>
        </header>
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
              return (
                <article key={tender.tenderId.toString()} className="finalizer-card">
                  <header>
                    <div><p className="eyebrow">TENDER {tender.tenderId.toString()}</p><h3>{tender.status}</h3></div>
                    <span className="privacy-badge">PUBLIC CHECKPOINT</span>
                  </header>
                  <dl className="term-grid">
                    <div><dt>Buyer</dt><dd title={tender.buyer}>{short(tender.buyer)}</dd></div>
                    <div><dt>Deadline</dt><dd>{deadline(tender.bidDeadline)}</dd></div>
                    <div><dt>Accepted bids</dt><dd>{tender.bidCount.toString()} / {tender.approvedVendorCount}</dd></div>
                    <div><dt>Selection attempt</dt><dd>{tender.selectionAttempt || "Not requested"}</dd></div>
                  </dl>
                  <div className="finalizer-action-copy">
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
                    {(state === "request-selection" || state === "retry-selection" || state === "compute-live") && (
                      <a className="secondary-button" href="/docs#flare-coston2">OPEN RELAY RUNBOOK →</a>
                    )}
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
    </main>
  );
}
