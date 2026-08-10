import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicTender } from "@flarequorum/chain-bindings";
import type { Address, WalletClient } from "viem";
import { VendorBidForm } from "../src/workspaces/VendorBidForm";
import type { WalletController } from "../src/wallet/WalletPanel";

const account = "0x1111111111111111111111111111111111111111" as Address;

function connectedWallet() {
  return {
    state: {
      status: "connected",
      providers: [],
      selectedProvider: null,
      account,
      chainId: 11155111,
      walletClient: {} as WalletClient,
      error: null,
      sessionRevision: 0,
    },
    connect: vi.fn(),
    switchToSepolia: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as WalletController;
}

function openTender(): PublicTender {
  return {
    tenderId: 7n,
    buyer: "0x2222222222222222222222222222222222222222",
    reviewViewer: "0x2222222222222222222222222222222222222222",
    paymentToken: "0x3333333333333333333333333333333333333333",
    metadataHash: `0x${"44".repeat(32)}`,
    publicCeiling: 100_000_000n,
    bidDeadline: BigInt(Math.floor(Date.now() / 1_000) + 3_600),
    closeBlock: null,
    approvedVendorCount: 1,
    bidCount: 0,
    status: "Open",
    winnerBidId: null,
    winner: null,
    viewerGrantCount: 0,
    createdBlock: 1n,
    updatedBlock: 1n,
    createdTransaction: `0x${"55".repeat(32)}`,
    updatedTransaction: `0x${"55".repeat(32)}`,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Vendor bid admission refresh", () => {
  it("does not recheck admission or flicker on every countdown tick", async () => {
    vi.useFakeTimers();
    const readAdmission = vi.fn().mockResolvedValue({
      approved: false,
      submitted: false,
    });
    render(
      <VendorBidForm
        wallet={connectedWallet()}
        tenders={[openTender()]}
        onConfirmed={vi.fn()}
        readAdmission={readAdmission}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(readAdmission).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/No active tender is approved for this wallet/i),
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3_000);
      await Promise.resolve();
    });

    expect(readAdmission).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/No active tender is approved for this wallet/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Checking vendor admission/i)).toBeNull();
  });
});
