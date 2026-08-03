import { describe, expect, it } from "vitest";
import {
  readRecoveryRecords,
  recoveryStorageKey,
  removeRecoveryRecord,
  saveRecoveryRecord,
} from "../src/activity/recoveryStore";

const firstHash = `0x${"11".repeat(32)}` as const;
const secondHash = `0x${"22".repeat(32)}` as const;

describe("Activity recovery store", () => {
  it("persists public identifiers only and deduplicates a recovery stage", () => {
    saveRecoveryRecord(
      {
        kind: "funding",
        tenderId: 7n,
        triggerTransactionHash: firstHash,
      },
      localStorage,
      new Date("2026-07-26T00:00:00Z"),
    );
    saveRecoveryRecord(
      {
        kind: "funding",
        tenderId: 7n,
        triggerTransactionHash: secondHash,
      },
      localStorage,
      new Date("2026-07-26T00:01:00Z"),
    );

    const records = readRecoveryRecords(localStorage);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: "funding",
      tenderId: "7",
      triggerTransactionHash: secondHash,
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:01:00.000Z",
    });
    expect(localStorage.getItem(recoveryStorageKey)).not.toMatch(
      /handle|proof|price|signature/i,
    );
  });

  it("drops malformed, wrong-chain, zero-id, and non-hash entries", () => {
    localStorage.setItem(
      recoveryStorageKey,
      JSON.stringify([
        null,
        { version: 1, chainId: 1, kind: "funding", tenderId: "1" },
        {
          version: 1,
          chainId: 11155111,
          kind: "winner",
          tenderId: "0",
          triggerTransactionHash: firstHash,
          createdAt: "2026-07-26T00:00:00.000Z",
          updatedAt: "2026-07-26T00:00:00.000Z",
        },
      ]),
    );
    expect(readRecoveryRecords(localStorage)).toEqual([]);
  });

  it("removes only the resolved kind and tender pair", () => {
    saveRecoveryRecord(
      { kind: "funding", tenderId: 3n, triggerTransactionHash: firstHash },
      localStorage,
    );
    saveRecoveryRecord(
      { kind: "winner", tenderId: 3n, triggerTransactionHash: secondHash },
      localStorage,
    );
    removeRecoveryRecord("funding", 3n, localStorage);
    expect(readRecoveryRecords(localStorage)).toMatchObject([
      { kind: "winner", tenderId: "3" },
    ]);
  });
});
