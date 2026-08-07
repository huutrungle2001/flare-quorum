import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { FlareEvidenceWorkspace, FlareExplorerView } from "../src/flare/FlareRoom";
import { FlareBuyerWorkspace } from "../src/flare/FlareBuyerWorkspace";
import { FlareRedemptionPanel } from "../src/flare/FlareRedemptionPanel";
import { PrimaryNavigation } from "../src/shell/PrimaryNavigation";
import type { WalletController } from "../src/wallet/WalletPanel";

afterEach(cleanup);

const wallet = {
  state: { status: "disconnected", providers: [], selectedProvider: null, account: null, chainId: null, walletClient: null, error: null, sessionRevision: 0 },
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
    expect(screen.getByText("PLANNED / NOT YET VERIFIED")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No Coston2 tenders yet" })).toBeInTheDocument();
  });

  it("does not offer the Sepolia wallet on the read-only Flare route", () => {
    render(<MemoryRouter initialEntries={["/flare"]}><PrimaryNavigation wallet={wallet} /></MemoryRouter>);
    expect(screen.getByText("COSTON2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CONNECT WALLET" })).toBeNull();
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

  it("keeps FXRP redemption behind the winning wallet and never asks for an XRPL secret", () => {
    render(<FlareRedemptionPanel wallet={wallet} tenders={[publicTender]} />);
    expect(screen.getByRole("heading", { name: "Request XRP redemption" })).toBeInTheDocument();
    expect(screen.getByText(/Connect the winning Coston2 wallet/)).toBeInTheDocument();
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
  });

  it("keeps the XRP-native funding signature outside the browser", () => {
    render(<FlareBuyerWorkspace wallet={wallet} onRefresh={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Keep the XRPL signature outside VeilBid" })).toBeInTheDocument();
    expect(screen.getByText(/does not ask for an XRPL seed/)).toBeInTheDocument();
    expect(screen.getByText(/DirectMintingDelayed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Coston2 funding runbook/ })).toHaveAttribute("href", "/docs#flare-coston2");
  });
});
