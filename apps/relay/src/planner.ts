import {
  getTenderReadiness,
  type PublicMarketIndex,
} from "@veilbid/chain-bindings";
import type { RelayAction } from "./types.js";

const kindOrder: Record<RelayAction["kind"], number> = {
  "confirm-funding": 0,
  finalize: 1,
  close: 2,
};

export function planRelayActions(
  index: PublicMarketIndex,
  timestamp: bigint,
): RelayAction[] {
  return index.tenders
    .flatMap((tender): RelayAction[] => {
      const readiness = getTenderReadiness(tender, timestamp);
      if (readiness.needsFundingProof) {
        return [{ kind: "confirm-funding", tenderId: tender.tenderId }];
      }
      if (readiness.needsWinnerProof) {
        return [{ kind: "finalize", tenderId: tender.tenderId }];
      }
      if (readiness.canClose) {
        return [{ kind: "close", tenderId: tender.tenderId }];
      }
      return [];
    })
    .sort((left, right) => {
      const kindDifference = kindOrder[left.kind] - kindOrder[right.kind];
      if (kindDifference !== 0) return kindDifference;
      return left.tenderId < right.tenderId
        ? -1
        : left.tenderId > right.tenderId
          ? 1
          : 0;
    });
}
