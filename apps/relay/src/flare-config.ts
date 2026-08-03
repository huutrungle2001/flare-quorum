import { getAddress, isAddress, type Address, type Hex } from "viem";

export type FlareRelayMode = "health" | "dry-run" | "once" | "poll";

export interface FlareRelayConfig {
  mode: FlareRelayMode;
  rpcUrl: string;
  marketAddress: Address;
  deploymentBlock: bigint;
  deploymentStatus: "planned" | "verified";
  signerPrivateKey: Hex | null;
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
  if ((mode === "once" || mode === "poll") && signerPrivateKey === null) {
    throw new FlareRelayConfigError("missing-flare-finalizer-private-key");
  }
  if ((mode === "once" || mode === "poll") && deploymentStatus !== "verified") {
    throw new FlareRelayConfigError("unverified-flare-deployment-write-disabled");
  }
  return {
    mode,
    rpcUrl,
    marketAddress: getAddress(market),
    deploymentBlock: BigInt(deploymentBlock),
    deploymentStatus,
    signerPrivateKey,
  };
}
