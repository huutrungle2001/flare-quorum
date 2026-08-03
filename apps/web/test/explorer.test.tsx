import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicMarketState } from "../src/public-market/usePublicMarket";
import { ExplorerView } from "../src/shell/App";
import type { WalletController } from "../src/wallet/WalletPanel";
import { saveRecoveryRecord } from "../src/activity/recoveryStore";

const buyer = "0x1111111111111111111111111111111111111111";
const transactionHash = `0x${"22".repeat(32)}` as const;

afterEach(cleanup);

function state(
  overrides: Partial<PublicMarketState> = {},
): PublicMarketState {
  return {
    status: "ready",
    error: null,
    refreshedAt: new Date("2026-07-26T00:00:00Z"),
    data: {
      finalizedBlock: 100n,
      indexedBlock: 112n,
      latestBlock: 112n,
      deploymentKind: "test-e2e",
      deploymentVerified: false,
      index: {
        tenders: [
          {
            tenderId: 1n,
            buyer,
            reviewViewer: buyer,
            paymentToken: buyer,
            metadataHash: `0x${"33".repeat(32)}`,
            publicCeiling: 100_000_000n,
            bidDeadline: 2_000_000_000n,
            closeBlock: null,
            approvedVendorCount: 2,
            bidCount: 1,
            status: "Open",
            winnerBidId: null,
            winner: null,
            viewerGrantCount: 0,
            createdBlock: 90n,
            updatedBlock: 95n,
            createdTransaction: transactionHash,
            updatedTransaction: transactionHash,
          },
        ],
        bids: [],
        checkpoint: { blockNumber: 95n, eventCount: 2 },
      },
    },
    ...overrides,
  };
}

const disconnectedWallet = {
  state: {
    status: "disconnected",
    providers: [],
    selectedProvider: null,
    account: null,
    chainId: null,
    walletClient: null,
    error: null,
    sessionRevision: 0,
  },
  connect: vi.fn(),
  switchToSepolia: vi.fn(),
  disconnect: vi.fn(),
} as unknown as WalletController;

function view(
  marketState: PublicMarketState,
  onRetry = vi.fn(),
  wallet?: WalletController,
) {
  return render(
    <MemoryRouter initialEntries={["/room"]}>
      <ExplorerView state={marketState} onRetry={onRetry} wallet={wallet} />
    </MemoryRouter>,
  );
}

