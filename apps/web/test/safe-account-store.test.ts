import { describe, expect, it } from "vitest";
import {
  loadRememberedOwnerSafes,
  rememberOwnerSafe,
} from "../src/safe/safeAccountStore";

const owner = "0x1111111111111111111111111111111111111111";
const firstSafe = "0x2222222222222222222222222222222222222222";
const secondSafe = "0x3333333333333333333333333333333333333333";

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

describe("Safe owner memory", () => {
  it("restores the most recently used public Safe for one owner", () => {
    const storage = memoryStorage();
    rememberOwnerSafe(owner, firstSafe, storage);
    rememberOwnerSafe(owner, secondSafe, storage);
    expect(loadRememberedOwnerSafes(owner, storage)).toEqual([
      secondSafe,
      firstSafe,
    ]);
  });

  it("deduplicates one owner/Safe pair without storing private state", () => {
    const storage = memoryStorage();
    rememberOwnerSafe(owner, firstSafe, storage);
    rememberOwnerSafe(owner, firstSafe, storage);
    const restored = loadRememberedOwnerSafes(owner, storage);
    expect(restored).toEqual([firstSafe]);
    expect(JSON.stringify(restored)).not.toMatch(/proof|signature|private/i);
  });

  it("does not return another owner's remembered Safes", () => {
    const storage = memoryStorage();
    rememberOwnerSafe(owner, firstSafe, storage);
    expect(
      loadRememberedOwnerSafes(
        "0x4444444444444444444444444444444444444444",
        storage,
      ),
    ).toEqual([]);
  });
});
