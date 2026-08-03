import { describe, expect, it, vi } from "vitest";
import {
  parseVendorPrice,
  submitVendorBid,
} from "../src/transactions/vendorBid";

const vendor = "0x1111111111111111111111111111111111111111";

describe("vendor bid validation", () => {
  it("parses six-decimal prices within the public ceiling", () => {
    expect(parseVendorPrice("37.125001", 100_000_000n)).toBe(37_125_001n);
  });

  it.each(["", "0", "-1", "1.0000001", "1e2", " 01 "])(
    "rejects a malformed or zero private price: %s",
    (value) => {
      expect(() => parseVendorPrice(value, 100_000_000n)).toThrow();
    },
  );

  it("rejects a price above the public ceiling before encryption", () => {
    expect(() => parseVendorPrice("100.000001", 100_000_000n)).toThrow(
      "public ceiling",
    );
  });

  it("rejects an expired tender before encryption or a wallet request", async () => {
    const onStage = vi.fn();
    await expect(
      submitVendorBid({
        walletClient: {} as never,
        account: vendor,
        tenderId: 3n,
        publicCeiling: 100_000_000n,
        bidDeadline: 1n,
        priceInput: "37",
        onStage,
      }),
    ).rejects.toThrow(/deadline has passed/i);
    expect(onStage).not.toHaveBeenCalled();
  });
});
