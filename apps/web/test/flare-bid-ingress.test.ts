import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const readContract = vi.fn().mockResolvedValue(false);
  const createPublicClient = vi.fn(() => ({ readContract }));
  return { readContract, createPublicClient };
});

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: mocks.createPublicClient,
}));

import {
  assertFlareVendorApproved,
  submitFlareBid,
} from "../src/flare/flareBidIngress";
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

  it("describes a partial ingress failure without claiming ciphertext was discarded", () => {
    const message = flareVendorBidErrorMessage(new Error("FLARE_INGRESS_UNAVAILABLE"));
    expect(message).toMatch(/no on-chain bid was committed/i);
    expect(message).toMatch(/encrypted payload/i);
    expect(message).not.toMatch(/no plaintext or ciphertext was saved/i);
  });

  it("checks the mapping before loading TEE keys or sending ciphertext", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(submitFlareBid({
      tender: {
        tenderId: 21n,
        status: "Open",
        bidDeadline: BigInt(Math.floor(Date.now() / 1_000) + 600),
        scoringPolicy: { ceilingXrpMicros: 1_000_000n, requiredCredentials: [] },
      } as never,
      vendor: "0x1111111111111111111111111111111111111111",
      priceMicros: 500_000n,
      deliveryDays: 7,
      warrantyDays: 30,
      walletClient: {} as never,
      env: {
        VITE_FLARE_MARKET_ADDRESS: "0xFaEDc6793E72AFF05d29e6f0550d0FF8b90c4c05",
        VITE_COSTON2_RPC_URL: "https://coston2-api.flare.network/ext/C/rpc",
        VITE_FLARE_INGRESS_URL: "https://ingress.example",
      },
    })).rejects.toThrow("FLARE_VENDOR_NOT_APPROVED");
    expect(mocks.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "isApprovedVendor" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
