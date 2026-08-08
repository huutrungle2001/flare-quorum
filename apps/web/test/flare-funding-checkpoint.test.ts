import { describe, expect, it, vi } from "vitest";
import {
  clearPublicFlareFundingCheckpoint,
  readPublicFlareFundingCheckpoint,
  savePublicFlareFundingCheckpoint,
} from "../src/flare/fundingCheckpoint";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as unknown as Storage;
}

const checkpoint = {
  xrplOwner: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
  xrplTransactionId: `0x${"ab".repeat(32)}` as `0x${string}`,
  walletId: "0",
  executorFeeUBA: "1000000",
};

describe("public Flare funding checkpoint", () => {
  it("round-trips only public payment recovery fields", () => {
    const storage = memoryStorage();
    savePublicFlareFundingCheckpoint(checkpoint, storage);
    expect(readPublicFlareFundingCheckpoint(storage)).toEqual({ schemaVersion: 1, ...checkpoint });
  });

  it("rejects malformed or secret-shaped values without throwing on read", () => {
    const storage = memoryStorage();
    storage.setItem("veilbid:flare-funding-checkpoint:v1", JSON.stringify({
      schemaVersion: 1,
      xrplOwner: checkpoint.xrplOwner,
      xrplTransactionId: checkpoint.xrplTransactionId,
      walletId: "0",
      executorFeeUBA: "1000000",
      privateKey: "should-never-be-accepted",
    }));
    expect(readPublicFlareFundingCheckpoint(storage)).toBeNull();
    expect(() => savePublicFlareFundingCheckpoint({ ...checkpoint, xrplTransactionId: "0x00" as `0x${string}` }, storage)).toThrow("FLARE_FUNDING_CHECKPOINT_INVALID");
  });

  it("clears the checkpoint explicitly", () => {
    const storage = memoryStorage();
    savePublicFlareFundingCheckpoint(checkpoint, storage);
    clearPublicFlareFundingCheckpoint(storage);
    expect(readPublicFlareFundingCheckpoint(storage)).toBeNull();
  });

  it("does not fail the UI when storage writes are denied", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error("denied"); }),
      removeItem: vi.fn(),
    } as unknown as Storage;
    expect(() => savePublicFlareFundingCheckpoint(checkpoint, storage)).not.toThrow();
  });
});

