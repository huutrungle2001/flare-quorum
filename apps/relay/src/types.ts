import type { Hex } from "viem";

export type RelayActionKind = "confirm-funding" | "close" | "finalize";

export interface RelayAction {
  kind: RelayActionKind;
  tenderId: bigint;
}

export type ActionReadiness = "actionable" | "resolved" | "waiting";

export interface RelayAdapter {
  inspect(action: RelayAction): Promise<ActionReadiness>;
  execute(action: RelayAction): Promise<Hex>;
}

export type RelayOutcome =
  | "dry-run"
  | "submitted"
  | "race-resolved"
  | "waiting"
  | "deferred"
  | "failed";

export interface RelayResult {
  action: RelayActionKind;
  tenderId: string;
  outcome: RelayOutcome;
  transactionHash?: Hex;
  reason?: "proof-pending" | "action-failed";
}

export interface RelayRunSummary {
  discovered: number;
  budget: number;
  processed: number;
  remaining: number;
  results: readonly RelayResult[];
}

export class ProofPendingError extends Error {
  constructor() {
    super("Public proof is not available yet.");
    this.name = "ProofPendingError";
  }
}
