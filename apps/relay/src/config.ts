import type { Hex } from "viem";

export type RelayMode = "dry-run" | "once" | "poll" | "health";

export interface RelayConfig {
  mode: RelayMode;
  rpcUrl: string;
  actionBudget: number;
  pollIntervalMs: number;
  proofAttempts: number;
  proofDelayMs: number;
  healthHost: string;
  healthPort: number;
  allowUnverifiedDeployment: boolean;
  signerPrivateKey: Hex | null;
}

export class RelayConfigError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "RelayConfigError";
    this.code = code;
  }
}

const modes = new Set<RelayMode>(["dry-run", "once", "poll", "health"]);

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw new RelayConfigError(`invalid-${name}`);
  }
  return parsed;
}

function signerKey(value: string | undefined): Hex | null {
  if (value === undefined || value === "") return null;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new RelayConfigError("invalid-finalizer-private-key");
  }
  return normalized as Hex;
}

export function loadRelayConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): RelayConfig {
  const requestedMode = argv[0] ?? "dry-run";
  if (!modes.has(requestedMode as RelayMode)) {
    throw new RelayConfigError("invalid-mode");
  }
  const mode = requestedMode as RelayMode;
  const rpcUrl = env.SEPOLIA_RPC_URL?.trim();
  if (!rpcUrl) throw new RelayConfigError("missing-sepolia-rpc-url");
  const key = signerKey(env.FINALIZER_PRIVATE_KEY);
  if ((mode === "once" || mode === "poll") && key === null) {
    throw new RelayConfigError("missing-finalizer-private-key");
  }

  return {
    mode,
    rpcUrl,
    actionBudget: positiveInteger(
      env.FINALIZER_ACTION_BUDGET,
      3,
      "action-budget",
      25,
    ),
    pollIntervalMs: positiveInteger(
      env.FINALIZER_POLL_INTERVAL_MS,
      30_000,
      "poll-interval",
      3_600_000,
    ),
    proofAttempts: positiveInteger(
      env.FINALIZER_PROOF_ATTEMPTS,
      3,
      "proof-attempts",
      20,
    ),
    proofDelayMs: positiveInteger(
      env.FINALIZER_PROOF_DELAY_MS,
      5_000,
      "proof-delay",
      60_000,
    ),
    healthHost: env.FINALIZER_HEALTH_HOST?.trim() || "127.0.0.1",
    healthPort: positiveInteger(
      env.FINALIZER_HEALTH_PORT ?? env.PORT,
      8787,
      "health-port",
      65_535,
    ),
    allowUnverifiedDeployment:
      env.FLAREQUORUM_ALLOW_UNVERIFIED_DEPLOYMENT === "true",
    signerPrivateKey: key,
  };
}
