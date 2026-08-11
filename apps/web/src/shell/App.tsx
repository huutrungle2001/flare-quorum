import { useEffect } from "react";
import { Navigate, useLocation } from "react-router";
import { FlareDocsPage } from "../flare/FlareDocsPage";
import { FlareLandingPage } from "../flare/FlareLandingPage";
import { FlareRoom } from "../flare/FlareRoom";
import { useWallet } from "../wallet/useWallet";
import { PrimaryNavigation } from "./PrimaryNavigation";

export function App() {
  const location = useLocation();
  const wallet = useWallet("coston2");
  const legacyRoomLink =
    new URLSearchParams(location.search).has("role") ||
    new URLSearchParams(location.search).has("tender");
  const page =
    location.pathname === "/docs" ? (
      <FlareDocsPage />
    ) : location.pathname === "/room" || (location.pathname === "/" && legacyRoomLink) ? (
      <Navigate to={`/flare${location.search}${location.hash}`} replace />
    ) : location.pathname === "/flare" ? (
      <FlareRoom wallet={wallet} />
    ) : location.pathname === "/" ? (
      <FlareLandingPage />
    ) : (
      <Navigate to="/" replace />
    );

  useEffect(() => {
    document.title = "FlareQuorum · Confidential procurement on Flare";
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute(
      "content",
      "FlareQuorum — confidential procurement with threshold FCC on Flare Coston2.",
    );
  }, []);

  return (
    <div className="flare-quorum-app">
      <PrimaryNavigation wallet={wallet} />
      {page}
    </div>
  );
}
