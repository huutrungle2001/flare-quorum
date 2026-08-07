import {
  loadCoston2PublicMarket,
  type Coston2MarketConfig,
  type Coston2PublicMarket,
  type Coston2PublicTender,
} from "@veilbid/flare-bindings";
import { getAddress, isAddress } from "viem";

export type FlareMarketConfig = Coston2MarketConfig;
export type FlarePublicTender = Coston2PublicTender;
export type LoadedFlarePublicMarket = Coston2PublicMarket;

export function isFlareReleaseEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  return env.VITE_FLARE_DEPLOYMENT_STATUS === "verified"
    && Boolean(
      env.VITE_COSTON2_RPC_URL?.trim()
      && env.VITE_FLARE_MARKET_ADDRESS?.trim()
      && env.VITE_FLARE_MARKET_DEPLOYMENT_BLOCK?.trim(),
    );
}

export function resolveFlareMarketConfig(
  env: Record<string, string | undefined> = import.meta.env,
): FlareMarketConfig {
  const rpcUrl = env.VITE_COSTON2_RPC_URL?.trim();
  const marketAddress = env.VITE_FLARE_MARKET_ADDRESS?.trim();
  const deploymentBlock = env.VITE_FLARE_MARKET_DEPLOYMENT_BLOCK?.trim();
  const deploymentStatus = env.VITE_FLARE_DEPLOYMENT_STATUS?.trim() || "planned";
  if (!rpcUrl || !marketAddress || !deploymentBlock) {
    throw new Error("FLARE_MARKET_NOT_CONFIGURED");
  }
  if (!isAddress(marketAddress)) throw new Error("FLARE_MARKET_ADDRESS_INVALID");
  if (!/^[0-9]+$/.test(deploymentBlock)) throw new Error("FLARE_DEPLOYMENT_BLOCK_INVALID");
  if (deploymentStatus !== "planned" && deploymentStatus !== "verified") {
    throw new Error("FLARE_DEPLOYMENT_STATUS_INVALID");
  }
  return {
    rpcUrl,
    marketAddress: getAddress(marketAddress),
    deploymentBlock: BigInt(deploymentBlock),
    deploymentStatus,
  };
}

export async function loadFlarePublicMarket(
  config = resolveFlareMarketConfig(),
): Promise<LoadedFlarePublicMarket> {
  return loadCoston2PublicMarket(config);
}
