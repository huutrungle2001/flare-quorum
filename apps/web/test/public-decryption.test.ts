import { describe, expect, it, vi } from "vitest";
import { waitForPublicDecryption } from "../src/transactions/publicDecryption";

const handle = `0x${"11".repeat(32)}` as const;
const proof = `0x${"22".repeat(64)}` as const;

describe("bounded public decryption recovery", () => {
  it("retries an indexing delay without persisting the handle or proof", async () => {
    const publicDecrypt = vi
      .fn()
      .mockRejectedValueOnce(new Error("not indexed"))
      .mockResolvedValue({ value: 1n, decryptionProof: proof });
    const result = await waitForPublicDecryption(
      { publicDecrypt } as never,
      handle,
      { attempts: 2, delayMs: 0 },
    );
    expect(publicDecrypt).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ value: 1n, decryptionProof: proof });
  });

  it("surfaces the final bounded failure", async () => {
    const publicDecrypt = vi.fn().mockRejectedValue(new Error("gateway down"));
    await expect(
      waitForPublicDecryption({ publicDecrypt } as never, handle, {
        attempts: 3,
        delayMs: 0,
      }),
    ).rejects.toThrow("gateway down");
    expect(publicDecrypt).toHaveBeenCalledTimes(3);
  });
});
