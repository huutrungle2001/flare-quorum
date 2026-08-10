import type { PublicTender } from "@flarequorum/chain-bindings";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, WalletClient } from "viem";
import {
  walletAwardNotifications,
  WinnerNotificationBanner,
  WinnerNotificationHistory,
} from "../src/activity/WinnerNotifications";
import {
  markWinnerNotificationsRead,
  readWinnerNotificationIds,
  winnerNotificationStorageKey,
} from "../src/activity/winnerNotificationStore";
import type { WalletController } from "../src/wallet/WalletPanel";

const winner = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const createdTransaction = `0x${"33".repeat(32)}` as const;
const awardTransaction = `0x${"44".repeat(32)}` as const;
const laterTransaction = `0x${"55".repeat(32)}` as const;

afterEach(cleanup);

const wallet = {
  state: {
    status: "connected",
    providers: [],
    selectedProvider: null,
    account: winner,
    chainId: 11155111,
    walletClient: {} as WalletClient,
    error: null,
    sessionRevision: 0,
  },
  connect: vi.fn(),
  switchToSepolia: vi.fn(),
  disconnect: vi.fn(),
} as unknown as WalletController;

function awardedTender(
  tenderId: bigint,
  overrides: Partial<PublicTender> = {},
): PublicTender {
  return {
    tenderId,
    buyer: other,
    reviewViewer: other,
    paymentToken: other,
    metadataHash: createdTransaction,
    publicCeiling: 100_000_000n,
    bidDeadline: 2_000_000_000n,
    closeBlock: 90n,
    approvedVendorCount: 2,
    bidCount: 2,
    status: "Awarded",
    winnerBidId: 1n,
    winner,
    viewerGrantCount: 1,
    createdBlock: 80n,
    updatedBlock: 110n,
    createdTransaction,
    updatedTransaction: laterTransaction,
    history: [
      {
        name: "TenderAwarded",
        blockNumber: 100n + tenderId,
        transactionHash: awardTransaction,
      },
      {
        name: "ViewerGranted",
        blockNumber: 110n + tenderId,
        transactionHash: laterTransaction,
      },
    ],
    ...overrides,
  };
}

describe("winner notification storage", () => {
  it("persists only validated read IDs and isolates wallets", () => {
    markWinnerNotificationsRead(winner, [2n, 1n, 2n]);

    expect([...readWinnerNotificationIds(winner)]).toEqual(["1", "2"]);
    expect([...readWinnerNotificationIds(other)]).toEqual([]);
    expect(JSON.parse(localStorage.getItem(winnerNotificationStorageKey(winner))!))
      .toEqual(["1", "2"]);

    localStorage.setItem(winnerNotificationStorageKey(winner), "not-json");
    expect([...readWinnerNotificationIds(winner)]).toEqual([]);
  });
});

describe("winner notifications", () => {
  it("filters for the connected winner and orders by the award checkpoint", () => {
    const newest = awardedTender(2n);
    const older = awardedTender(1n);
    const lost = awardedTender(3n, { winner: other });
    const stillClosed = awardedTender(4n, { status: "Closed" });

    expect(
      walletAwardNotifications([older, lost, newest, stillClosed], winner).map(
        (tender) => tender.tenderId,
      ),
    ).toEqual([2n, 1n]);
  });

  it("shows unread awards and marks the opened award as read", async () => {
    const onViewAward = vi.fn();
    render(
      <WinnerNotificationBanner
        wallet={wallet}
        tenders={[awardedTender(1n), awardedTender(2n)]}
        onViewAward={onViewAward}
        onOpenActivity={vi.fn()}
      />,
    );

    expect(screen.getByText("You won Tender #2.")).toBeInTheDocument();
    expect(screen.getByText(/block 102 · receipt #2/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /MARK.*READ/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "VIEW AWARD →" }));

    expect(onViewAward).toHaveBeenCalledWith(2n);
    await waitFor(() =>
      expect(screen.getByText("You won Tender #1.")).toBeInTheDocument(),
    );
    expect([...readWinnerNotificationIds(winner)]).toContain("2");
  });

  it("marks the notification read when its Activity history is opened", () => {
    const onOpenActivity = vi.fn();
    render(
      <WinnerNotificationBanner
        wallet={wallet}
        tenders={[awardedTender(1n)]}
        onViewAward={vi.fn()}
        onOpenActivity={onOpenActivity}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ACTIVITY HISTORY" }));

    expect(onOpenActivity).toHaveBeenCalledOnce();
    expect([...readWinnerNotificationIds(winner)]).toContain("1");
  });

  it("keeps the complete on-chain award history in Activity", async () => {
    markWinnerNotificationsRead(winner, [1n]);
    const onViewAward = vi.fn();
    render(
      <WinnerNotificationHistory
        wallet={wallet}
        tenders={[awardedTender(1n), awardedTender(2n)]}
        onViewAward={onViewAward}
      />,
    );

    expect(screen.getByRole("heading", { name: "2 awards" })).toBeInTheDocument();
    expect(screen.getByText("AWARD")).toBeInTheDocument();
    expect(screen.getByText("NEW AWARD")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /MARK.*READ/ }),
    ).not.toBeInTheDocument();
    const settlementLinks = screen.getAllByRole("link", { name: /Settlement/ });
    expect(settlementLinks[0]).toHaveAttribute(
      "href",
      `https://sepolia.etherscan.io/tx/${awardTransaction}`,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "VIEW PUBLIC AWARD →" })[0]!,
    );
    expect(onViewAward).toHaveBeenCalledWith(2n);
    await waitFor(() => expect(screen.getAllByText("AWARD")).toHaveLength(2));
  });
});
