import {
  ProofPendingError,
  type ActionReadiness,
  type RelayAction,
  type RelayAdapter,
  type RelayResult,
  type RelayRunSummary,
} from "./types.js";

function publicResult(
  action: RelayAction,
  result: Omit<RelayResult, "action" | "tenderId">,
): RelayResult {
  return {
    action: action.kind,
    tenderId: action.tenderId.toString(),
    ...result,
  };
}

function validateBudget(budget: number): void {
  if (!Number.isSafeInteger(budget) || budget < 1) {
    throw new Error("Action budget must be a positive safe integer.");
  }
}

export function describeDryRun(
  actions: readonly RelayAction[],
  budget: number,
): RelayRunSummary {
  validateBudget(budget);
  const selected = actions.slice(0, budget);
  return {
    discovered: actions.length,
    budget,
    processed: selected.length,
    remaining: actions.length - selected.length,
    results: selected.map((action) =>
      publicResult(action, { outcome: "dry-run" }),
    ),
  };
}

export async function runRelayActions({
  actions,
  budget,
  adapter,
  onResult = () => undefined,
}: {
  actions: readonly RelayAction[];
  budget: number;
  adapter: RelayAdapter;
  onResult?: (result: RelayResult) => void;
}): Promise<RelayRunSummary> {
  validateBudget(budget);
  const selected = actions.slice(0, budget);
  const results: RelayResult[] = [];

  for (const action of selected) {
    let readiness: ActionReadiness;
    try {
      readiness = await adapter.inspect(action);
    } catch {
      const result = publicResult(action, {
        outcome: "failed",
        reason: "action-failed",
      });
      results.push(result);
      onResult(result);
      continue;
    }
    if (readiness !== "actionable") {
      const result = publicResult(action, {
        outcome: readiness === "resolved" ? "race-resolved" : "waiting",
      });
      results.push(result);
      onResult(result);
      continue;
    }

    let result: RelayResult;
    try {
      const transactionHash = await adapter.execute(action);
      result = publicResult(action, {
        outcome: "submitted",
        transactionHash,
      });
    } catch (error) {
      if (error instanceof ProofPendingError) {
        result = publicResult(action, {
          outcome: "deferred",
          reason: "proof-pending",
        });
      } else {
        let afterFailure: ActionReadiness;
        try {
          afterFailure = await adapter.inspect(action);
        } catch {
          afterFailure = "waiting";
        }
        result = publicResult(action, {
          outcome:
            afterFailure === "resolved" ? "race-resolved" : "failed",
          ...(afterFailure === "resolved"
            ? {}
            : { reason: "action-failed" as const }),
        });
      }
    }
    results.push(result);
    onResult(result);
  }

  return {
    discovered: actions.length,
    budget,
    processed: selected.length,
    remaining: actions.length - selected.length,
    results,
  };
}
