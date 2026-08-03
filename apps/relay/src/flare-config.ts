import { getAddress, isAddress, type Address, type Hex } from "viem";

export type FlareRelayMode = "health" | "dry-run" | "once" | "poll";

export interface FlareRelayConfig {
  mode: FlareRelayMode;
  rpcUrl: string;
  marketAddress: Address;
  deploymentBlock: bigint;
  deploymentStatus: "planned" | "verified";
  signerPrivateKey: Hex | null;
  fccProxyUrls: readonly string[];
  fccExtensionVersion: string | null;
  fccInstructionFeeWei: bigint | null;
  actionBudget: number;
}

function proxyUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlareRelayConfigError("invalid-fcc-proxy-url");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new FlareRelayConfigError("invalid-fcc-proxy-url");
  }
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new FlareRelayConfigError("insecure-fcc-proxy-url");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function loadProxyUrls(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === "") return [];
  const urls = value.split(",").map((item) => proxyUrl(item.trim()));
  if (urls.length !== 3 || new Set(urls).size !== urls.length) {
    throw new FlareRelayConfigError("invalid-fcc-proxy-set");
  }
  return urls;
}

function positiveBigint(value: string | undefined, code: string): bigint | null {
  if (value === undefined || value.trim() === "") return null;
  if (!/^[0-9]+$/.test(value)) throw new FlareRelayConfigError(code);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new FlareRelayConfigError(code);
  return parsed;
}

function actionBudget(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 1;
  if (!/^[0-9]+$/.test(value)) throw new FlareRelayConfigError("invalid-flare-action-budget");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new FlareRelayConfigError("invalid-flare-action-budget");
  }
  return parsed;
}

export class FlareRelayConfigError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "FlareRelayConfigError";
    this.code = code;
  }
}

function signerKey(value: string | undefined): Hex | null {
  if (value === undefined || value.trim() === "") return null;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new FlareRelayConfigError("invalid-flare-finalizer-private-key");
  }
  return normalized as Hex;
}

export function loadFlareRelayConfig(
  mode: FlareRelayMode,
  env: NodeJS.ProcessEnv,
): FlareRelayConfig {
  const rpcUrl = env.COSTON2_RPC_URL?.trim();
  if (!rpcUrl) throw new FlareRelayConfigError("missing-coston2-rpc-url");
  const market = env.VITE_FLARE_MARKET_ADDRESS?.trim() || env.FLARE_MARKET_ADDRESS?.trim();
  if (!market) throw new FlareRelayConfigError("missing-flare-market-address");
  if (!isAddress(market)) throw new FlareRelayConfigError("invalid-flare-market-address");
  const deploymentBlock = env.VITE_FLARE_MARKET_DEPLOYMENT_BLOCK?.trim() || env.FLARE_MARKET_DEPLOYMENT_BLOCK?.trim();
  if (!deploymentBlock || !/^[0-9]+$/.test(deploymentBlock)) {
    throw new FlareRelayConfigError("invalid-flare-deployment-block");
  }
  const deploymentStatus = env.VITE_FLARE_DEPLOYMENT_STATUS?.trim() || env.FLARE_DEPLOYMENT_STATUS?.trim() || "planned";
  if (deploymentStatus !== "planned" && deploymentStatus !== "verified") {
    throw new FlareRelayConfigError("invalid-flare-deployment-status");
  }
  const signerPrivateKey = signerKey(env.FLARE_FINALIZER_PRIVATE_KEY);
  const fccProxyUrls = loadProxyUrls(env.FLARE_FCC_PROXY_URLS);
  const fccExtensionVersion = env.FLARE_FCC_EXTENSION_VERSION?.trim() || null;
  const fccInstructionFeeWei = positiveBigint(
    env.FLARE_FCC_INSTRUCTION_FEE_WEI,
    "invalid-fcc-instruction-fee",
  );
  const configuredActionBudget = actionBudget(env.FLARE_ACTION_BUDGET);
  if ((mode === "once" || mode === "poll") && signerPrivateKey === null) {
    throw new FlareRelayConfigError("missing-flare-finalizer-private-key");
  }
  if ((mode === "once" || mode === "poll") && deploymentStatus !== "verified") {
    throw new FlareRelayConfigError("unverified-flare-deployment-write-disabled");
  }
  if ((mode === "once" || mode === "poll") && fccProxyUrls.length !== 3) {
    throw new FlareRelayConfigError("missing-fcc-proxy-set");
  }
  if ((mode === "once" || mode === "poll") && fccExtensionVersion === null) {
    throw new FlareRelayConfigError("missing-fcc-extension-version");
  }
  if ((mode === "once" || mode === "poll") && fccInstructionFeeWei === null) {
    throw new FlareRelayConfigError("missing-fcc-instruction-fee");
  }
  return {
    mode,
    rpcUrl,
    marketAddress: getAddress(market),
    deploymentBlock: BigInt(deploymentBlock),
    deploymentStatus,
    signerPrivateKey,
    fccProxyUrls,
    fccExtensionVersion,
    fccInstructionFeeWei,
    actionBudget: configuredActionBudget,
  };
}
