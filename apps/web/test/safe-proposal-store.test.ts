import { describe, expect, it } from "vitest";
import {
  loadSafeProposals,
  rememberSafeProposal,
} from "../src/safe/safeProposalStore";

const safe = "0x1111111111111111111111111111111111111111" as const;
const safeTxHash = `0x${"22".repeat(32)}` as const;

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("Safe proposal recovery store", () => {
  it("persists only the public recovery envelope and deduplicates hashes", () => {
    const storage = memoryStorage();
    const proposal = {
      kind: "tender" as const,
      safe,
      safeTxHash,
      createdAt: "2026-07-27T00:00:00.000Z",
    };
    rememberSafeProposal(proposal, storage);
    rememberSafeProposal(proposal, storage);

    expect(loadSafeProposals(storage)).toEqual([proposal]);
    expect(JSON.stringify(loadSafeProposals(storage))).not.toContain(
      "calldata",
    );
  });

  it("ignores malformed storage instead of inventing proposal state", () => {
    const storage = memoryStorage();
    storage.setItem("veilbid.safe-proposals.v1", "not-json");
    expect(loadSafeProposals(storage)).toEqual([]);
  });

  it("recovers treasury proposals without storing private amounts", () => {
    const storage = memoryStorage();
    const proposal = {
      kind: "unwrap" as const,
      safe,
      safeTxHash,
      createdAt: "2026-07-27T00:00:00.000Z",
    };
    rememberSafeProposal(proposal, storage);
    const serialized = JSON.stringify(loadSafeProposals(storage));
    expect(loadSafeProposals(storage)).toEqual([proposal]);
    expect(serialized).not.toContain("amount");
    expect(serialized).not.toContain("recipient");
    expect(serialized).not.toContain("handle");
  });
});
