import type { RelayResult, RelayRunSummary } from "./types.js";

export interface RelayLogger {
  action(result: RelayResult): void;
  summary(summary: RelayRunSummary): void;
  event(name: string, fields?: Record<string, boolean | number | string>): void;
}

function write(value: object): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function createRelayLogger(): RelayLogger {
  return {
    action(result) {
      write({ event: "relay.action", ...result });
    },
    summary(summary) {
      write({
        event: "relay.summary",
        discovered: summary.discovered,
        budget: summary.budget,
        processed: summary.processed,
        remaining: summary.remaining,
        outcomes: summary.results.reduce<Record<string, number>>(
          (counts, result) => {
            counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
            return counts;
          },
          {},
        ),
      });
    },
    event(name, fields = {}) {
      write({ event: name, ...fields });
    },
  };
}