describe("Tender Room public explorer", () => {
  it("renders a finalized public tender without wallet or bid plaintext", () => {
    view(state());
    expect(
      screen.getByRole("button", { name: "Help for Public workspace" }),
    ).toHaveAttribute("aria-describedby");
    expect(screen.getByText("1 tenders")).toBeInTheDocument();
    expect(
      screen.getByText(
        "TEST-E2E DEPLOYMENT · NOT SOURCE/DEPLOYMENT VERIFIED",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Confidential procurement #1").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("100 vUSDC").length).toBeGreaterThan(0);
    expect(screen.getByText("◆ ENCRYPTED PRICE")).toBeInTheDocument();
    expect(screen.queryByText("37 vUSDC")).not.toBeInTheDocument();
  });

  it("labels the canonical release from live deployment metadata", () => {
    const release = state();
    release.data = {
      ...release.data!,
      deploymentKind: "release",
      deploymentVerified: true,
    };
    view(release);
    expect(
      screen.getByText("RELEASE DEPLOYMENT · SOURCE/DEPLOYMENT VERIFIED"),
    ).toBeInTheDocument();
  });

  it("hides cancelled history by default and exposes it through the status filter", async () => {
    const filtered = state();
    const openTender = filtered.data!.index.tenders[0];
    filtered.data = {
      ...filtered.data!,
      index: {
        ...filtered.data!.index,
        tenders: [
          openTender,
          {
            ...openTender,
            tenderId: 2n,
            status: "Cancelled",
            bidCount: 0,
          },
          {
            ...openTender,
            tenderId: 3n,
            status: "Awarded",
            winner: buyer,
            winnerBidId: 1n,
          },
        ],
      },
    };
    view(filtered);
    expect(screen.getByText("2 tenders")).toBeInTheDocument();
    expect(screen.queryByText("Confidential procurement #2")).not.toBeInTheDocument();

    const filter = screen.getByRole("combobox", {
      name: "Filter public tenders",
    });
    fireEvent.change(filter, { target: { value: "cancelled" } });
    expect(screen.getByText("1 tenders")).toBeInTheDocument();
    expect(screen.getAllByText("Confidential procurement #2").length).toBeGreaterThan(0);
    expect(filter).toHaveValue("cancelled");
    fireEvent.click(
      screen.getByRole("button", { name: /Confidential procurement #2/ }),
    );
    await waitFor(() => expect(filter).toHaveValue("cancelled"));
  });

  it("exposes an Open-only public filter", () => {
    const filtered = state();
    const openTender = filtered.data!.index.tenders[0];
    filtered.data = {
      ...filtered.data!,
      index: {
        ...filtered.data!.index,
        tenders: [
          openTender,
          {
            ...openTender,
            tenderId: 2n,
            status: "Awarded",
            winnerBidId: 1n,
            winner: buyer,
          },
        ],
      },
    };
    view(filtered);
    const filter = screen.getByRole("combobox", {
      name: "Filter public tenders",
    });
    expect(
      screen.getByRole("option", { name: "Open" }),
    ).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "open" } });
    expect(filter).toHaveValue("open");
    expect(screen.getByText("1 tenders")).toBeInTheDocument();
    expect(
      screen.getAllByText("Confidential procurement #1").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Confidential procurement #2"),
    ).not.toBeInTheDocument();
  });

  it("moves expired on-chain Open tenders into Ready to close", () => {
    const filtered = state();
    const expiredTender = {
      ...filtered.data!.index.tenders[0],
      bidDeadline: 1n,
    };
    filtered.data = {
      ...filtered.data!,
      index: {
        ...filtered.data!.index,
        tenders: [
          expiredTender,
          {
            ...expiredTender,
            tenderId: 2n,
            bidDeadline: 2_000_000_000n,
          },
        ],
      },
    };
    view(filtered);

    expect(screen.getAllByText("READY TO CLOSE").length).toBeGreaterThan(0);
    const filter = screen.getByRole("combobox", {
      name: "Filter public tenders",
    });
    fireEvent.change(filter, { target: { value: "open" } });
    expect(
      screen.queryByText("Confidential procurement #1"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Confidential procurement #2").length,
    ).toBeGreaterThan(0);

    fireEvent.change(filter, { target: { value: "ready-to-close" } });
    expect(filter).toHaveValue("ready-to-close");
    expect(
      screen.getAllByText("Confidential procurement #1").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Confidential procurement #2"),
    ).not.toBeInTheDocument();
  });

  it("surfaces explicit non-transferable receipt evidence after award", () => {
    const awarded = state();
    const tender = awarded.data!.index.tenders[0];
    awarded.data = {
      ...awarded.data!,
      index: {
        ...awarded.data!.index,
        tenders: [
          {
            ...tender,
            status: "Awarded",
            closeBlock: 96n,
            winnerBidId: 1n,
            winner: buyer,
          },
        ],
      },
    };
    view(awarded);
    expect(
      screen.getByRole("region", { name: "Award receipt evidence" }),
    ).toHaveTextContent("Receipt #1");
    expect(screen.getByText("DISABLED")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /inspect on sepolia/i }),
    ).toHaveAttribute("href", expect.stringContaining("sepolia.etherscan.io"));
  });

  it("labels recent confirmed state until it crosses the finality boundary", () => {
    const recent = state();
    recent.data = {
      ...recent.data!,
      index: {
        ...recent.data!.index,
        tenders: recent.data!.index.tenders.map((tender) => ({
          ...tender,
          updatedBlock: 110n,
        })),
      },
    };
    view(recent);
    expect(screen.getByText("CONFIRMED / FINALITY PENDING")).toBeInTheDocument();
    expect(screen.getByText("Block 112")).toBeInTheDocument();
    expect(screen.getByText("Block 100")).toBeInTheDocument();
  });

  it("shows an explicit loading state without placeholder dossiers", () => {
    view(state({ status: "loading", data: null }));
    expect(
      screen.getByText("Reading confirmed Sepolia logs"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Confidential procurement #/)).not.toBeInTheDocument();
  });

  it("shows RPC failure without mock fallback and supports retry", () => {
    const retry = vi.fn();
    view(
      state({
        status: "error",
        data: null,
        error:
          "Sepolia public state is unavailable. No fallback data is shown.",
      }),
      retry,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No fallback data is shown",
    );
    fireEvent.click(screen.getByRole("button", { name: /retry sepolia/i }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps every primary workspace visible and wallet actions unavailable", () => {
    view(state());
    const workspaceButtons = Array.from(
      screen.getByLabelText("Tender workspaces").querySelectorAll("button"),
    ).map((button) => button.textContent);
    expect(workspaceButtons).toEqual([
      "PUBLIC",
      "BUYER",
      "PRIVATE BIDS",
      "ACTIVITY",
    ]);
    expect(screen.getByRole("button", { name: "PUBLIC" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "BUYER" })).toBeDisabled();
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "PUBLIC" }));
    expect(window.scrollTo).toHaveBeenCalledWith({
      behavior: "auto",
      left: 0,
      top: 0,
    });
  });

  it("opens Activity recovery without requiring a connected account", () => {
    render(
      <MemoryRouter initialEntries={["/room"]}>
        <ExplorerView
          state={state()}
          onRetry={vi.fn()}
          wallet={disconnectedWallet}
          activeRole="ACTIVITY"
          onRoleChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", {
        name: "Automatic by default. Recoverable by design.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Help for Activity workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/public IDs and transaction hashes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ACTIVITY" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "0 items" })).toBeInTheDocument();
    expect(screen.getByLabelText("Automation status summary")).toHaveTextContent(
      "0 NEEDS ATTENTION",
    );
    expect(screen.getByLabelText("Automation status summary")).toHaveTextContent(
      "0 AUTO-READY",
    );
    expect(screen.getByLabelText("Automation status summary")).toHaveTextContent(
      "0 IN PROGRESS",
    );
    expect(screen.queryByText("ALL CAUGHT UP")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /SHOW DETAILS/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText("ALL CAUGHT UP")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("automatically expands Automation Status for a recoverable checkpoint", () => {
    saveRecoveryRecord({
      kind: "winner",
      tenderId: 9n,
      triggerTransactionHash: transactionHash,
    });
    render(
      <MemoryRouter initialEntries={["/room"]}>
        <ExplorerView
          state={state()}
          onRetry={vi.fn()}
          wallet={disconnectedWallet}
          activeRole="ACTIVITY"
          onRoleChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Automation status summary")).toHaveTextContent(
      "1 NEEDS ATTENTION",
    );
    expect(screen.getByRole("button", { name: /HIDE DETAILS/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "RESUME →" })).toBeVisible();
  });

  it("combines Vendor and granted access in Private Bids", () => {
    render(
      <MemoryRouter initialEntries={["/room"]}>
        <ExplorerView
          state={state()}
          onRetry={vi.fn()}
          wallet={disconnectedWallet}
          activeRole="PRIVATE BIDS"
          onRoleChange={vi.fn()}
          privateSection="granted-access"
          onPrivateSectionChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /SUBMIT BID/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MY BID/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /GRANTED ACCESS/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reveal a bid shared with this wallet." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PRIVATE BIDS" })).toBeEnabled();
  });

  it("explains empty Vendor actions instead of leaving disabled controls ambiguous", () => {
    const inactive = state();
    inactive.data = {
      ...inactive.data!,
      index: {
        ...inactive.data!.index,
        tenders: inactive.data!.index.tenders.map((tender) => ({
          ...tender,
          status: "Closed" as const,
          closeBlock: 96n,
        })),
      },
    };
    render(
      <MemoryRouter initialEntries={["/room"]}>
        <ExplorerView
          state={inactive}
          onRetry={vi.fn()}
          wallet={disconnectedWallet}
          activeRole="PRIVATE BIDS"
          onRoleChange={vi.fn()}
          privateSection="submit"
          onPrivateSectionChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/No confirmed, unexpired tender is accepting bids/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /No active tenders/i })).toBeInTheDocument();
  });

  it("removes expired Open tenders from the Vendor selector", () => {
    const expired = state();
    expired.data = {
      ...expired.data!,
      index: {
        ...expired.data!.index,
        tenders: expired.data!.index.tenders.map((tender) => ({
          ...tender,
          bidDeadline: 1n,
        })),
      },
    };
    render(
      <MemoryRouter initialEntries={["/room"]}>
        <ExplorerView
          state={expired}
          onRetry={vi.fn()}
          wallet={disconnectedWallet}
          activeRole="PRIVATE BIDS"
          onRoleChange={vi.fn()}
          privateSection="submit"
          onPrivateSectionChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/No confirmed, unexpired tender is accepting bids/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /No active tenders/i }))
      .toBeInTheDocument();
  });

  it("opens the primary Safe Buyer workspace", () => {
    render(
      <MemoryRouter initialEntries={["/room"]}>
        <ExplorerView
          state={state()}
          onRetry={vi.fn()}
          wallet={disconnectedWallet}
          activeRole="BUYER"
          onRoleChange={vi.fn()}
          buyerSection="safe"
          onBuyerSectionChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Use your own Safe treasury." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Help for Safe Buyer workspace",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/discovers Safe accounts owned by/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SAFE BUYER/ })).toBeInTheDocument();
  });

  it("defaults Buyer to EOA and keeps EOA before Safe", () => {
    const onBuyerSectionChange = vi.fn();
    render(
      <MemoryRouter initialEntries={["/room"]}>
        <ExplorerView
          state={state()}
          onRetry={vi.fn()}
          wallet={disconnectedWallet}
          activeRole="BUYER"
          onRoleChange={vi.fn()}
          onBuyerSectionChange={onBuyerSectionChange}
        />
      </MemoryRouter>,
    );
    const tabs = Array.from(
      screen.getByRole("navigation", { name: "Buyer sections" }).querySelectorAll("button"),
    )
      .map((button) => button.textContent)
      .filter((label) => label?.includes("BUYER"));
    expect(tabs).toEqual([
      "EOA BUYEREOAUse a direct wallet",
      "SAFE BUYERSAFEUse a Safe treasury",
    ]);
    expect(screen.getByRole("button", { name: /EOA BUYER/ })).toHaveClass("active");
    expect(screen.getByRole("heading", { name: "Fund public terms." })).toBeInTheDocument();
    expect(screen.getByText("TENDER TERMS")).toBeInTheDocument();
    expect(screen.getByText("APPROVED VENDORS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONNECT WALLET TO CREATE" })).toBeInTheDocument();
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("button", { name: /SAFE BUYER/ }));
    expect(onBuyerSectionChange).toHaveBeenCalledWith("safe");
    expect(window.scrollTo).toHaveBeenCalledWith({
      behavior: "auto",
      left: 0,
      top: 0,
    });
  });
});
