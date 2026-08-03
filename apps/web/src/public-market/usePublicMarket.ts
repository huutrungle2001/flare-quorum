import { useCallback, useEffect, useState } from "react";
import {
  loadPublicMarket,
  type LoadedPublicMarket,
} from "./loadPublicMarket";

export type LoadStatus = "loading" | "ready" | "error";

export interface PublicMarketState {
  status: LoadStatus;
  data: LoadedPublicMarket | null;
  error: string | null;
  refreshedAt: Date | null;
}

export function usePublicMarket() {
  const [state, setState] = useState<PublicMarketState>({
    status: "loading",
    data: null,
    error: null,
    refreshedAt: null,
  });

  const refresh = useCallback(async () => {
    setState((current) => ({
      ...current,
      status: "loading",
      error: null,
    }));
    try {
      const data = await loadPublicMarket();
      setState({
        status: "ready",
        data,
        error: null,
        refreshedAt: new Date(),
      });
    } catch {
      setState({
        status: "error",
        data: null,
        error:
          "Sepolia public state is unavailable. No fallback data is shown.",
        refreshedAt: null,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}
