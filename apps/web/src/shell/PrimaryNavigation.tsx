import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import type { WalletController } from "../wallet/WalletPanel";
import type { WalletNetwork } from "../wallet/useWallet";
import { scrollToPageTop } from "./navigationScroll";
import { isFlareReleaseEnabled } from "../public-market/loadFlareMarket";

type NavigationItem = {
  label: string;
  to: string;
  active: boolean;
};

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function HeaderWalletMenu({
  wallet,
  network = "sepolia",
}: {
  wallet: WalletController;
  network?: WalletNetwork;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const { state } = wallet;
  const connected =
    state.status === "connected" && state.account ? state.account : null;
  const wrongChain = state.status === "wrong-chain";
  const coston2 = network === "coston2";
  const networkLabel = coston2 ? "Flare Coston2" : "Ethereum Sepolia";
  const buttonLabel = connected
    ? shortAddress(connected)
    : wrongChain
      ? "WRONG NETWORK"
      : state.status === "connecting"
        ? "CONNECTING WALLET…"
        : "CONNECT WALLET";

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        container.current?.querySelector<HTMLButtonElement>(".wallet-trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="header-wallet" ref={container}>
      <button
        className={`wallet-trigger${connected ? " connected" : ""}${wrongChain ? " warning" : ""}`}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        disabled={state.status === "connecting"}
      >
        <span aria-hidden="true">{connected ? "✓" : "◇"}</span>
        {buttonLabel}
      </button>
      {open && (
        <section className="wallet-menu" aria-label="Wallet connection">
          <header>
            <p className="eyebrow">
              {connected ? "CONNECTED WALLET" : "CHOOSE A WALLET"}
            </p>
            <button
              className="wallet-menu-close"
              type="button"
              aria-label="Close wallet menu"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
          {connected ? (
            <>
              <strong>{state.selectedProvider?.info.name ?? "Browser wallet"}</strong>
              <span className="wallet-account" title={connected}>
                {connected}
              </span>
              <p>Connected to {networkLabel}. Signing remains inside your wallet.</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  wallet.disconnect();
                  setOpen(false);
                }}
              >
                DISCONNECT
              </button>
            </>
          ) : wrongChain ? (
            <>
              <strong>{coston2 ? "Coston2" : "Sepolia"} confirmation needed</strong>
              <p>
                The wallet connected, but the automatic network switch did not
                complete. Confirm the next wallet request to enable signing.
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => void (coston2 ? wallet.switchToCoston2() : wallet.switchToSepolia())}
              >
                RETRY {coston2 ? "COSTON2" : "SEPOLIA"} CONNECTION →
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={wallet.disconnect}
              >
                CHOOSE ANOTHER WALLET
              </button>
            </>
          ) : (
            <>
              <p>
                Choose an EIP-6963 provider once. VeilBid connects it and asks
                for the {networkLabel} switch automatically when needed. Private keys
                never leave your wallet.
              </p>
              <div className="header-provider-list">
                {state.providers.length === 0 ? (
                  <p className="wallet-empty">
                    No compatible browser wallet detected. Install or unlock a
                    wallet, then reload this page.
                  </p>
                ) : (
                  state.providers.map((provider) => (
                    <button
                      className="provider-button"
                      key={provider.info.uuid}
                      type="button"
                      onClick={() => void wallet.connect(provider)}
                    >
                      <span>{provider.info.name}</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  ))
                )}
              </div>
              {state.error && (
                <p className="inline-error" role="alert">{state.error}</p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

export function PrimaryNavigation({
  wallet,
  flareWallet,
}: {
  wallet: WalletController;
  flareWallet?: WalletController;
}) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const legacyTenderRoute =
    searchParams.has("role") || searchParams.has("tender");
  const isHome = location.pathname === "/" && !legacyTenderRoute;
  const flareReleaseEnabled = isFlareReleaseEnabled();
  const tenderPath = flareReleaseEnabled ? "/flare" : "/room";
  const isTenders =
    location.pathname === tenderPath || (!flareReleaseEnabled && legacyTenderRoute);
  const isDocs = location.pathname === "/docs";
  const isFlare = location.pathname === "/flare" || (flareReleaseEnabled && location.pathname === "/");
  const items: NavigationItem[] = [
    { label: "TENDERS", to: tenderPath, active: isTenders },
    ...(!flareReleaseEnabled && import.meta.env.VITE_FLARE_MARKET_ADDRESS
      ? [{ label: "FLARE", to: "/flare", active: isFlare }]
      : []),
    { label: "DOCS", to: "/docs", active: isDocs },
  ];

  useEffect(() => {
    if (!location.hash) {
      scrollToPageTop();
      return;
    }
    const frames = new Set<number>();
    let cancelled = false;
    const scrollToTarget = () => {
      if (cancelled) return;
      const frame = window.requestAnimationFrame(() => {
        frames.delete(frame);
        document
          .getElementById(decodeURIComponent(location.hash.slice(1)))
          ?.scrollIntoView?.({ block: "start" });
      });
      frames.add(frame);
    };
    scrollToTarget();
    const timer = window.setTimeout(scrollToTarget, 300);
    const fontsReady = document.fonts?.ready;
    if (fontsReady) void fontsReady.then(scrollToTarget);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      for (const frame of frames) window.cancelAnimationFrame(frame);
    };
  }, [location.hash, location.pathname]);

  return (
    <header className="topbar">
      <a className="skip-link" href="#main-content">
        SKIP TO CONTENT
      </a>
      <Link
        className={`wordmark${isHome ? " active" : ""}`}
        to="/"
        aria-label="VeilBid home"
        aria-current={isHome ? "page" : undefined}
        onClick={scrollToPageTop}
      >
        VEILBID
      </Link>
      <nav aria-label="Primary navigation">
        {items.map((item) => (
          <Link
            key={item.label}
            className={`primary-nav-link${item.active ? " active" : ""}`}
            to={item.to}
            aria-current={item.active ? "page" : undefined}
            onClick={scrollToPageTop}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="topbar-actions">
        <div className="network-pill" aria-label={`Network: ${isFlare ? "Flare Coston2" : "Ethereum Sepolia"}`}>
          <span aria-hidden="true" />
          <span className="network-label">{isFlare ? "COSTON2" : "SEPOLIA"}</span>
        </div>
        <HeaderWalletMenu wallet={isFlare && flareWallet ? flareWallet : wallet} network={isFlare ? "coston2" : "sepolia"} />
      </div>
    </header>
  );
}
