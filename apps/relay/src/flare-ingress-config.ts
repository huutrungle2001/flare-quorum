import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { resolve } from "node:path";

export interface FlareIngressConfig {
  rpcUrl: string;
  marketAddress: Address;
  teeManagerAddress: Address;
  deploymentStatus: "verified";
  proxyUrls: readonly [string, string, string];
  directApiKeys: readonly [string, string, string];
  healthTenderId: bigint;
  webOrigin: string;
  host: string;
  port: number;
  publicBriefDirectory: string;
}

export class FlareIngressConfigError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "FlareIngressConfigError";
    this.code = code;
  }
}

function secureUrl(value: string, code: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlareIngressConfigError(code);
  }
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
  ) throw new FlareIngressConfigError(code);
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function tuple(value: string | undefined, code: string, secret = false): [string, string, string] {
  if (value === undefined) throw new FlareIngressConfigError(code);
  const items = value.split(",").map((item) => item.trim());
  if (
    items.length !== 3 || items.some((item) => item === "") ||
    (secret && items.some((item) => item.length < 16 || item.length > 256 || /[\x00-\x1f\x7f]/.test(item)))
  ) throw new FlareIngressConfigError(code);
  return items as [string, string, string];
}

function port(value: string | undefined): number {
  if (value === undefined || value === "") return 8788;
  if (!/^[0-9]+$/.test(value)) throw new FlareIngressConfigError("invalid-flare-ingress-port");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new FlareIngressConfigError("invalid-flare-ingress-port");
  }
  return parsed;
}

function healthTenderId(value: string | undefined): bigint {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value.trim())) {
    throw new FlareIngressConfigError("invalid-flare-ingress-health-tender-id");
  }
  const parsed = BigInt(value.trim());
  if (parsed <= 0n) throw new FlareIngressConfigError("invalid-flare-ingress-health-tender-id");
  return parsed;
}

export function loadFlareIngressConfig(env: NodeJS.ProcessEnv): FlareIngressConfig {
  const rawRpcUrl = env.COSTON2_RPC_URL?.trim();
  if (!rawRpcUrl) throw new FlareIngressConfigError("missing-coston2-rpc-url");
  const rpcUrl = secureUrl(rawRpcUrl, "invalid-coston2-rpc-url");
  const market = env.FLARE_MARKET_ADDRESS?.trim() || env.VITE_FLARE_MARKET_ADDRESS?.trim();
  if (!market) throw new FlareIngressConfigError("missing-flare-market-address");
  if (!isAddress(market) || market.toLowerCase() === zeroAddress) {
    throw new FlareIngressConfigError("invalid-flare-market-address");
  }
  const teeManager = env.FLARE_TEE_MANAGER?.trim();
  if (!teeManager) throw new FlareIngressConfigError("missing-flare-tee-manager-address");
  if (!isAddress(teeManager) || teeManager.toLowerCase() === zeroAddress) {
    throw new FlareIngressConfigError("invalid-flare-tee-manager-address");
  }
  const deploymentStatus = env.FLARE_DEPLOYMENT_STATUS?.trim() || env.VITE_FLARE_DEPLOYMENT_STATUS?.trim();
  if (deploymentStatus !== "verified") throw new FlareIngressConfigError("unverified-flare-ingress-disabled");
  const proxyUrls = tuple(env.FLARE_FCC_PROXY_URLS, "invalid-flare-ingress-proxy-set")
    .map((value) => secureUrl(value, "invalid-flare-ingress-proxy-url")) as [string, string, string];
  if (new Set(proxyUrls).size !== 3) throw new FlareIngressConfigError("invalid-flare-ingress-proxy-set");
  const directApiKeys = tuple(env.FLARE_FCC_DIRECT_API_KEYS, "invalid-flare-ingress-api-key-set", true);
  const configuredHealthTenderId = env.FLARE_INGRESS_HEALTH_TENDER_ID?.trim();
  if (!configuredHealthTenderId) throw new FlareIngressConfigError("missing-flare-ingress-health-tender-id");
  const webOrigin = secureUrl(env.FLARE_INGRESS_WEB_ORIGIN?.trim() ?? "", "invalid-flare-ingress-web-origin");
  if (new URL(webOrigin).pathname !== "/") throw new FlareIngressConfigError("invalid-flare-ingress-web-origin");
  const host = env.FLARE_INGRESS_HOST?.trim() || "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "0.0.0.0" && host !== "::1" && host !== "::") {
    throw new FlareIngressConfigError("invalid-flare-ingress-host");
  }
  return {
    rpcUrl,
    marketAddress: getAddress(market),
    teeManagerAddress: getAddress(teeManager),
    deploymentStatus,
    proxyUrls,
    directApiKeys,
    healthTenderId: healthTenderId(configuredHealthTenderId),
    webOrigin,
    host,
    port: port(env.FLARE_INGRESS_PORT ?? env.PORT),
    publicBriefDirectory: resolve(env.FLARE_PUBLIC_BRIEF_DIR?.trim() || ".local/flare-public-briefs"),
  };
}
