import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EIP1193Provider } from "viem";
import { App } from "../src/shell/App";
import { PrimaryNavigation } from "../src/shell/PrimaryNavigation";
import type { WalletController } from "../src/wallet/WalletPanel";

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
  connect: async () => undefined,
  switchToSepolia: async () => undefined,
  disconnect: () => undefined,
} as unknown as WalletController;

function announceWallet(uuid: string, name: string) {
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: {
        info: {
          uuid,
          name,
          icon: "",
          rdns: `${uuid}.wallet`,
        },
        provider: {
          request: async () => [],
        } as unknown as EIP1193Provider,
      },
    }),
  );
}

afterEach(cleanup);

describe("standalone public routes", () => {
  it("renders the landing page without entering the chain runtime", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll(".landing-mascot-svg")).toHaveLength(3);
    expect(
      screen.getByRole("heading", { name: /Lowest valid bid/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /explore tenders/i }),
    ).toHaveAttribute("href", "/room");
    expect(
      screen.getByRole("link", { name: /open eoa buyer/i }),
    ).toHaveAttribute("href", "/room?role=buyer");
    expect(
      screen.getByRole("link", { name: /open safe buyer/i }),
    ).toHaveAttribute("href", "/room?role=buyer&buyer=safe");
    expect(
      screen.getByRole("link", { name: /open private bids/i }),
    ).toHaveAttribute("href", "/room?role=private-bids");
    expect(
      screen.getByRole("link", { name: /skip to content/i }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.queryByText(/Reading confirmed Sepolia logs/i)).toBeNull();
    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["TENDERS", "DOCS"]);
    expect(screen.getByRole("button", { name: "CONNECT WALLET" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "VeilBid home" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("renders protocol docs with explicit non-claims", () => {
    render(
      <MemoryRouter initialEntries={["/docs"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", {
        name: /Use VeilBid from tender to settlement/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not verify delivered service quality/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /inspect public state/i }),
    ).toHaveAttribute("href", "/room");
    expect(screen.getByRole("link", { name: "DOCS" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "TENDERS" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("uses the current Flare documentation when the verified release is enabled", () => {
    vi.stubEnv("VITE_FLARE_DEPLOYMENT_STATUS", "verified");
    vi.stubEnv("VITE_COSTON2_RPC_URL", "https://coston2.example/rpc");
    vi.stubEnv("VITE_FLARE_MARKET_ADDRESS", "0xFaEDc6793E72AFF05d29e6f0550d0FF8b90c4c05");
    vi.stubEnv("VITE_FLARE_MARKET_DEPLOYMENT_BLOCK", "33746695");
    try {
      render(
        <MemoryRouter initialEntries={["/docs#flare-coston2"]}>
          <App />
        </MemoryRouter>,
      );
      expect(screen.getByRole("heading", { name: /Public evidence/i })).toBeInTheDocument();
      expect(screen.getByText(/Five primitives, one product path/i)).toBeInTheDocument();
      expect(screen.queryByText(/Use VeilBid from tender to settlement/i)).toBeNull();
      expect(screen.getByText(/same-identity restore is not claimed/i)).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps Docs active for every documentation section", () => {
    render(
      <MemoryRouter initialEntries={["/docs#evidence"]}>
        <App />
      </MemoryRouter>,
    );
    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["TENDERS", "DOCS"]);
    expect(
      within(navigation).getByRole("link", { name: "DOCS" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).queryByRole("link", { name: "EVIDENCE" }),
    ).toBeNull();
  });

  it("preserves one header instance while navigating between public pages", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    const header = container.querySelector(".topbar");
    expect(header).not.toBeNull();

    fireEvent.click(
      within(header as HTMLElement).getByRole("link", { name: "DOCS" }),
    );
    expect(container.querySelector(".topbar")).toBe(header);
    expect(
      within(header as HTMLElement).getByRole("link", { name: "DOCS" }),
    ).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(header as HTMLElement).getByRole("link", {
      name: "VeilBid home",
    }));
    expect(container.querySelector(".topbar")).toBe(header);
    expect(
      within(header as HTMLElement).getByRole("link", { name: "VeilBid home" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("scrolls public page navigation to the top", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(screen.getByRole("link", { name: "DOCS" }));

    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({
        behavior: "auto",
        left: 0,
        top: 0,
      }),
    );
  });

  it("marks Tenders active on the canonical tender route", () => {
    render(
      <MemoryRouter initialEntries={["/room"]}>
        <PrimaryNavigation wallet={disconnectedWallet} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "TENDERS" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("lists every detected EIP-6963 wallet in the header selector", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    act(() => {
      announceWallet("alpha", "Alpha Wallet");
      announceWallet("beta", "Beta Wallet");
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "CONNECT WALLET" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "CONNECT WALLET" }));
    expect(screen.getByRole("button", { name: /Alpha Wallet/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Beta Wallet/ })).toBeVisible();
  });
});
