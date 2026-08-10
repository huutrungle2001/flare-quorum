import { flareQuorumFlareMarketAbi } from "@flarequorum/flare-bindings";
import { createPublicClient, http, type Abi, type PublicClient } from "viem";
import type { FlareRelayConfig } from "./flare-config.js";

const marketAbi = flareQuorumFlareMarketAbi as Abi;
const coston2Chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

export interface FlareRelayHealth {
  status: "ok" | "degraded" | "unavailable";
  chainId: number | null;
  latestBlock: string | null;
  marketCodePresent: boolean;
  deploymentStatus: "planned" | "verified";
}

export class FlareLiveRelay {
  readonly config: FlareRelayConfig;
  readonly publicClient: PublicClient;

  constructor(config: FlareRelayConfig) {
    this.config = config;
    this.publicClient = createPublicClient({
      chain: coston2Chain,
      transport: http(config.rpcUrl, { retryCount: 1, timeout: 8_000 }),
    });
  }

  async health(): Promise<FlareRelayHealth> {
    try {
      const [chainId, block, code] = await Promise.all([
        this.publicClient.getChainId(),
        this.publicClient.getBlock({ blockTag: "latest" }),
        this.publicClient.getCode({ address: this.config.marketAddress }),
      ]);
      const marketCodePresent = code !== undefined && code !== "0x";
      const available = chainId === 114 && marketCodePresent;
      return {
        status: !available ? "unavailable" : this.config.deploymentStatus === "verified" ? "ok" : "degraded",
        chainId,
        latestBlock: block.number.toString(),
        marketCodePresent,
        deploymentStatus: this.config.deploymentStatus,
      };
    } catch {
      return {
        status: "unavailable",
        chainId: null,
        latestBlock: null,
        marketCodePresent: false,
        deploymentStatus: this.config.deploymentStatus,
      };
    }
  }

  async tenderCount(): Promise<bigint> {
    const count = await this.publicClient.readContract({
      address: this.config.marketAddress,
      abi: marketAbi,
      functionName: "tenderCount",
    });
    if (typeof count !== "bigint") throw new Error("malformed-flare-tender-count");
    return count;
  }
}
