import { describe, expect, it } from "vitest";
import { assertFlareVendorApproved } from "../src/flare/flareBidIngress";
import { flareVendorBidErrorMessage } from "../src/flare/FlareVendorWorkspace";

describe("Coston2 vendor admission preflight", () => {
  it("allows only a positive on-chain approval result", () => {
    expect(() => assertFlareVendorApproved(true)).not.toThrow();
  });

  it("fails closed before private ingress for an unapproved vendor", () => {
    expect(() => assertFlareVendorApproved(false)).toThrow("FLARE_VENDOR_NOT_APPROVED");
  });

  it("explains the admission failure without exposing request material", () => {
    expect(flareVendorBidErrorMessage(new Error("FLARE_VENDOR_NOT_APPROVED")))
      .toMatch(/not on the buyer's approved vendor list/i);
  });
});
