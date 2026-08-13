import { coston2FlarePublicRelease, flareQuorumFlareMarketAbi } from "@flarequorum/flare-bindings";
import { createPublicClient, http, isAddressEqual, type Abi } from "viem";
import { useEffect, useMemo, useState } from "react";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import { ContextHelp } from "../shell/ContextHelp";
import { useToasts } from "../shell/ToastProvider";
import type { WalletController } from "../wallet/WalletPanel";
import { WalletPanel } from "../wallet/WalletPanel";
import { loadFlareSelectionQuorum } from "./flareBidIngress";
import { FlareRedemptionPanel } from "./FlareRedemptionPanel";

const coston2 = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

export type DirectAction = "closeTender" | "cancelTender" | "refundExpiredSelection";
type Confirmation = { tenderId: bigint; action: "cancelTender" | "refundExpiredSelection" };
type ActivityState = "close" | "cancel-or-wait" | "wait-for-bids" | "request-selection" | "compute-live" | "retry-selection" | "refund-ready" | "terminal";
type TenderStatus = FlarePublicTender["status"];
type LocalSelection = { selectionAttempt: number; selectionStartedAt: bigint; resultExpiry: bigint };
type LocalProgress = { closed?: true; computeStarted?: true; finalized?: true };
type LatestLifecycle = LocalSelection & { status: TenderStatus };

const tenderStatusOrder: Record<TenderStatus, number> = {
  FundingPending: 0,
  Open: 1,
  Closed: 2,
  ComputePending: 3,
  Awarded: 4,
  Refunded: 5,
  Cancelled: 6,
};

const directActionStatus: Record<DirectAction, TenderStatus> = {
  closeTender: "Closed",
  cancelTender: "Cancelled",
  refundExpiredSelection: "Refunded",
};

const tenderStatuses: readonly TenderStatus[] = [
  "FundingPending", "Open", "Closed", "ComputePending", "Awarded", "Refunded", "Cancelled",
];

function tenderStatus(value: unknown): TenderStatus {
  const status = tenderStatuses[Number(value)];
  if (!status) throw new Error("COSTON2_TENDER_STATUS_INVALID");
  return status;
}

export function directActionWasApplied(action: DirectAction, status: number): boolean {
  if (action === "closeTender") return status >= 2 && status <= 5;
  if (action === "cancelTender") return status === 6;
  return status === 5;
}

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

function actionPresentation(state: ActivityState, buyerConnected: boolean, status: TenderStatus) {
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
      return { title: "Ready to start FCC", status: "ACTION AVAILABLE", permission: "ANYONE", lane: "action" };
    case "compute-live":
      return { title: "FCC result pending", status: "ACTION AVAILABLE", permission: "ANYONE", lane: "action" };
    case "retry-selection":
      return { title: "FCC retry available", status: "ACTION AVAILABLE", permission: "ANYONE", lane: "action" };
    case "refund-ready":
      return buyerConnected
        ? { title: "Escrow recovery available", status: "ACTION AVAILABLE", permission: "BUYER ONLY · THIS WALLET", lane: "action" }
        : { title: "Buyer recovery available", status: "BUYER ACTION", permission: "BUYER ONLY", lane: "waiting" };
    default:
      return {
        title: status === "Awarded"
          ? "Award finalized"
          : status === "Refunded"
            ? "Escrow refunded"
            : "No action required",
        status: "COMPLETE",
        permission: "PUBLIC RECORD",
        lane: "complete",
      };
  }
}

