import { useCallback, useEffect, useRef, useState } from "react";
import { loadFlarePublicMarket, type LoadedFlarePublicMarket } from "./loadFlareMarket";

export interface FlareMarketState {
  status: "loading" | "ready" | "error";
  data: LoadedFlarePublicMarket | null;
  error: string | null;
}

export function useFlareMarket() {
  const [state, setState] = useState<FlareMarketState>({ status: "loading", data: null, error: null });
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setState((current) => current.data
      ? { ...current, error: null }
      : { status: "loading", data: null, error: null });
    try {
      setState({ status: "ready", data: await loadFlarePublicMarket(), error: null });
    } catch {
      setState((current) => current.data ? current : ({
          status: "error",
          data: null,
          error: "Coston2 market state is unavailable or not configured. No Sepolia or mock fallback is shown.",
        }));
    } finally {
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { state, refresh };
}
