import type { PublicTender } from "@veilbid/chain-bindings";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { ContextHelp } from "../shell/ContextHelp";
import type { WalletController } from "../wallet/WalletPanel";
import {
  markWinnerNotificationsRead,
  readWinnerNotificationIds,
  winnerNotificationChangedEvent,
} from "./winnerNotificationStore";

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function awardCheckpoint(tender: PublicTender) {
  const history = tender.history ?? [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.name === "TenderAwarded") return history[index]!;
  }
  return {
    blockNumber: tender.updatedBlock,
    transactionHash: tender.updatedTransaction,
  };
}

export function walletAwardNotifications(
  tenders: readonly PublicTender[],
  account: Address | null,
) {
  if (!account) return [];
  return tenders
    .filter(
      (tender) =>
        tender.status === "Awarded" &&
        tender.winner?.toLowerCase() === account.toLowerCase(),
    )
    .sort((left, right) => {
      const leftBlock = awardCheckpoint(left).blockNumber;
      const rightBlock = awardCheckpoint(right).blockNumber;
      if (leftBlock === rightBlock) {
        if (left.tenderId === right.tenderId) return 0;
        return left.tenderId > right.tenderId ? -1 : 1;
      }
      return leftBlock > rightBlock ? -1 : 1;
    });
}

function useWinnerNotificationState(
  wallet: WalletController,
  tenders: readonly PublicTender[],
) {
  const account =
    wallet.state.status === "connected" && wallet.state.account
      ? wallet.state.account
      : null;
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const reload = useCallback(() => {
    setReadIds(account ? readWinnerNotificationIds(account) : new Set());
  }, [account]);

  useEffect(() => {
    reload();
    window.addEventListener(winnerNotificationChangedEvent, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(winnerNotificationChangedEvent, reload);
      window.removeEventListener("storage", reload);
    };
  }, [reload, wallet.state.sessionRevision]);

  const awards = useMemo(
    () => walletAwardNotifications(tenders, account),
    [account, tenders],
  );
  const unread = awards.filter(
    (tender) => !readIds.has(tender.tenderId.toString()),
  );

  function markRead(tenderIds: readonly bigint[]) {
    if (!account) return;
    markWinnerNotificationsRead(account, tenderIds);
  }

  return { account, awards, readIds, unread, markRead };
}

export function WinnerNotificationBanner({
  wallet,
  tenders,
  onViewAward,
  onOpenActivity,
}: {
  wallet: WalletController;
  tenders: readonly PublicTender[];
  onViewAward: (tenderId: bigint) => void;
  onOpenActivity: () => void;
}) {
  const { unread, markRead } = useWinnerNotificationState(wallet, tenders);
  const latest = unread[0];
  if (!latest) return null;
  const award = awardCheckpoint(latest);

  return (
    <section
      className="winner-notification-banner"
      role="status"
      aria-live="polite"
      aria-label="New winner notifications"
    >
      <span className="winner-notification-mark" aria-hidden="true">
        ★
      </span>
      <div>
        <p className="eyebrow">AWARD NOTIFICATION / ON-CHAIN</p>
        <strong>You won Tender #{latest.tenderId.toString()}.</strong>
        <span>
          Award confirmed at block {award.blockNumber.toString()} · receipt #
          {latest.tenderId.toString()}
          {unread.length > 1
            ? ` · ${unread.length - 1} more new award${unread.length === 2 ? "" : "s"}`
            : ""}
        </span>
      </div>
      <div className="winner-notification-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            markRead([latest.tenderId]);
            onViewAward(latest.tenderId);
          }}
        >
          VIEW AWARD →
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            markRead([latest.tenderId]);
            onOpenActivity();
          }}
        >
          ACTIVITY HISTORY
        </button>
      </div>
    </section>
  );
}

export function WinnerNotificationHistory({
  wallet,
  tenders,
  onViewAward,
}: {
  wallet: WalletController;
  tenders: readonly PublicTender[];
  onViewAward: (tenderId: bigint) => void;
}) {
  const { account, awards, readIds, unread, markRead } =
    useWinnerNotificationState(wallet, tenders);

  return (
    <section
      className="activity-section winner-notification-history"
      id="award-notifications"
    >
      <header>
        <div>
          <p className="eyebrow">AWARD NOTIFICATIONS</p>
          <h2>
            {awards.length} {awards.length === 1 ? "award" : "awards"}
          </h2>
        </div>
        <span className="winner-new-count">
          <strong>{unread.length}</strong> NEW
        </span>
        <ContextHelp
          compact
          label="Help for award notifications"
          title="HOW AWARD NOTIFICATIONS WORK"
          steps={[
            "VeilBid derives this history from confirmed TenderAwarded events for the connected wallet.",
            "Open an award to inspect its public dossier and non-transferable receipt.",
            "Only whether an award notification was opened is stored locally; award records remain recoverable from Sepolia after reload.",
          ]}
          note="No bid value, confidential payment amount, handle, proof, or signature is stored here."
        />
      </header>
      {!account ? (
        <p className="empty-activity">
          Connect a wallet to load its on-chain award notifications.
        </p>
      ) : awards.length === 0 ? (
        <p className="empty-activity">
          No awarded tender currently names this wallet as winner.
        </p>
      ) : (
        <div className="winner-notification-list">
          {awards.map((tender) => {
            const read = readIds.has(tender.tenderId.toString());
            const award = awardCheckpoint(tender);
            return (
              <article
                className="winner-notification-card"
                data-read={read}
                key={tender.tenderId.toString()}
              >
                <div className="winner-notification-card-copy">
                  <span className="winner-notification-state">
                    {read ? "AWARD" : "NEW AWARD"}
                  </span>
                  <p className="eyebrow">PROOF-DERIVED WINNER</p>
                  <h3>You won Tender #{tender.tenderId.toString()}</h3>
                  <span>
                    Confirmed at block {award.blockNumber.toString()} · award
                    receipt #{tender.tenderId.toString()}
                  </span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${award.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    title={award.transactionHash}
                  >
                    Settlement {shortHash(award.transactionHash)} ↗
                  </a>
                </div>
                <div className="winner-notification-card-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      markRead([tender.tenderId]);
                      onViewAward(tender.tenderId);
                    }}
                  >
                    VIEW PUBLIC AWARD →
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
