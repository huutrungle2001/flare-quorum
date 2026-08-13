import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FlareAppSidebar,
  FlareEvidenceWorkspace,
  FlareExplorerView,
  FlareRoleBar,
} from "../src/flare/FlareRoom";
import { FlareBuyerWorkspace } from "../src/flare/FlareBuyerWorkspace";
import { FlareAuditorWorkspace } from "../src/flare/FlareAuditorWorkspace";
import {
  directActionWasApplied,
  finalizerLifecycleQueue,
  FlareFinalizerWorkspace,
} from "../src/flare/FlareFinalizerWorkspace";
import { FlareVendorWorkspace } from "../src/flare/FlareVendorWorkspace";
import { FlareLandingPage } from "../src/flare/FlareLandingPage";
import { FlareRedemptionPanel } from "../src/flare/FlareRedemptionPanel";
import { FlareXrpFundingPanel } from "../src/flare/FlareXrpFundingPanel";
import { readPublicFlareFundingCheckpoint, savePublicFlareFundingCheckpoint } from "../src/flare/fundingCheckpoint";
import {
  savePendingFlareBid,
  readPendingFlareTender,
  savePendingFlareTender,
} from "../src/flare/pendingFinality";
import { PrimaryNavigation } from "../src/shell/PrimaryNavigation";
import type { WalletController } from "../src/wallet/WalletPanel";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const wallet = {
  state: { status: "disconnected", providers: [], selectedProvider: null, account: null, chainId: null, walletClient: null, error: null, sessionRevision: 0 },
} as unknown as WalletController;

const vendorAddress = "0x5000000000000000000000000000000000000005" as const;
const connectedVendorWallet = {
  state: {
    status: "connected",
    providers: [],
    selectedProvider: "test",
    account: vendorAddress,
    chainId: 114,
    walletClient: {},
    error: null,
    sessionRevision: 1,
  },
} as unknown as WalletController;

const publicTender = {
  tenderId: 1n,
  buyer: "0x1000000000000000000000000000000000000001" as const,
  metadataHash: `0x${"11".repeat(32)}` as const,
  rulesHash: `0x${"22".repeat(32)}` as const,
  scoringPolicy: {
    schemaVersion: 1,
    ceilingXrpMicros: 1_000_000n,
    bidDeadline: 2_000_000_000n,
    allowXrp: true,
    allowUsd: true,
    ftsoFeedId: "0x015852502f55534400000000000000000000000000" as const,
    maxDeliveryDays: 30,
    minWarrantyDays: 12,
    maxWarrantyDays: 36,
    priceWeightBps: 6_000,
    deliveryWeightBps: 2_500,
    warrantyWeightBps: 1_500,
    requiredCredentials: [],
  },
  publicCeilingXrp: 1_000_000n,
  bidDeadline: 2_000_000_000n,
  closeBlock: 0n,
  bidCount: 0n,
  approvedVendorCount: 1,
  commonQuorumBitmap: 7,
  orderedBidRoot: `0x${"33".repeat(32)}` as const,
  extensionId: 65_922n,
  codeVersion: `0x${"44".repeat(32)}` as const,
  ftsoFeedId: "0x015852502f55534400000000000000000000000000" as const,
  ftsoValue: 0n,
  ftsoDecimals: 0,
  ftsoTimestamp: 0n,
  selectionStartedAt: 0n,
  selectionAttempt: 0,
  resultNonce: 0n,
  resultExpiry: 0n,
  requestId: `0x${"00".repeat(32)}` as const,
  status: "Open" as const,
  teeIds: [
    "0x2000000000000000000000000000000000000002" as const,
    "0x3000000000000000000000000000000000000003" as const,
    "0x4000000000000000000000000000000000000004" as const,
  ] as const,
  teeKeyFingerprints: [
    `0x${"55".repeat(32)}` as const,
    `0x${"66".repeat(32)}` as const,
    `0x${"77".repeat(32)}` as const,
  ] as const,
  winnerBidId: null,
  winner: null,
  winningAmountXrp: null,
  awardTransactionHash: null,
  bidReferences: [],
  award: null,
};

