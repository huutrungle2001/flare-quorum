import { describe, expect, it } from "vitest";
import {
  parseBuyerTender,
  requireTestUsdcBalance,
} from "../src/transactions/buyerTender";

const vendor = "0x1111111111111111111111111111111111111111";
const otherVendor = "0x2222222222222222222222222222222222222222";
const now = Date.parse("2026-07-26T00:00:00Z");

describe("Buyer tender validation", () => {
  it("normalizes public terms before any wallet transaction", () => {
    const parsed = parseBuyerTender(
      {
        metadata: "Office supplies Q3",
        ceilingInput: "100.25",
        deadlineInput: "2026-07-26T01:00:00Z",
        vendorInput: `${vendor}, ${otherVendor}`,
      },
      now,
    );
    expect(parsed.publicCeiling).toBe(100_250_000n);
    expect(parsed.approvedVendors).toEqual([vendor, otherVendor]);
    expect(parsed.bidDeadline).toBe(1_785_027_600n);
    expect(parsed.metadataHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects duplicate, invalid, empty, and oversized vendor sets", () => {
    const base = {
      metadata: "Office supplies Q3",
      ceilingInput: "100",
      deadlineInput: "2026-07-26T01:00:00Z",
    };
    expect(() =>
      parseBuyerTender({ ...base, vendorInput: `${vendor},${vendor}` }, now),
    ).toThrow("unique");
    expect(() =>
      parseBuyerTender({ ...base, vendorInput: "not-an-address" }, now),
    ).toThrow("valid address");
    expect(() =>
      parseBuyerTender({ ...base, vendorInput: "" }, now),
    ).toThrow("one and eight");
  });

  it("rejects stale deadlines and malformed public ceilings", () => {
    const base = {
      metadata: "Office supplies Q3",
      vendorInput: vendor,
    };
    expect(() =>
      parseBuyerTender(
        {
          ...base,
          ceilingInput: "1e3",
          deadlineInput: "2026-07-26T01:00:00Z",
        },
        now,
      ),
    ).toThrow("ceiling");
    expect(() =>
      parseBuyerTender(
        {
          ...base,
          ceilingInput: "100",
          deadlineInput: "2026-07-25T23:00:00Z",
        },
        now,
      ),
    ).toThrow("future");
  });

  it("requires the wallet to acquire Test USDC before creation", () => {
    expect(() => requireTestUsdcBalance(99_000_000n, 100_000_000n)).toThrow(
      /GET TEST USDC/i,
    );
    expect(() => requireTestUsdcBalance(100_000_000n, 100_000_000n))
      .not.toThrow();
    expect(() => requireTestUsdcBalance("encrypted", 1n)).toThrow(
      /malformed/i,
    );
  });
});
