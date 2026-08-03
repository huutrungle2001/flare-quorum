import {
  createPublicClient,
  fallback,
  http,
} from "viem";
import { sepolia } from "viem/chains";

export const defaultSepoliaRpcUrl = "https://11155111.rpc.thirdweb.com";

export const fallbackSepoliaRpcUrls = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.gateway.tenderly.co",
] as const;

export function resolveSepoliaRpcUrls(primaryRpcUrl?: string): string[] {
  const configured = primaryRpcUrl?.trim() || defaultSepoliaRpcUrl;
  return [...new Set([
    configured,
    defaultSepoliaRpcUrl,
    ...fallbackSepoliaRpcUrls,
  ])];
}

export function createResilientSepoliaClient(
  primaryRpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ??
    defaultSepoliaRpcUrl,
) {
  const transports = resolveSepoliaRpcUrls(primaryRpcUrl).map((url) =>
    http(url, {
      retryCount: 0,
      timeout: 4_000,
    }),
  );
  return createPublicClient({
    chain: sepolia,
    transport: fallback(transports, {
      retryCount: 1,
      retryDelay: 100,
    }),
  });
}
