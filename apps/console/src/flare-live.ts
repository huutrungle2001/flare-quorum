import {
  loadCoston2ProtocolBinding,
  loadCoston2PublicMarket,
  type Coston2MarketConfig,
  type Coston2PublicReader,
} from "@flarequorum/flare-bindings";
import { getAddress, isAddress } from "viem";
import type { FlarePublicOperatorSource } from "./flare-types.js";

function publicRpcUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid-coston2-rpc-url");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.hash) {
    throw new Error("invalid-coston2-rpc-url");
  }
  return url.toString();
}

export function resolveFlareOperatorConfig(
  env: Record<string, string | undefined> = process.env,
): Coston2MarketConfig {
  const rpcUrl = env.COSTON2_RPC_URL?.trim();
  const marketAddress = env.FLARE_MARKET_ADDRESS?.trim();
  const deploymentBlock = env.FLARE_MARKET_DEPLOYMENT_BLOCK?.trim();
  const deploymentStatus = env.FLARE_DEPLOYMENT_STATUS?.trim();
  if (!rpcUrl || !marketAddress || !deploymentBlock || !deploymentStatus) {
    throw new Error("missing-flare-operator-config");
  }
  if (!isAddress(marketAddress)) throw new Error("invalid-flare-market-address");
  if (!/^[1-9][0-9]*$/.test(deploymentBlock)) throw new Error("invalid-flare-deployment-block");
  if (deploymentStatus !== "planned" && deploymentStatus !== "verified") {
    throw new Error("invalid-flare-deployment-status");
  }
  return {
    rpcUrl: publicRpcUrl(rpcUrl),
    marketAddress: getAddress(marketAddress),
    deploymentBlock: BigInt(deploymentBlock),
    deploymentStatus,
  };
}

export class FlareLivePublicOperatorSource implements FlarePublicOperatorSource {
  readonly #config: Coston2MarketConfig;
  readonly #reader: Coston2PublicReader | undefined;

  constructor(config: Coston2MarketConfig, reader?: Coston2PublicReader) {
    this.#config = config;
    this.#reader = reader;
  }

  snapshot() {
    return loadCoston2PublicMarket(this.#config, this.#reader);
  }

  protocolBinding() {
    return loadCoston2ProtocolBinding(this.#config, this.#reader);
  }
}
