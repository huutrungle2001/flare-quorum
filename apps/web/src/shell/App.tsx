import { lazy, Suspense } from "react";
import { useLocation } from "react-router";
import { FlareDocsPage } from "../flare/FlareDocsPage";
import { FlareRoom } from "../flare/FlareRoom";
import { DocsPage } from "../landing/DocsPage";
import { LandingPage } from "../landing/LandingPage";
import { isFlareReleaseEnabled } from "../public-market/loadFlareMarket";
import { useWallet } from "../wallet/useWallet";
import { PrimaryNavigation } from "./PrimaryNavigation";

const LegacyTenderRoom = lazy(async () => {
  const module = await import("./LegacyTenderRoom");
  return { default: module.LegacyTenderRoom };
});

function LoadingWorkspace() {
  return (
    <main id="main-content">
      <section className="state-panel" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        <div>
          <h1>Loading tender workspace</h1>
          <p>Preparing the requested public interface without placeholder chain data.</p>
        </div>
      </section>
    </main>
  );
}

export function App() {
  const location = useLocation();
  const wallet = useWallet();
  const flareWallet = useWallet("coston2");
  const flareReleaseEnabled = isFlareReleaseEnabled();
  const legacyRoomLink =
    new URLSearchParams(location.search).has("role") ||
    new URLSearchParams(location.search).has("tender");
  const page =
    location.pathname === "/docs" ? (
      flareReleaseEnabled ? <FlareDocsPage /> : <DocsPage />
    ) : location.pathname === "/flare" ? (
      <FlareRoom wallet={flareWallet} />
    ) : location.pathname === "/" && flareReleaseEnabled ? (
      <FlareRoom wallet={flareWallet} />
    ) : location.pathname === "/room" || legacyRoomLink ? (
      <Suspense fallback={<LoadingWorkspace />}>
        <LegacyTenderRoom wallet={wallet} />
      </Suspense>
    ) : (
      <LandingPage />
    );
  return (
    <>
      <PrimaryNavigation wallet={wallet} />
      {page}
    </>
  );
}
