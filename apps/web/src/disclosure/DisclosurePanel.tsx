import type { PublicBid, PublicTender } from "@flarequorum/chain-bindings";
import { useEffect, useMemo, useState } from "react";
import { revealAuthorizedBid } from "../auditor/revealBid";
import type { WalletController } from "../wallet/WalletPanel";
import type { InteractiveRole } from "../workspaces/RoleWorkspace";
import {
  grantStoredBidViewer,
  type ViewerGrantStage,
} from "./grantViewer";
import { useToasts } from "../shell/ToastProvider";
import { ContextHelp } from "../shell/ContextHelp";

export function eligibleDisclosureBids(
  role: InteractiveRole,
  account: string | null,
  tenders: readonly PublicTender[],
  bids: readonly PublicBid[],
) {
  if (!account) return [];
  return bids.filter((bid) => {
    const tender = tenders.find((item) => item.tenderId === bid.tenderId);
    return role === "VENDOR"
      ? bid.vendor.toLowerCase() === account.toLowerCase()
      : tender?.buyer.toLowerCase() === account.toLowerCase() &&
          !["FundingPending", "Open"].includes(tender.status);
  });
}

const viewerGrantStageLabel: Record<ViewerGrantStage, string> = {
  simulating: "Simulating the viewer grant…",
  signing: "Waiting for your wallet signature…",
  confirming: "Transaction signed. Waiting for Sepolia confirmation…",
};

export function DisclosurePanel({
  role,
  wallet,
  tenders,
  bids,
  onConfirmed,
}: {
  role: InteractiveRole;
  wallet: WalletController;
  tenders: readonly PublicTender[];
  bids: readonly PublicBid[];
  onConfirmed: () => void;
}) {
  const toasts = useToasts();
  const account = wallet.state.account;
  const eligible = useMemo(
    () => eligibleDisclosureBids(role, account, tenders, bids),
    [account, bids, role, tenders],
  );
  const [selectedKey, setSelectedKey] = useState("");
  const [viewer, setViewer] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [grantResult, setGrantResult] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = eligible.find(
    (bid) => `${bid.tenderId}:${bid.bidId}` === selectedKey,
  );
  const connected =
    wallet.state.status === "connected" &&
    wallet.state.walletClient &&
    wallet.state.account;

  useEffect(() => {
    setPlaintext(null);
    setGrantResult(null);
    setStage(null);
    setError(null);
  }, [selectedKey, wallet.state.sessionRevision]);

  async function reveal() {
    if (!connected || !selected) return;
    const toastId = toasts.start(
      "REVEAL STORED BID",
      "Waiting for wallet authorization and private decryption…",
    );
    setError(null);
    setStage("Authorizing session-only reveal");
    try {
      const result = await revealAuthorizedBid({
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        tenderId: selected.tenderId,
        bidId: selected.bidId,
      });
      setPlaintext(result.value);
      toasts.succeed(
        toastId,
        "Stored bid revealed in this browser session only.",
      );
    } catch (cause) {
      toasts.fail(
        toastId,
        "Stored bid reveal was rejected or unavailable.",
      );
      setError(cause instanceof Error ? cause.message : "Reveal failed.");
    } finally {
      setStage(null);
    }
  }

  async function grant() {
    if (!connected || !selected) return;
    const toastId = toasts.start(
      "GRANT BID VIEWER",
      "Simulating the per-bid viewer grant…",
    );
    setError(null);
    setStage("Simulating per-bid viewer grant");
    try {
      const transactionHash = await grantStoredBidViewer({
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        tenderId: selected.tenderId,
        bidId: selected.bidId,
        viewer,
        onStage: (nextStage) => {
          const message = viewerGrantStageLabel[nextStage];
          setStage(message);
          toasts.update(toastId, message);
        },
      });
      setGrantResult(
        `Viewer grant confirmed · ${transactionHash.slice(0, 10)}…${transactionHash.slice(-8)}`,
      );
      setViewer("");
      onConfirmed();
      toasts.succeed(
        toastId,
        "Viewer grant confirmed for the selected bid only.",
      );
    } catch (cause) {
      toasts.fail(
        toastId,
        "Viewer grant was rejected or failed on Sepolia.",
      );
      setError(cause instanceof Error ? cause.message : "Viewer grant failed.");
    } finally {
      setStage(null);
    }
  }

  return (
    <section className="write-form disclosure-panel">
      <div className="form-heading">
        <p className="eyebrow">{role === "VENDOR" ? "MY BID" : "SELECTIVE DISCLOSURE"}</p>
        <h2>
          {role === "VENDOR"
            ? "Reveal or share a bid you submitted."
            : "Reveal or grant one stored bid."}
        </h2>
        <ContextHelp
          compact
          label="Help for stored bid disclosure"
          title="HOW TO REVEAL A STORED BID"
          steps={[
            "Select a bid submitted by this connected wallet.",
            "Reveal decrypts only the selected handle in this browser session.",
            "A Vendor may grant only its own bid to another address; review wallets receive automatic access after finalization.",
          ]}
        />
      </div>
      <label>
        {role === "VENDOR" ? "My submitted bid" : "Eligible bid"}
        <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
          <option value="">
            {eligible.length === 0
              ? "No eligible bids for this wallet"
              : "Select one public bid reference"}
          </option>
          {eligible.map((bid) => (
            <option key={`${bid.tenderId}:${bid.bidId}`} value={`${bid.tenderId}:${bid.bidId}`}>
              Tender {bid.tenderId.toString()} · Bid {bid.bidId.toString()}
            </option>
          ))}
        </select>
      </label>
      {eligible.length === 0 && (
        <p className="form-empty-hint" role="status">
          This wallet has not submitted a bid in the indexed tenders.
        </p>
      )}
      <label>
        {role === "VENDOR" ? "Share with viewer address" : "Viewer address"}
        <input value={viewer} onChange={(event) => setViewer(event.target.value)} placeholder="0x…" />
      </label>
      <div className="privacy-confirmation">
        <strong>IRREVERSIBLE PER-HANDLE GRANT</strong>
        <span>
          A Vendor may optionally share only its own selected bid. Tender review
          wallets receive their access automatically after finalization.
        </span>
      </div>
      <div className="form-actions">
        <button className="secondary-button" disabled={!connected || !selected || stage !== null} onClick={() => void reveal()}>
          REVEAL TO THIS WALLET
        </button>
        <button className="primary-button" disabled={!connected || !selected || !viewer || stage !== null} onClick={() => void grant()}>
          GRANT THIS BID →
        </button>
      </div>
      {stage && <p className="progress-line" aria-live="polite">{stage}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {plaintext && (
        <p className="result-line" aria-live="polite">
          Session-only bid value · {plaintext}
        </p>
      )}
      {grantResult && (
        <p className="result-line" aria-live="polite">{grantResult}</p>
      )}
    </section>
  );
}
