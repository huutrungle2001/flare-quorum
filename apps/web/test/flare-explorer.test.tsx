import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { FlareExplorerView } from "../src/flare/FlareRoom";
import { PrimaryNavigation } from "../src/shell/PrimaryNavigation";
import type { WalletController } from "../src/wallet/WalletPanel";

afterEach(cleanup);

const wallet = {
  state: { status: "disconnected", providers: [], selectedProvider: null, account: null, chainId: null, walletClient: null, error: null, sessionRevision: 0 },
} as unknown as WalletController;

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
});
