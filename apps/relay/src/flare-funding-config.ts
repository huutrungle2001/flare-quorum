import { getAddress, isAddress, type Address, type Hex } from "viem";

export type FlareFundingMode = "health" | "execute";

export interface FlareFundingConfig {
  mode: FlareFundingMode;
  rpcUrl: string;
  xrplRpcUrl: string;
  verifierBaseUrl: string;
  verifierApiKey: string | null;
  daLayerBaseUrl: string;
  daLayerApiKey: string | null;
  contractRegistry: Address;
  marketAddress: Address;
  marketDeploymentBlock: bigint;
  marketDeploymentStatus: "planned" | "verified";
  expectedFTestXrp: Address;
  executorPrivateKey: Hex | null;
  xrplConfirmations: number;
  pollIntervalMs: number;
  pollAttempts: number;
}

export class FlareFundingConfigError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "FlareFundingConfigError";
    this.code = code;
  }
}

function secureUrl(value: string | undefined, missing: string, invalid: string): string {
  if (!value?.trim()) throw new FlareFundingConfigError(missing);
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new FlareFundingConfigError(invalid);
  }
  const loopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";
  if (
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new FlareFundingConfigError(invalid);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function address(
  value: string | undefined,
  fallback: Address | undefined,
  code: string,
): Address {
  const selected = value?.trim() || fallback;
  if (!selected || !isAddress(selected)) throw new FlareFundingConfigError(code);
  return getAddress(selected);
}

function unsignedBigint(value: string | undefined, code: string): bigint {
  if (!value || !/^[0-9]+$/.test(value)) throw new FlareFundingConfigError(code);
  return BigInt(value);
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
  code: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^[0-9]+$/.test(value)) throw new FlareFundingConfigError(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new FlareFundingConfigError(code);
  }
  return parsed;
}

function privateKey(value: string | undefined): Hex | null {
  if (!value?.trim()) return null;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new FlareFundingConfigError("invalid-flare-funding-executor-private-key");
  }
  return normalized as Hex;
}

export function loadFlareFundingConfig(
  mode: FlareFundingMode,
  env: NodeJS.ProcessEnv,
): FlareFundingConfig {
  const marketDeploymentStatus =
    env.FLARE_DEPLOYMENT_STATUS?.trim() ||
    env.VITE_FLARE_DEPLOYMENT_STATUS?.trim() ||
    "planned";
  if (marketDeploymentStatus !== "planned" && marketDeploymentStatus !== "verified") {
    throw new FlareFundingConfigError("invalid-flare-deployment-status");
  }
  const executorPrivateKey = privateKey(env.FLARE_FUNDING_EXECUTOR_PRIVATE_KEY);
  const verifierApiKey = env.VERIFIER_API_KEY_TESTNET?.trim() || null;
  if (mode === "execute" && executorPrivateKey === null) {
    throw new FlareFundingConfigError("missing-flare-funding-executor-private-key");
  }
  if (mode === "execute" && verifierApiKey === null) {
    throw new FlareFundingConfigError("missing-fdc-verifier-api-key");
  }
  if (mode === "execute" && marketDeploymentStatus !== "verified") {
    throw new FlareFundingConfigError("unverified-flare-market-funding-disabled");
  }
  return {
    mode,
    rpcUrl: secureUrl(
      env.COSTON2_RPC_URL,
      "missing-coston2-rpc-url",
      "invalid-coston2-rpc-url",
    ),
    xrplRpcUrl: secureUrl(
      env.XRPL_TESTNET_RPC_URL,
      "missing-xrpl-testnet-rpc-url",
      "invalid-xrpl-testnet-rpc-url",
    ),
    verifierBaseUrl: secureUrl(
      env.VERIFIER_URL_TESTNET ?? "https://fdc-verifiers-testnet.flare.network",
      "missing-fdc-verifier-url",
      "invalid-fdc-verifier-url",
    ),
    verifierApiKey,
    daLayerBaseUrl: secureUrl(
      env.COSTON2_DA_LAYER_URL ?? "https://ctn2-data-availability.flare.network",
      "missing-coston2-da-layer-url",
      "invalid-coston2-da-layer-url",
    ),
    daLayerApiKey: env.COSTON2_DA_LAYER_API_KEY?.trim() || null,
    contractRegistry: address(
      env.FLARE_CONTRACT_REGISTRY_ADDRESS,
      "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
      "invalid-flare-contract-registry-address",
    ),
    marketAddress: address(
      env.FLARE_MARKET_ADDRESS ?? env.VITE_FLARE_MARKET_ADDRESS,
      undefined,
      "invalid-flare-market-address",
    ),
    marketDeploymentBlock: unsignedBigint(
      env.FLARE_MARKET_DEPLOYMENT_BLOCK ?? env.VITE_FLARE_MARKET_DEPLOYMENT_BLOCK,
      "invalid-flare-market-deployment-block",
    ),
    marketDeploymentStatus,
    expectedFTestXrp: address(
      env.FLARE_FTESTXRP_ADDRESS,
      "0x0b6A3645c240605887a5532109323A3E12273dc7",
      "invalid-flare-ftestxrp-address",
    ),
    executorPrivateKey,
    xrplConfirmations: boundedInteger(
      env.XRPL_FDC_CONFIRMATIONS,
      3,
      20,
      "invalid-xrpl-fdc-confirmations",
    ),
    pollIntervalMs: boundedInteger(
      env.FLARE_FUNDING_POLL_INTERVAL_MS,
      15_000,
      60_000,
      "invalid-flare-funding-poll-interval",
    ),
    pollAttempts: boundedInteger(
      env.FLARE_FUNDING_POLL_ATTEMPTS,
      80,
      240,
      "invalid-flare-funding-poll-attempts",
    ),
  };
}
