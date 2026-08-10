import type { PublicBid, PublicTender } from "@flarequorum/chain-bindings";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import {
  createAuditorPublicClient,
  inspectBidViewer,
  revealAuthorizedBid,
} from "./revealBid";
import { WalletPanel, type WalletController } from "../wallet/WalletPanel";
import { ContextHelp } from "../shell/ContextHelp";
import { useToasts } from "../shell/ToastProvider";

export async function loadGrantedBidKeys(
  account: Address,
  bids: readonly PublicBid[],
) {
  const publicClient = createAuditorPublicClient();
  const checks = await Promise.all(
    bids.map(async (bid) => ({
      key: `${bid.tenderId}:${bid.bidId}`,
      authorized: await inspectBidViewer({
        publicClient,
        tenderId: bid.tenderId,
        bidId: bid.bidId,
        account,
      }),
    })),
  );
  return new Set(
    checks.filter((check) => check.authorized).map((check) => check.key),
  );
}

export function GrantedAccessPanel({
  wallet,
  tenders,
  bids,
  loadAccess = loadGrantedBidKeys,
  revealBid = revealAuthorizedBid,
}: {
  wallet: WalletController;
  tenders: readonly PublicTender[];
  bids: readonly PublicBid[];
  loadAccess?: typeof loadGrantedBidKeys;
  revealBid?: typeof revealAuthorizedBid;
}) {
  const toasts = useToasts();
  const [selection, setSelection] = useState("");
  const [authorizedKeys, setAuthorizedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [accessStatus, setAccessStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [accessRevision, setAccessRevision] = useState(0);
  const [revealed, setRevealed] = useState<{
    value: string;
    solidityType: string;
  } | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connected = Boolean(
    wallet.state.status === "connected" &&
    wallet.state.account &&
    wallet.state.walletClient,
  );
  const account = connected ? wallet.state.account : null;
  const options = useMemo(
    () =>
      bids.map((bid) => ({
        ...bid,
        tender: tenders.find(
          (tender) => tender.tenderId === bid.tenderId,
        ),
        key: `${bid.tenderId}:${bid.bidId}`,
      })),
    [bids, tenders],
  );
  const accessContextKey = options
    .map(
      (option) =>
        `${option.key}:${option.tender?.status ?? "Unknown"}:${
          option.tender?.viewerGrantCount ?? 0
        }:${option.tender?.updatedBlock?.toString() ?? "0"}`,
    )
    .join("|");
  const authorizedOptions = options.filter((option) =>
    authorizedKeys.has(option.key),
  );
  const selected = authorizedOptions.find(
    (option) => option.key === selection,
  );

  useEffect(() => {
    let active = true;
    setSelection("");
    setRevealed(null);
    setStage(null);
    setAccessError(null);
    setError(null);
    if (!account) {
      setAuthorizedKeys(new Set());
      setAccessStatus("idle");
      return () => {
        active = false;
      };
    }
    if (bids.length === 0) {
      setAuthorizedKeys(new Set());
      setAccessStatus("ready");
      return () => {
        active = false;
      };
    }
    setAccessStatus("loading");
    void loadAccess(account, bids)
      .then((keys) => {
        if (!active) return;
        setAuthorizedKeys(keys);
        setAccessStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setAuthorizedKeys(new Set());
        setAccessStatus("error");
        setAccessError(
          "Granted-access permissions could not be read from Sepolia. Retry without assuming access.",
        );
      });
    return () => {
      active = false;
    };
  }, [
    accessContextKey,
    accessRevision,
    account,
    loadAccess,
    wallet.state.sessionRevision,
  ]);

  useEffect(() => {
    setRevealed(null);
    setStage(null);
    setError(null);
  }, [selection, wallet.state.sessionRevision]);

  async function reveal() {
    if (!connected || !selected) return;
    const toastId = toasts.start(
      "REVEAL BID",
      "Waiting for wallet authorization and private decryption…",
    );
    setError(null);
    setStage("Awaiting wallet authorization and private reveal");
    try {
      const result = await revealBid({
        walletClient: wallet.state.walletClient!,
        tenderId: selected.tenderId,
        bidId: selected.bidId,
        account: wallet.state.account!,
      });
      setRevealed(result);
      toasts.succeed(
        toastId,
        "Bid revealed in this browser session only.",
      );
    } catch (cause) {
      setRevealed(null);
      toasts.fail(
        toastId,
        "Private reveal was rejected or could not be completed.",
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "Authorized reveal failed.",
      );
    } finally {
      setStage(null);
    }
  }

  return (
      <section className="write-form auditor-form" aria-label="Granted bid access">
        <div className="form-heading">
          <p className="eyebrow">GRANTED ACCESS</p>
          <h2>Reveal a bid shared with this wallet.</h2>
          <p>
            Only bids whose on-chain ACL authorizes this wallet appear here.
            Finalized tenders authorize their review wallet automatically;
            vendors may also share an individual bid.
          </p>
          <ContextHelp
            compact
            label="Help for granted bid access"
            title="HOW TO USE GRANTED ACCESS"
            steps={[
              "Connect the wallet that received review access or a Vendor grant.",
              "Wait while FlareQuorum checks every indexed bid ACL and keeps only authorized references.",
              "Select an authorized bid and reveal it for this browser session only.",
            ]}
          />
        </div>
        <label>
          <span>Public bid reference</span>
          <select
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
          >
            <option value="">
              {!connected
                ? "Connect wallet to load granted bids"
                : accessStatus === "loading"
                  ? "Checking granted access…"
                  : accessStatus === "error"
                    ? "Granted access is temporarily unavailable"
                    : authorizedOptions.length === 0
                      ? "No bids granted to this wallet"
                      : "Select authorized tender / bid"}
            </option>
            {authorizedOptions.map((option) => (
              <option value={option.key} key={option.key}>
                Tender {option.tenderId.toString()} · Bid{" "}
                {option.bidId.toString()} · {option.tender?.status ?? "Unknown"}
              </option>
            ))}
          </select>
        </label>
        {connected && accessStatus === "loading" && (
          <p className="form-empty-hint" role="status">
            Checking scoped viewer permissions on Sepolia…
          </p>
        )}
        {connected &&
          accessStatus === "ready" &&
          authorizedOptions.length === 0 && (
            <p className="form-empty-hint" role="status">
              This wallet has no granted bid access in the confirmed index.
              Review access appears automatically after finalization; Vendor
              grants appear after their transaction is indexed.
            </p>
          )}
        <div className="form-actions">
          <button
            className="secondary-button"
            disabled={!connected || accessStatus === "loading" || stage !== null}
            onClick={() => setAccessRevision((current) => current + 1)}
          >
            REFRESH ACCESS
          </button>
          <button
            className="primary-button"
            disabled={!connected || !selected || stage !== null}
            onClick={() => void reveal()}
          >
            REVEAL IN SESSION →
          </button>
        </div>
        {selected && (
          <p className="success-line" aria-live="polite">
            On-chain access confirmed for this bid only.
          </p>
        )}
        {stage && (
          <p className="progress-line" aria-live="polite">
            {stage}
          </p>
        )}
        {accessError && (
          <p className="inline-error" role="alert">
            {accessError}
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {revealed && (
          <section className="reveal-result" aria-live="polite">
            <p className="eyebrow">SESSION-ONLY PLAINTEXT</p>
            <strong>{revealed.value}</strong>
            <span>{revealed.solidityType} · cleared on wallet/session change</span>
          </section>
        )}
      </section>
  );
}

export function AuditorWorkspace(props: {
  wallet: WalletController;
  tenders: readonly PublicTender[];
  bids: readonly PublicBid[];
}) {
  return (
    <main className="role-workspace auditor-workspace" id="main-content">
      <section className="workspace-intro">
        <ContextHelp
          label="Help for granted bid access"
          title="HOW TO REVEAL GRANTED BIDS"
          steps={[
            "Connect the exact Sepolia wallet configured as review wallet or granted by a Vendor.",
            "Wait while FlareQuorum checks indexed bid permissions automatically.",
            "Select one of the authorized bid references shown.",
            "Reveal it for this session; plaintext clears when the wallet session changes.",
          ]}
          note="Viewer access provides no token, Safe signer, buyer, vendor, or administrator authority."
        />
        <p className="eyebrow">PRIVATE BIDS / GRANTED ACCESS</p>
        <h1>Reveal one granted bid.</h1>
      </section>
      <WalletPanel wallet={props.wallet} />
      <GrantedAccessPanel {...props} />
    </main>
  );
}
