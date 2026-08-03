import { useCallback, useEffect, useState } from "react";
import { loadFlarePublicMarket, type LoadedFlarePublicMarket } from "./loadFlareMarket";

export interface FlareMarketState {
  status: "loading" | "ready" | "error";
  data: LoadedFlarePublicMarket | null;
  error: string | null;
}

export function useFlareMarket() {
  const [state, setState] = useState<FlareMarketState>({ status: "loading", data: null, error: null });
  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, status: "loading", error: null }));
    try {
      setState({ status: "ready", data: await loadFlarePublicMarket(), error: null });
    } catch {
      setState({
        status: "error",
        data: null,
        error: "Coston2 market state is unavailable or not configured. No Sepolia or mock fallback is shown.",
      });
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { state, refresh };
}
