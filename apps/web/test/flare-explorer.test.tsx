import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlareEvidenceWorkspace, FlareExplorerView, FlareRoleBar } from "../src/flare/FlareRoom";
import { FlareBuyerWorkspace } from "../src/flare/FlareBuyerWorkspace";
import { FlareAuditorWorkspace } from "../src/flare/FlareAuditorWorkspace";
import { FlareFinalizerWorkspace } from "../src/flare/FlareFinalizerWorkspace";
import { FlareVendorWorkspace } from "../src/flare/FlareVendorWorkspace";
import { FlareLandingPage } from "../src/flare/FlareLandingPage";
import { FlareRedemptionPanel } from "../src/flare/FlareRedemptionPanel";
import { FlareXrpFundingPanel } from "../src/flare/FlareXrpFundingPanel";
import { readPublicFlareFundingCheckpoint, savePublicFlareFundingCheckpoint } from "../src/flare/fundingCheckpoint";
import { PrimaryNavigation } from "../src/shell/PrimaryNavigation";
import type { WalletController } from "../src/wallet/WalletPanel";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

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

  it("offers an optional Coston2 wallet without gating the read-only Flare route", () => {
    render(<MemoryRouter initialEntries={["/flare"]}><PrimaryNavigation wallet={wallet} /></MemoryRouter>);
    expect(screen.getByText("COSTON2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONNECT FOR ACTIONS" })).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "EXPLORE TENDERS →" })).toHaveAttribute("href", "/flare");
    expect(screen.getByText(/FIVE WORKSPACES \/ ONE APP SHELL/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Private bids produce a threshold-signed award/i })).toBeInTheDocument();
  });

  it("exposes the complete Flare role taxonomy without private-audit authority", () => {
    render(<FlareRoleBar activeRole="public" onRoleChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "PUBLIC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BUYER" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PRIVATE BIDS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ACTIVITY" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "XRP TREASURY" })).toBeNull();
    expect(screen.getByRole("button", { name: "AUDITOR" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "CLOSE & FREEZE FTSO →" })).toBeDisabled();
    expect(screen.getByText(/no bid-decryption capability/i)).toBeInTheDocument();
    expect(screen.queryByText(/client-provided winner accepted/i)).toBeNull();
  });

  it("asks the vendor to connect only when an open tender has a bid action", () => {
    const first = render(<FlareVendorWorkspace wallet={wallet} tenders={[{ ...publicTender, status: "Cancelled" }]} onRefresh={() => undefined} />);
    expect(screen.getByRole("heading", { name: "No open Coston2 tenders" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect to submit this action." })).toBeNull();
    first.unmount();

    render(<FlareVendorWorkspace wallet={wallet} tenders={[publicTender]} onRefresh={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Connect to submit this action." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ENCRYPT & SUBMIT BID →" })).toBeDisabled();
    expect(screen.queryByText(/&amp;/)).toBeNull();
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
    expect(screen.getByRole("heading", { name: "Keep the XRPL signature outside FlareQuorum" })).toBeInTheDocument();
  });

  it("keeps the XRP-native funding signature outside the browser", () => {
    render(<FlareBuyerWorkspace wallet={wallet} onRefresh={() => undefined} initialFundingMethod="xrpl" />);
    expect(screen.getByRole("heading", { name: "Keep the XRPL signature outside FlareQuorum" })).toBeInTheDocument();
    expect(screen.getByText(/never asks for a seed/)).toBeInTheDocument();
    expect(screen.getByText(/DirectMintingDelayed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "READ FUNDING RUNBOOK ↗" })).toHaveAttribute("href", "/docs#flare-coston2");
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
    fireEvent.click(screen.getByRole("button", { name: "PREPARE PUBLIC 0xFE JOB →" }));
    await waitFor(() => expect(onPrepare).toHaveBeenCalledTimes(1));
    expect(screen.getByText("PUBLIC-SAFE HANDOFF READY")).toBeInTheDocument();
    expect(screen.getByText("PersonalAccount", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("WALLET-READY XRPL PAYMENT DRAFT")).toBeInTheDocument();
    expect(screen.getByText("Payment destination", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SIGN & SUBMIT WITH GEMWALLET/i })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "RESUME PUBLIC CHECKPOINT →" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "RESUME PUBLIC CHECKPOINT →" }));
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith({
      xrplOwner: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
      xrplTransactionId: `0x${"cd".repeat(32)}`,
      walletId: "3",
      executorFeeUBA: "",
    }));
    expect(screen.getByText("PUBLIC-SAFE HANDOFF READY")).toBeInTheDocument();
    localStorage.clear();
  });
});
