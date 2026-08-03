import { describe, expect, it } from "vitest";
import { grantStoredBidViewer } from "../src/disclosure/grantViewer";

describe("viewer grant validation", () => {
  it("rejects zero and malformed viewers before creating a chain client", async () => {
    await expect(
      grantStoredBidViewer({
        walletClient: {} as never,
        account: "0x1111111111111111111111111111111111111111",
        tenderId: 1n,
        bidId: 1n,
        viewer: "0x0000000000000000000000000000000000000000",
      }),
    ).rejects.toThrow(/nonzero address/i);
    await expect(
      grantStoredBidViewer({
        walletClient: {} as never,
        account: "0x1111111111111111111111111111111111111111",
        tenderId: 1n,
        bidId: 1n,
        viewer: "not-an-address",
      }),
    ).rejects.toThrow(/nonzero address/i);
  });
});
