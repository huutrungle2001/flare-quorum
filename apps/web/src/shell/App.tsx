import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router";
import { FlareDocsPage } from "../flare/FlareDocsPage";
import { FlareLandingPage } from "../flare/FlareLandingPage";
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
  const isFlareExperience = location.pathname === "/flare" || (
    flareReleaseEnabled && (
      location.pathname === "/" ||
      location.pathname === "/docs"
    )
  );
  const legacyRoomLink =
    new URLSearchParams(location.search).has("role") ||
    new URLSearchParams(location.search).has("tender");
  const page =
    location.pathname === "/docs" ? (
      flareReleaseEnabled ? <FlareDocsPage /> : <DocsPage />
    ) : location.pathname === "/flare" || (location.pathname === "/" && flareReleaseEnabled && legacyRoomLink) ? (
      <FlareRoom wallet={flareWallet} />
    ) : location.pathname === "/" && flareReleaseEnabled ? (
      <FlareLandingPage />
    ) : location.pathname === "/room" || legacyRoomLink ? (
      <Suspense fallback={<LoadingWorkspace />}>
        <LegacyTenderRoom wallet={wallet} />
      </Suspense>
    ) : (
      <LandingPage />
    );

  useEffect(() => {
    const description = isFlareExperience
      ? "FlareQuorum — confidential procurement with threshold FCC on Flare Coston2."
      : "VeilBid — the historical confidential procurement baseline on Ethereum Sepolia.";
    document.title = isFlareExperience
      ? "FlareQuorum · Confidential procurement on Flare"
      : "VeilBid · Historical confidential procurement baseline";
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", description);
  }, [isFlareExperience]);

  return (
    <div className={isFlareExperience ? "flare-quorum-app" : "veilbid-legacy-app"}>
      <PrimaryNavigation wallet={wallet} flareWallet={flareWallet} />
      {page}
    </div>
  );
}