describe("Coston2 public evidence boundary", () => {
  it("shows an unavailable state without Sepolia or mock fallback", () => {
    render(<MemoryRouter><FlareExplorerView state={{ status: "error", data: null, error: "Coston2 unavailable. No fallback." }} onRetry={() => undefined} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Flare state unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/No fallback/)).toBeInTheDocument();
    expect(screen.queryByText(/Sepolia public state/i)).toBeNull();
  });

  it("labels an empty planned market honestly", () => {
    render(<MemoryRouter><FlareExplorerView state={{ status: "ready", error: null, data: { chainId: 114, tenders: [], indexedBlock: 10n, finalizedBlock: 0n, latestBlock: 10n, deploymentStatus: "planned" } }} onRetry={() => undefined} /></MemoryRouter>);
    expect(screen.getByText(/NOT YET VERIFIED/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No Coston2 tenders yet" })).toBeInTheDocument();
  });

  it("keeps the verified release label visible inside the tender room", () => {
    render(<MemoryRouter><FlareExplorerView state={{ status: "ready", error: null, data: { chainId: 114, tenders: [], indexedBlock: 22n, finalizedBlock: 22n, latestBlock: 34n, deploymentStatus: "verified" } }} onRetry={() => undefined} /></MemoryRouter>);
    expect(screen.getByText("VERIFIED COSTON2 RELEASE")).toBeInTheDocument();
  });

  it("shows a confirmed tender immediately while canonical finality catches up", async () => {
    savePendingFlareTender({
      version: 1,
      tenderId: "9",
      transactionHash: `0x${"99".repeat(32)}`,
      blockNumber: "123456",
      buyer: publicTender.buyer,
      recordedAt: "2026-08-14T00:00:00.000Z",
    });
    const state = {
      status: "ready" as const,
      error: null,
      data: {
        chainId: 114 as const,
        tenders: [publicTender],
        indexedBlock: 100n,
        finalizedBlock: 100n,
        latestBlock: 112n,
        deploymentStatus: "verified" as const,
      },
    };
    const view = render(<MemoryRouter><FlareExplorerView state={state} onRetry={() => undefined} /></MemoryRouter>);
    expect(screen.getByText("TENDER 9 · JUST CREATED")).toBeInTheDocument();
    expect(screen.getByText("WAITING FOR 12-BLOCK FINALITY")).toBeInTheDocument();
    expect(screen.getByText(/Public refresh runs every 3 seconds/)).toBeInTheDocument();

    view.rerender(<MemoryRouter><FlareExplorerView state={{
      ...state,
      data: { ...state.data, tenders: [publicTender, { ...publicTender, tenderId: 9n }] },
    }} onRetry={() => undefined} /></MemoryRouter>);
    await waitFor(() => expect(readPendingFlareTender()).toBeNull());
    expect(screen.queryByText("TENDER 9 · JUST CREATED")).toBeNull();
    expect(screen.getByRole("button", { name: /Tender #9/i })).toBeInTheDocument();
  });

  it("offers an optional Coston2 wallet without gating the read-only Flare route", () => {
    render(<MemoryRouter initialEntries={["/flare"]}><PrimaryNavigation wallet={wallet} /></MemoryRouter>);
    expect(screen.getByText("COSTON2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONNECT FOR ACTIONS" })).toBeInTheDocument();
  });

  it.each(["public", "evidence"] as const)(
    "shows connected wallet assets in the %s workspace",
    (activeRole) => {
      render(
        <MemoryRouter>
          <FlareAppSidebar
            activeRole={activeRole}
            onRoleChange={() => undefined}
            wallet={connectedVendorWallet}
          />
        </MemoryRouter>,
      );
      expect(
        screen.getByRole("region", { name: "Coston2 wallet assets" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("PUBLIC READS NEED NO SIGNATURE")).toBeNull();
    },
  );

  it("keeps the disconnected Public workspace wallet-optional", () => {
    render(
      <MemoryRouter>
        <FlareAppSidebar
          activeRole="public"
          onRoleChange={() => undefined}
          wallet={wallet}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("PUBLIC READS NEED NO SIGNATURE")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Coston2 wallet assets" }),
    ).toBeNull();
  });

  it("renders the contract-canonical public scoring policy", () => {
    render(<MemoryRouter><FlareExplorerView state={{
      status: "ready",
      error: null,
      data: {
        chainId: 114,
        tenders: [publicTender],
        indexedBlock: 100n,
        finalizedBlock: 100n,
        latestBlock: 112n,
        deploymentStatus: "planned",
      },
    }} onRetry={() => undefined} /></MemoryRouter>);
    expect(screen.getByText("XRP + USD")).toBeInTheDocument();
    expect(screen.getByText("60% price / 25% delivery / 15% warranty")).toBeInTheDocument();
    expect(screen.getByText("≤ 30d delivery / 12–36d warranty")).toBeInTheDocument();
    expect(screen.getByText("Inspect protocol deployment facts").closest("details")).not.toHaveAttribute("open");
  });

  it("paginates canonical dossiers and searches without fabricating titles", async () => {
    const tenders = Array.from({ length: 7 }, (_value, index) => ({
      ...publicTender,
      tenderId: BigInt(index + 1),
    }));
    render(<MemoryRouter><FlareExplorerView state={{
      status: "ready",
      error: null,
      data: {
        chainId: 114,
        tenders,
        indexedBlock: 100n,
        finalizedBlock: 100n,
        latestBlock: 112n,
        deploymentStatus: "verified",
      },
    }} onRetry={() => undefined} /></MemoryRouter>);

    expect(screen.getByRole("button", { name: /Tender #7/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tender #1/i })).toBeNull();
    expect(screen.queryByText("Flare confidential procurement")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "NEXT →" }));
    expect(await screen.findByRole("button", { name: /Tender #1/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search public state"), { target: { value: "Tender 4" } });
    await waitFor(() => expect(screen.getByRole("heading", { name: "1 tender" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Tender #4/i })).toBeInTheDocument();
  });

  it("restores the Flare product story and keeps signing optional", () => {
    render(<MemoryRouter><FlareLandingPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Private bids.*Public awards/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "EXPLORE LIVE TENDERS →" })).toHaveAttribute("href", "/flare");
    expect(screen.getByRole("link", { name: "VIEW LIVE EVIDENCE →" })).toHaveAttribute("href", "/flare?role=auditor");
    expect(screen.getByText(/V2 · COSTON2 TESTNET · 3 SIMULATED TEES/i)).toBeInTheDocument();
    expect(screen.getByText(/Testnet assets · SIMULATED_TEE=true · unaudited hackathon software/i)).toBeInTheDocument();
    expect(screen.getByText(/FIVE WORKSPACES \/ ONE APP SHELL/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Private bids produce a threshold-signed award/i })).toBeInTheDocument();
    expect(screen.queryByText(/losing offers never become browser/i)).toBeNull();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("TEST ASSETS ONLY · UNAUDITED");
  });

  it("exposes the complete Flare role taxonomy without private-audit authority", () => {
    const onRoleChange = vi.fn();
    render(<FlareRoleBar activeRole="public" onRoleChange={onRoleChange} />);
    expect(screen.getByRole("button", { name: "PUBLIC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BUYER" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PRIVATE BIDS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ACTIVITY" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "XRP TREASURY" })).toBeNull();
    expect(screen.getByRole("button", { name: "AUDITOR" })).toBeInTheDocument();
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "BUYER" }));
    expect(onRoleChange).toHaveBeenCalledWith("buyer");
    expect(window.scrollTo).toHaveBeenCalledWith({ behavior: "auto", left: 0, top: 0 });
  });

  it("renders the dedicated public activity ledger without exposing bid data", () => {
    render(<MemoryRouter><FlareEvidenceWorkspace state={{
      status: "ready",
      error: null,
      data: {
        chainId: 114,
        tenders: [publicTender],
        indexedBlock: 100n,
        finalizedBlock: 100n,
        latestBlock: 112n,
        deploymentStatus: "verified",
      },
    }} onRetry={() => undefined} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "1 tender in public state" })).toBeInTheDocument();
    expect(screen.getByText("Threshold result pending")).toBeInTheDocument();
    expect(screen.getByText(/Only public commitments, finalized checkpoints/)).toBeInTheDocument();
    expect(screen.queryByText(/plaintext bid|ciphertext/i)).toBeNull();
  });

  it("renders a read-only auditor binding with no reveal or signing control", () => {
    render(<FlareAuditorWorkspace tenders={[publicTender]} finalizedBlock={100n} />);
    expect(screen.getByRole("heading", { name: "Inspect the binding, not the bids." })).toBeInTheDocument();
    expect(screen.getByText(/NO BID DECRYPTION/i)).toBeInTheDocument();
    expect(screen.getAllByText(/TEE [123]/)).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Copy market address" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reveal|decrypt|finalize/i })).toBeNull();
  });

  it("opens the newest awarded audit dossier and filters the selector", () => {
    const tenders = [
      { ...publicTender, tenderId: 2n, status: "Open" as const },
      { ...publicTender, tenderId: 8n, status: "Awarded" as const },
      { ...publicTender, tenderId: 5n, status: "Awarded" as const },
    ];
    render(<FlareAuditorWorkspace tenders={tenders} finalizedBlock={100n} />);

    expect(screen.getByLabelText("Public tender dossier")).toHaveValue("8");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "active" } });
    expect(screen.getByLabelText("Public tender dossier")).toHaveValue("2");
    fireEvent.change(screen.getByLabelText("Search public state"), { target: { value: "missing" } });
    expect(screen.getByRole("heading", { name: "No dossiers match this view" })).toBeInTheDocument();
  });

  it("shows permissionless close readiness without computing a winner", () => {
    render(<FlareFinalizerWorkspace wallet={wallet} tenders={[{
      ...publicTender,
      bidCount: 1n,
      approvedVendorCount: 1,
    }]} onRefresh={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Advance public checkpoints." })).toBeInTheDocument();
    expect(screen.getByText("ACTION CENTER / CANONICAL CHECKPOINTS")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready to close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CLOSE & FREEZE FTSO →" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "START FCC COMPUTE →" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CHECK 2/3 & FINALIZE →" })).toBeDisabled();
    expect(screen.getByText(/press step 1, wait for its checkmark/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VIEW PUBLIC DOSSIER →" })).toHaveAttribute("href", "/flare?status=all&tender=1");
    expect(screen.queryByRole("link", { name: "OPEN RELAY RUNBOOK →" })).toBeNull();
    expect(screen.queryByText("Selection attempt")).toBeNull();
    expect(screen.getByText(/no bid-decryption capability/i)).toBeInTheDocument();
    expect(screen.queryByText(/client-provided winner accepted/i)).toBeNull();
  });

  it("recognizes finalizer actions already applied in latest Coston2 state", () => {
    expect(directActionWasApplied("closeTender", 1)).toBe(false);
    expect(directActionWasApplied("closeTender", 2)).toBe(true);
    expect(directActionWasApplied("closeTender", 3)).toBe(true);
    expect(directActionWasApplied("closeTender", 6)).toBe(false);
    expect(directActionWasApplied("cancelTender", 6)).toBe(true);
    expect(directActionWasApplied("refundExpiredSelection", 5)).toBe(true);
  });

  it("offers wallet-triggered FCC dispatch and threshold finalization", () => {
    const closed = render(<FlareFinalizerWorkspace wallet={wallet} tenders={[{
      ...publicTender,
      status: "Closed",
      bidCount: 2n,
      approvedVendorCount: 2,
    }]} onRefresh={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Ready to start FCC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✓ TENDER CLOSED" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "START FCC COMPUTE →" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CHECK 2/3 & FINALIZE →" })).toBeDisabled();
    expect(screen.queryByText(/dedicated relay/i)).toBeNull();
    closed.unmount();

    render(<FlareFinalizerWorkspace wallet={wallet} tenders={[{
      ...publicTender,
      status: "ComputePending",
      bidCount: 2n,
      approvedVendorCount: 2,
      selectionStartedAt: 1_900_000_000n,
      selectionAttempt: 1,
      resultExpiry: 2_000_000_000n,
    }]} onRefresh={() => undefined} />);
    expect(screen.getByRole("heading", { name: "FCC result pending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✓ TENDER CLOSED" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "✓ FCC COMPUTE STARTED" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CHECK 2/3 & FINALIZE →" })).toBeDisabled();
  });

  it("keeps the latest completed FCC lifecycle visible after it leaves the active queue", () => {
    const older = { ...publicTender, tenderId: 7n, status: "Awarded" as const };
    const latest = { ...publicTender, tenderId: 8n, status: "Awarded" as const };
    expect(finalizerLifecycleQueue([older, latest])).toEqual([latest]);

    render(<FlareFinalizerWorkspace wallet={wallet} tenders={[older, latest]} onRefresh={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Award finalized" })).toBeInTheDocument();
    expect(screen.getByText("TENDER 8 · AWARDED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✓ TENDER CLOSED" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "✓ FCC COMPUTE STARTED" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "✓ AWARD / REFUND FINALIZED" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "No pending lifecycle action" })).toBeNull();
  });

  it("asks the vendor to connect only when an open tender has a bid action", () => {
    const first = render(<MemoryRouter><FlareVendorWorkspace wallet={wallet} tenders={[{ ...publicTender, status: "Cancelled" }]} onRefresh={() => undefined} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "No open Coston2 tenders" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect to submit this action." })).toBeNull();
    first.unmount();

    render(<MemoryRouter><FlareVendorWorkspace wallet={wallet} tenders={[publicTender]} onRefresh={() => undefined} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Connect to submit this action." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SUBMIT BID" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "MY SUBMISSIONS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "REVIEW SEALED BID →" })).toBeDisabled();
    expect(screen.queryByText(/&amp;/)).toBeNull();
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "MY SUBMISSIONS" }));
    expect(window.scrollTo).toHaveBeenCalledWith({ behavior: "auto", left: 0, top: 0 });
    expect(screen.getByRole("heading", { name: "Track your submissions." })).toBeInTheDocument();
  });

  it("shows only wallet-scoped public receipts in My Submissions", () => {
    const submittedTender = {
      ...publicTender,
      status: "Awarded" as const,
      bidCount: 1n,
      winnerBidId: 1n,
      winner: vendorAddress,
      bidReferences: [{
        bidId: 1n,
        vendor: vendorAddress,
        submissionNonce: 91n,
        plaintextCommitment: `0x${"88".repeat(32)}` as const,
        receiptBitmap: 7,
        receiptExpiry: 2_000_000_000n,
        acceptedBlock: 123_456n,
      }],
    };
    render(
      <MemoryRouter initialEntries={["/flare?role=vendor&vendor=submissions"]}>
        <FlareVendorWorkspace wallet={connectedVendorWallet} tenders={[submittedTender]} onRefresh={() => undefined} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Track your submissions." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MY SUBMISSIONS · 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Submission accepted" })).toBeInTheDocument();
    expect(screen.getByText("WINNER")).toBeInTheDocument();
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByText(/Private terms were deliberately not persisted/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VIEW PUBLIC DOSSIER →" })).toHaveAttribute("href", "/flare?status=all&tender=1");
    expect(screen.queryByText(/0\.72 XRP|Delivery days|Warranty days/)).toBeNull();
  });

  it("restores a public-safe pending bid immediately in My Submissions", async () => {
    savePendingFlareBid({
      version: 1,
      tenderId: "1",
      vendor: vendorAddress,
      transactionHash: `0x${"91".repeat(32)}`,
      blockNumber: "123456",
      commitment: `0x${"92".repeat(32)}`,
      submissionNonce: "91",
      receiptExpiry: "2000000000",
    });
    render(
      <MemoryRouter initialEntries={["/flare?role=vendor&vendor=submissions"]}>
        <FlareVendorWorkspace wallet={connectedVendorWallet} tenders={[publicTender]} onRefresh={() => undefined} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("TENDER 1 · JUST SUBMITTED")).toBeInTheDocument();
    expect(screen.getByText("CONFIRMED · FINALITY PENDING")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MY SUBMISSIONS · 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "0 finalized · 1 waiting finality" })).toBeInTheDocument();
  });

  it("keeps FXRP redemption behind the winning wallet and never asks for an XRPL secret", () => {
    render(<FlareRedemptionPanel wallet={wallet} tenders={[publicTender]} />);
    expect(screen.getByRole("heading", { name: "Redeem awarded FTestXRP." })).toBeInTheDocument();
    expect(screen.getByText(/Available after your wallet wins an awarded tender/)).toBeInTheDocument();
    expect(screen.getByText(/never asks for an XRPL secret/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /APPROVE & REQUEST XRP REDEMPTION/i })).toBeNull();
  });

  it("renders the structured public brief before wallet authorization", () => {
    render(<FlareBuyerWorkspace wallet={wallet} onRefresh={() => undefined} />);
    expect(screen.getByLabelText(/Public title/)).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Public objective")).toBeInTheDocument();
    expect(screen.getByLabelText("Acceptance criteria")).toBeInTheDocument();
    expect(screen.getByLabelText("Optional vendor questions")).toBeInTheDocument();
    expect(screen.getByText(/Brief and rules are public; bids are sealed/)).toBeInTheDocument();
    expect(screen.getByText("0/160")).toBeInTheDocument();
    expect(screen.getByText(/5 minutes–30 days/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect to submit this action." })).toBeInTheDocument();
  });

  it("restores and explicitly clears the public-only Buyer Brief session draft", () => {
    const first = render(<FlareBuyerWorkspace wallet={wallet} onRefresh={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Public title/), { target: { value: "Treasury reporting" } });
    fireEvent.change(screen.getByLabelText("Public objective"), { target: { value: "Deliver a monthly XRP treasury report." } });
    expect(screen.getByText("18/160")).toBeInTheDocument();
    first.unmount();

    render(<FlareBuyerWorkspace wallet={wallet} onRefresh={() => undefined} />);
    expect(screen.getByLabelText(/Public title/)).toHaveValue("Treasury reporting");
    expect(screen.getByText("PUBLIC DRAFT SAVED IN THIS TAB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CLEAR PUBLIC DRAFT" }));
    expect(screen.getByLabelText(/Public title/)).toHaveValue("");
    expect(screen.getByRole("button", { name: "CLEAR PUBLIC DRAFT" })).toBeDisabled();
  });

  it("defaults to Coston2 funding and lets the buyer switch to the XRP-native path", () => {
    render(<FlareBuyerWorkspace wallet={wallet} onRefresh={() => undefined} />);
    const coston2Option = screen.getByRole("button", { name: /COSTON2 \/ FTESTXRP/i });
    const xrplOption = screen.getByRole("button", { name: /XRPL \/ XRP/i });
    expect(coston2Option).toHaveAttribute("aria-pressed", "true");
    expect(xrplOption).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(xrplOption);
    expect(xrplOption).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Fund with XRP without sharing your wallet key." })).toBeInTheDocument();
  });

  it("keeps the XRP-native funding signature outside the browser", () => {
    render(<FlareBuyerWorkspace wallet={wallet} onRefresh={() => undefined} initialFundingMethod="xrpl" />);
    expect(screen.getByRole("heading", { name: "Fund with XRP without sharing your wallet key." })).toBeInTheDocument();
    expect(screen.getByText(/never asks for a seed/)).toBeInTheDocument();
    expect(screen.getByText(/dedicated executor remains responsible for FDC and minting/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VIEW TECHNICAL FUNDING GUIDE ↗" })).toHaveAttribute("href", "/docs#xrp-funding");
  });

  it("prepares only a public XRP funding handoff", async () => {
    const onPrepare = vi.fn(async () => ({
      personalAccount: "0x1000000000000000000000000000000000000001" as const,
      nonce: "4",
      walletId: 0,
      executorFeeUBA: "0",
      xrplTransactionId: null,
      paymentDestination: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
      paymentAmountUBA: "1100000",
      mintingFeeUBA: "100000",
      memoData: `0x${"fe".repeat(42)}` as `0x${string}`,
      paymentDraftJson: '{"TransactionType":"Payment"}',
      jobJson: null,
    }));
    render(<FlareXrpFundingPanel onPrepare={onPrepare} />);
    expect(screen.getByLabelText(/XRPL owner address/)).toBeInTheDocument();
    expect(screen.getByText(/never asks for a seed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "REVIEW XRP PAYMENT →" }));
    await waitFor(() => expect(onPrepare).toHaveBeenCalledTimes(1));
    expect(screen.getByText("AWAITING SIGNATURE")).toBeInTheDocument();
    expect(screen.getByText("PersonalAccount", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Approve the exact XRP payment in your wallet/)).toBeInTheDocument();
    expect(screen.getByText("Payment destination", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PAY XRP WITH GEMWALLET/i })).toBeInTheDocument();
  });

  it("checkpoints an externally entered payment before RPC preparation", () => {
    localStorage.clear();
    render(<FlareXrpFundingPanel onPrepare={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/XRPL owner address/), {
      target: { value: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p" },
    });
    fireEvent.change(screen.getByLabelText(/XRPL payment transaction ID/), {
      target: { value: "ab".repeat(32) },
    });
    expect(readPublicFlareFundingCheckpoint()).toEqual({
      schemaVersion: 1,
      xrplOwner: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
      xrplTransactionId: `0x${"ab".repeat(32)}`,
      walletId: "0",
      executorFeeUBA: "",
    });
    localStorage.clear();
  });

  it("offers an explicit public checkpoint resume after reload", async () => {
    localStorage.clear();
    savePublicFlareFundingCheckpoint({
      xrplOwner: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
      xrplTransactionId: `0x${"cd".repeat(32)}`,
      walletId: "3",
      executorFeeUBA: "",
    });
    const onPrepare = vi.fn(async (input) => ({
      personalAccount: "0x1000000000000000000000000000000000000001" as const,
      nonce: "5",
      walletId: Number(input.walletId),
      executorFeeUBA: "0",
      xrplTransactionId: input.xrplTransactionId as `0x${string}`,
      paymentDestination: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
      paymentAmountUBA: "1100000",
      mintingFeeUBA: "100000",
      memoData: `0x${"fe".repeat(42)}` as `0x${string}`,
      paymentDraftJson: '{"TransactionType":"Payment"}',
      jobJson: '{"kind":"public-safe"}',
    }));
    render(<FlareXrpFundingPanel onPrepare={onPrepare} />);
    expect(screen.getByRole("button", { name: "RESTORE PAYMENT HANDOFF →" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "RESTORE PAYMENT HANDOFF →" }));
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith({
      xrplOwner: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
      xrplTransactionId: `0x${"cd".repeat(32)}`,
      walletId: "3",
      executorFeeUBA: "",
    }));
    expect(screen.getByText("PAYMENT RECEIVED / HANDOFF READY")).toBeInTheDocument();
    expect(screen.getByText("Executor handoff ready — tender not opened yet.")).toBeInTheDocument();
    localStorage.clear();
  });
});