export function finalizerLifecycleQueue(
  tenders: readonly FlarePublicTender[],
): readonly FlarePublicTender[] {
  const active = tenders.filter(
    (tender) => !["Awarded", "Refunded", "Cancelled"].includes(tender.status),
  );
  const latestCompleted = tenders.reduce<FlarePublicTender | null>((latest, tender) => {
    if (!["Awarded", "Refunded"].includes(tender.status)) return latest;
    return !latest || tender.tenderId > latest.tenderId ? tender : latest;
  }, null);
  return latestCompleted ? [...active, latestCompleted] : active;
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
  const [localStatuses, setLocalStatuses] = useState<Record<string, TenderStatus>>({});
  const [localSelections, setLocalSelections] = useState<Record<string, LocalSelection>>({});
  const [localProgress, setLocalProgress] = useState<Record<string, LocalProgress>>({});
  const [latestLifecycles, setLatestLifecycles] = useState<Record<string, LatestLifecycle>>({});
  const connected = wallet.state.status === "connected" && wallet.state.account && wallet.state.walletClient;

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(BigInt(Math.floor(Date.now() / 1_000))),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalStatuses((current) => {
      const next = { ...current };
      let changed = false;
      for (const tender of tenders) {
        const key = tender.tenderId.toString();
        const localStatus = next[key];
        if (localStatus && tenderStatusOrder[tender.status] >= tenderStatusOrder[localStatus]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [tenders]);

  useEffect(() => {
    setLocalSelections((current) => {
      const next = { ...current };
      let changed = false;
      for (const tender of tenders) {
        const key = tender.tenderId.toString();
        const local = next[key];
        if (
          local && (
            tenderStatusOrder[tender.status] > tenderStatusOrder.ComputePending ||
            tender.status === "ComputePending" && tender.selectionAttempt >= local.selectionAttempt
          )
        ) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [tenders]);

  useEffect(() => {
    const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
    if (!rpcUrl) return;
    let active = true;
    const publicClient = createPublicClient({
      chain: coston2,
      transport: http(rpcUrl, { retryCount: 1, timeout: 8_000 }),
    });
    void Promise.all(tenders.map(async (tender) => {
      const record = await publicClient.readContract({
        address: coston2FlarePublicRelease.market,
        abi: flareQuorumFlareMarketAbi as Abi,
        functionName: "getTender",
        args: [tender.tenderId],
      }) as { selectionAttempt: number; selectionStartedAt: bigint; resultExpiry: bigint; status: number };
      return [tender.tenderId.toString(), {
        status: tenderStatus(record.status),
        selectionAttempt: Number(record.selectionAttempt),
        selectionStartedAt: BigInt(record.selectionStartedAt),
        resultExpiry: BigInt(record.resultExpiry),
      }] as const;
    })).then((entries) => {
      if (active) setLatestLifecycles(Object.fromEntries(entries));
    }).catch(() => {
      // Finalized market props remain authoritative when the latest RPC read is unavailable.
    });
    return () => { active = false; };
  }, [tenders]);

  const effectiveTenders = useMemo(
    () => tenders.map((tender) => {
      const key = tender.tenderId.toString();
      const latest = latestLifecycles[key];
      const base = latest && tenderStatusOrder[latest.status] >= tenderStatusOrder[tender.status]
        ? { ...tender, ...latest }
        : tender;
      const localStatus = localStatuses[key];
      const status = localStatus && tenderStatusOrder[localStatus] >= tenderStatusOrder[base.status]
        ? localStatus
        : base.status;
      const selection = localSelections[key];
      return { ...base, ...selection, status };
    }),
    [latestLifecycles, localSelections, localStatuses, tenders],
  );

  const queue = useMemo(
    () => finalizerLifecycleQueue(effectiveTenders),
    [effectiveTenders],
  );
  const actionableCount = queue.filter((tender) => {
    const state = actionState(tender, now);
    if (["close", "request-selection", "compute-live", "retry-selection"].includes(state)) return true;
    return Boolean(
      connected
      && (state === "cancel-or-wait" || state === "refund-ready")
      && isAddressEqual(wallet.state.account!, tender.buyer),
    );
  }).length;
  const hasWalletAction = actionableCount > 0;

  function markProgress(tenderId: bigint, progress: LocalProgress) {
    setLocalProgress((current) => ({
      ...current,
      [tenderId.toString()]: { ...current[tenderId.toString()], ...progress },
    }));
  }

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
    const publicClient = createPublicClient({
      chain: coston2,
      transport: http(rpcUrl, { retryCount: 1, timeout: 8_000 }),
    });
    const applyLocalStatus = () => {
      setLocalStatuses((current) => ({
        ...current,
        [tender.tenderId.toString()]: directActionStatus[action],
      }));
      setConfirmation(null);
      if (action === "closeTender") markProgress(tender.tenderId, { closed: true });
      setError(null);
      onRefresh();
    };
    const readLatestStatus = async () => {
      const record = await publicClient.readContract({
        address: coston2FlarePublicRelease.market,
        abi: flareQuorumFlareMarketAbi as Abi,
        functionName: "getTender",
        args: [tender.tenderId],
      }) as { status: number };
      return Number(record.status);
    };
    setBusy(key);
    setError(null);
    try {
      if (directActionWasApplied(action, await readLatestStatus())) {
        applyLocalStatus();
        toasts.succeed(toastId, `${labels[action]} is already confirmed on Coston2.`);
        return;
      }
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
      applyLocalStatus();
      toasts.succeed(toastId, `${labels[action]} confirmed on Coston2.`);
    } catch (cause) {
      try {
        if (directActionWasApplied(action, await readLatestStatus())) {
          applyLocalStatus();
          toasts.succeed(toastId, `${labels[action]} confirmed on Coston2.`);
          return;
        }
      } catch {
        // Preserve the original action error when the recovery read is unavailable.
      }
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

  async function runSelectionRequest(tender: FlarePublicTender, retry: boolean) {
    if (!connected) return;
    const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
    const rawFee = import.meta.env.VITE_FLARE_FCC_INSTRUCTION_FEE_WEI?.trim();
    if (!rpcUrl || !rawFee || !/^[1-9][0-9]*$/.test(rawFee)) {
      setError("FCC instruction fee or Coston2 RPC is not configured. No write was attempted.");
      return;
    }
    const action = retry ? "retrySelection" : "requestSelection";
    const key = `${action}:${tender.tenderId.toString()}`;
    const label = retry ? "RETRY FCC COMPUTE" : "START FCC COMPUTE";
    const expectedAttempt = tender.selectionAttempt + 1;
    const toastId = toasts.startStack(label, "Re-reading canonical Coston2 state…");
    const publicClient = createPublicClient({
      chain: coston2,
      transport: http(rpcUrl, { retryCount: 1, timeout: 8_000 }),
    });
    const applied = async () => {
      const record = await publicClient.readContract({
        address: coston2FlarePublicRelease.market,
        abi: flareQuorumFlareMarketAbi as Abi,
        functionName: "getTender",
        args: [tender.tenderId],
      }) as { selectionAttempt: number; status: number };
      const status = Number(record.status);
      return status >= 4 || (status === 3 && Number(record.selectionAttempt) >= expectedAttempt);
    };
    const applyLocalStatus = () => {
      const selectionStartedAt = BigInt(Math.floor(Date.now() / 1_000));
      setLocalStatuses((current) => ({ ...current, [tender.tenderId.toString()]: "ComputePending" }));
      setLocalSelections((current) => ({
        ...current,
        [tender.tenderId.toString()]: {
          selectionAttempt: expectedAttempt,
          selectionStartedAt,
          resultExpiry: selectionStartedAt + 3_600n,
        },
      }));
      markProgress(tender.tenderId, { closed: true, computeStarted: true });
      setError(null);
      onRefresh();
    };
    setBusy(key);
    setError(null);
    try {
      if (await applied()) {
        applyLocalStatus();
        toasts.succeed(toastId, `${label} is already confirmed on Coston2.`);
        return;
      }
      const simulation = await publicClient.simulateContract({
        account: wallet.state.account!,
        address: coston2FlarePublicRelease.market,
        abi: flareQuorumFlareMarketAbi as Abi,
        functionName: action,
        args: [tender.tenderId],
        value: BigInt(rawFee),
      });
      toasts.update(toastId, "Awaiting the Coston2 wallet signature…");
      const hash = await wallet.state.walletClient!.writeContract(simulation.request);
      toasts.update(toastId, "Dispatching the frozen request to all three FCC machines…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("COSTON2_SELECTION_REQUEST_FAILED");
      applyLocalStatus();
      toasts.succeed(toastId, `${label} confirmed. FCC result collection is now available.`);
    } catch (cause) {
      try {
        if (await applied()) {
          applyLocalStatus();
          toasts.succeed(toastId, `${label} confirmed on Coston2.`);
          return;
        }
      } catch {
        // Preserve the original dispatch error when the recovery read is unavailable.
      }
      setError(cause instanceof Error ? cause.message : "FCC selection dispatch failed.");
      toasts.fail(toastId, "FCC compute was not started. No fallback result was used.");
    } finally {
      setBusy(null);
    }
  }

  async function runFinalize(tender: FlarePublicTender) {
    if (!connected) return;
    const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
    if (!rpcUrl) {
      setError("Coston2 RPC is unavailable. No write was attempted.");
      return;
    }
    const key = `finalizeTender:${tender.tenderId.toString()}`;
    const toastId = toasts.startStack("FINALIZE FCC RESULT", "Checking for an exact 2-of-3 FCC result…");
    const publicClient = createPublicClient({
      chain: coston2,
      transport: http(rpcUrl, { retryCount: 1, timeout: 8_000 }),
    });
    const terminalStatus = async (): Promise<TenderStatus | null> => {
      const record = await publicClient.readContract({
        address: coston2FlarePublicRelease.market,
        abi: flareQuorumFlareMarketAbi as Abi,
        functionName: "getTender",
        args: [tender.tenderId],
      }) as { status: number };
      const status = Number(record.status);
      return status === 4 ? "Awarded" : status === 5 ? "Refunded" : null;
    };
    const applyTerminalStatus = (status: TenderStatus) => {
      setLocalStatuses((current) => ({ ...current, [tender.tenderId.toString()]: status }));
      markProgress(tender.tenderId, { closed: true, computeStarted: true, finalized: true });
      setError(null);
      onRefresh();
    };
    setBusy(key);
    setError(null);
    try {
      const existing = await terminalStatus();
      if (existing) {
        applyTerminalStatus(existing);
        toasts.succeed(toastId, `Tender is already ${existing} on Coston2.`);
        return;
      }
      const latest = await publicClient.readContract({
        address: coston2FlarePublicRelease.market,
        abi: flareQuorumFlareMarketAbi as Abi,
        functionName: "getTender",
        args: [tender.tenderId],
      }) as Pick<FlarePublicTender,
        "closeBlock" | "codeVersion" | "commonQuorumBitmap" | "extensionId" |
        "ftsoDecimals" | "ftsoFeedId" | "ftsoTimestamp" | "ftsoValue" |
        "orderedBidRoot" | "requestId" | "resultExpiry" | "resultNonce" |
        "rulesHash" | "teeIds">;
      const quorum = await loadFlareSelectionQuorum({ ...tender, ...latest });
      toasts.update(toastId, "2-of-3 FCC signatures match. Awaiting wallet confirmation…");
      const simulation = await publicClient.simulateContract({
        account: wallet.state.account!,
        address: coston2FlarePublicRelease.market,
        abi: flareQuorumFlareMarketAbi as Abi,
        functionName: "finalizeTender",
        args: [tender.tenderId, quorum.result, quorum.proofs],
      });
      const hash = await wallet.state.walletClient!.writeContract(simulation.request);
      toasts.update(toastId, "Waiting for the Coston2 award receipt…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("COSTON2_FINALIZATION_FAILED");
      const status = quorum.result.winnerBidId === 0n ? "Refunded" : "Awarded";
      applyTerminalStatus(status);
      toasts.succeed(toastId, `Tender finalized as ${status} with a verified 2-of-3 FCC result.`);
    } catch (cause) {
      try {
        const status = await terminalStatus();
        if (status) {
          applyTerminalStatus(status);
          toasts.succeed(toastId, `Tender is already ${status} on Coston2.`);
          return;
        }
      } catch {
        // Preserve the original finalization error when the recovery read is unavailable.
      }
      const message = cause instanceof Error ? cause.message : "FCC finalization failed.";
      setError(message === "FCC_SELECTION_QUORUM_PENDING" ? "FCC is still computing. Wait a few seconds, then try FINALIZE again." : message);
      toasts.fail(toastId, message === "FCC_SELECTION_QUORUM_PENDING"
        ? "The 2-of-3 FCC result is not ready yet. Try again in a few seconds."
        : "Finalization stopped. No client-computed winner or fallback was used.");
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
            "Start FCC Compute asks the connected wallet to pay the public instruction fee and dispatch the frozen request.",
            "Finalize checks for two FCC machines signing the exact same result, then asks the wallet to submit it.",
            "A browser never calculates a winner or chooses between split TEE digests.",
            "After the fixed 24-hour failed-compute grace, only the buyer can recover the original escrow with no award.",
          ]}
          note="This workspace fails closed. It never substitutes a manual price, mock TEE result, or client-provided winner."
        />
        <p className="eyebrow">COSTON2 PUBLIC FINALIZER / RECOVERY</p>
        <h1>Advance public checkpoints.</h1>
        <p>
          Anyone may close eligible tenders, start FCC compute, and submit an exact
          threshold result. The browser receives no bid-decryption capability and never
          calculates a winner. Buyer-only cancellation and failed-compute refund
          controls appear only when canonical rules permit them.
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
            <h2>{queue.length} lifecycle checkpoint{queue.length === 1 ? "" : "s"}</h2>
          </div>
          <button className="icon-button" onClick={onRefresh} aria-label="Refresh public lifecycle queue">↻</button>
        </header>
        <div className="activity-queue-summary" aria-label="Activity action summary">
          <div><strong>{actionableCount}</strong><span>NEED{actionableCount === 1 ? "S" : ""} ACTION</span></div>
          <div><strong>{queue.length - actionableCount}</strong><span>TRACKING ONLY</span></div>
          <p>Use the three numbered buttons in order. A confirmed step stays visible and cannot be submitted again.</p>
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
              const requestKey = `requestSelection:${tender.tenderId.toString()}`;
              const retryKey = `retrySelection:${tender.tenderId.toString()}`;
              const finalizeKey = `finalizeTender:${tender.tenderId.toString()}`;
              const cancelKey = `cancelTender:${tender.tenderId.toString()}`;
              const refundKey = `refundExpiredSelection:${tender.tenderId.toString()}`;
              const isConfirming = confirmation?.tenderId === tender.tenderId;
              const presentation = actionPresentation(state, buyerConnected, tender.status);
              const progress = localProgress[tender.tenderId.toString()] ?? {};
              const closeComplete = progress.closed === true || ["Closed", "ComputePending", "Awarded", "Refunded"].includes(tender.status);
              const computeComplete = progress.computeStarted === true || tender.selectionAttempt > 0 || ["ComputePending", "Awarded", "Refunded"].includes(tender.status);
              const finalizeComplete = progress.finalized === true || ["Awarded", "Refunded"].includes(tender.status);
              const closeAvailable = state === "close";
              const startAvailable = closeComplete && !computeComplete && state === "request-selection";
              const finalizeAvailable = computeComplete && !finalizeComplete && state === "compute-live";
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
                    {state === "request-selection" && <p>Pay the public FCC instruction fee and dispatch the frozen selection request to all three machines.</p>}
                    {state === "compute-live" && <p>FCC attempt {Math.max(1, tender.selectionAttempt)} is live. Finalize accepts only exact result bytes signed by two distinct frozen machines.</p>}
                    {state === "retry-selection" && <p>The signed-result window expired. Retry with a fresh nonce while every frozen input stays unchanged.</p>}
                    {state === "refund-ready" && <p>The failed-compute grace elapsed. Only the original buyer may recover the exact escrow; this creates no winner or award receipt.</p>}
                  </div>
                  <section className="activity-step-guide" aria-label={`Tender ${tender.tenderId.toString()} three-step finalization guide`}>
                    <div>
                      <p className="eyebrow">DO THESE IN ORDER · ONE WALLET CONFIRMATION AT A TIME</p>
                      <p>Press step 1, wait for its checkmark, then continue to step 2 and step 3. Locked buttons open automatically after the previous transaction succeeds.</p>
                    </div>
                    <ol className="activity-step-actions">
                      <li data-complete={closeComplete}>
                        <span>1</span>
                        <button
                          className={closeComplete ? "secondary-button lifecycle-step-button is-complete" : "primary-button lifecycle-step-button"}
                          type="button"
                          disabled={closeComplete || !closeAvailable || !connected || busy !== null}
                          aria-current={!closeComplete && closeAvailable ? "step" : undefined}
                          onClick={() => void runDirectAction(tender, "closeTender")}
                        >
                          {closeComplete ? "✓ TENDER CLOSED" : busy === closeKey ? "CLOSING…" : "CLOSE & FREEZE FTSO →"}
                        </button>
                        <small>{closeComplete ? "Confirmed" : closeAvailable ? "Ready now" : "Complete bid quorum first"}</small>
                      </li>
                      <li data-complete={computeComplete}>
                        <span>2</span>
                        <button
                          className={computeComplete ? "secondary-button lifecycle-step-button is-complete" : "primary-button lifecycle-step-button"}
                          type="button"
                          disabled={computeComplete || !startAvailable || !connected || busy !== null}
                          aria-current={!computeComplete && startAvailable ? "step" : undefined}
                          onClick={() => void runSelectionRequest(tender, false)}
                        >
                          {computeComplete ? "✓ FCC COMPUTE STARTED" : busy === requestKey ? "STARTING FCC…" : "START FCC COMPUTE →"}
                        </button>
                        <small>{computeComplete ? "Confirmed" : closeComplete ? "Ready after close finality" : "Locked until step 1"}</small>
                      </li>
                      <li data-complete={finalizeComplete}>
                        <span>3</span>
                        <button
                          className={finalizeComplete ? "secondary-button lifecycle-step-button is-complete" : "primary-button lifecycle-step-button"}
                          type="button"
                          disabled={finalizeComplete || !finalizeAvailable || !connected || busy !== null}
                          aria-current={!finalizeComplete && finalizeAvailable ? "step" : undefined}
                          onClick={() => void runFinalize(tender)}
                        >
                          {finalizeComplete ? "✓ AWARD / REFUND FINALIZED" : busy === finalizeKey ? "CHECKING 2/3 FCC…" : "CHECK 2/3 & FINALIZE →"}
                        </button>
                        <small>{finalizeComplete ? "Confirmed" : finalizeAvailable ? "Wait for 2-of-3 FCC, then press" : "Locked until step 2"}</small>
                      </li>
                    </ol>
                  </section>
                  <div className="finalizer-actions activity-recovery-actions">
                    {state === "retry-selection" && (
                      <button className="primary-button" type="button" disabled={!connected || busy !== null} onClick={() => void runSelectionRequest(tender, true)}>
                        {busy === retryKey ? "RETRYING FCC…" : "RETRY FCC COMPUTE →"}
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
