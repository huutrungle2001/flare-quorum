import { describe, expect, it, vi } from "vitest";
import { revealBidWithClients } from "../src/auditor/revealBid";

const account = "0x1111111111111111111111111111111111111111";
const handle = `0x${"22".repeat(32)}`;

describe("authorized auditor reveal", () => {
  it("checks per-bid ACL before requesting the stored handle", async () => {
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ encryptedPriceHandle: handle });
    const decrypt = vi.fn().mockResolvedValue({
      value: 123n,
      solidityType: "uint256",
    });
    await expect(
      revealBidWithClients({
        publicClient: { readContract } as never,
        handleClient: { decrypt } as never,
        tenderId: 1n,
        bidId: 2n,
        account,
      }),
    ).resolves.toEqual({ value: "0.000123", solidityType: "uint256" });
    expect(readContract).toHaveBeenCalledTimes(2);
    expect(decrypt).toHaveBeenCalledWith(handle);
  });

  it("never reads or decrypts a bid for an unauthorized viewer", async () => {
    const readContract = vi.fn().mockResolvedValue(false);
    const decrypt = vi.fn();
    await expect(
      revealBidWithClients({
        publicClient: { readContract } as never,
        handleClient: { decrypt } as never,
        tenderId: 1n,
        bidId: 2n,
        account,
      }),
    ).rejects.toThrow(/not an authorized viewer/i);
    expect(readContract).toHaveBeenCalledTimes(1);
    expect(decrypt).not.toHaveBeenCalled();
  });
});
