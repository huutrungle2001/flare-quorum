import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicBid, PublicTender } from "@veilbid/chain-bindings";
import type { Address, WalletClient } from "viem";
import { GrantedAccessPanel } from "../src/auditor/AuditorWorkspace";
import type { WalletController } from "../src/wallet/WalletPanel";

const account = "0x1111111111111111111111111111111111111111" as Address;
const vendor = "0x2222222222222222222222222222222222222222" as Address;
const hash = `0x${"33".repeat(32)}` as const;

afterEach(cleanup);

const wallet = {
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

function tender(tenderId: bigint): PublicTender {
  return {
    tenderId,
    buyer: account,
    reviewViewer: account,
    paymentToken: account,
    metadataHash: hash,
    publicCeiling: 10_000_000n,
    bidDeadline: 2_000_000_000n,
    closeBlock: 100n,
    approvedVendorCount: 2,
    bidCount: 1,
    status: "Awarded",
    winnerBidId: 1n,
    winner: vendor,
    viewerGrantCount: 1,
    createdBlock: 90n,
    updatedBlock: 100n,
    createdTransaction: hash,
    updatedTransaction: hash,
  };
}

const bids: PublicBid[] = [
  {
    tenderId: 1n,
    bidId: 1n,
    vendor,
    submittedBlock: 91n,
    submittedTransaction: hash,
  },
  {
    tenderId: 2n,
    bidId: 1n,
    vendor,
    submittedBlock: 92n,
    submittedTransaction: hash,
  },
];

describe("Granted Access", () => {
  it("automatically lists only bids authorized for the connected wallet", async () => {
    const loadAccess = vi.fn().mockResolvedValue(new Set(["2:1"]));
    const revealBid = vi.fn().mockResolvedValue({
      value: "7",
      solidityType: "uint256",
    });

    render(
      <GrantedAccessPanel
        wallet={wallet}
        tenders={[tender(1n), tender(2n)]}
        bids={bids}
        loadAccess={loadAccess}
        revealBid={revealBid}
      />,
    );

    expect(screen.getByRole("option")).toHaveTextContent(
      "Checking granted access",
    );
    expect(
      screen.queryByRole("button", { name: "CHECK VIEWER ACCESS" }),
    ).not.toBeInTheDocument();

    const authorized = await screen.findByRole("option", {
      name: "Tender 2 · Bid 1 · Awarded",
    });
    expect(
      screen.queryByRole("option", { name: "Tender 1 · Bid 1 · Awarded" }),
    ).not.toBeInTheDocument();
    expect(loadAccess).toHaveBeenCalledWith(account, bids);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: authorized.getAttribute("value") },
    });
    expect(screen.getByText(/On-chain access confirmed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /REVEAL IN SESSION/ }));
    await waitFor(() => expect(revealBid).toHaveBeenCalledOnce());
    expect(await screen.findByText("7")).toBeInTheDocument();
  });

  it("shows an explicit error and no public bid fallback when ACL reads fail", async () => {
    render(
      <GrantedAccessPanel
        wallet={wallet}
        tenders={[tender(1n), tender(2n)]}
        bids={bids}
        loadAccess={vi.fn().mockRejectedValue(new Error("RPC unavailable"))}
      />,
    );

    expect(
      await screen.findByText(/permissions could not be read from Sepolia/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /REVEAL IN SESSION/ })).toBeDisabled();
  });
});
