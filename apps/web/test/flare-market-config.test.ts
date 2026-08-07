import { describe, expect, it } from "vitest";
import { isFlareReleaseEnabled, resolveFlareMarketConfig } from "../src/public-market/loadFlareMarket";

describe("Flare public market configuration", () => {
  it("enables the default judge route only for a complete verified release", () => {
    const base = {
      VITE_COSTON2_RPC_URL: "https://coston2.example.invalid/rpc",
      VITE_FLARE_MARKET_ADDRESS: "0x1000000000000000000000000000000000000001",
      VITE_FLARE_MARKET_DEPLOYMENT_BLOCK: "33590000",
    };
    expect(isFlareReleaseEnabled({ ...base, VITE_FLARE_DEPLOYMENT_STATUS: "planned" })).toBe(false);
    expect(isFlareReleaseEnabled({ ...base, VITE_FLARE_DEPLOYMENT_STATUS: "verified" })).toBe(true);
    expect(isFlareReleaseEnabled({ ...base, VITE_FLARE_DEPLOYMENT_STATUS: "verified", VITE_FLARE_MARKET_ADDRESS: "" })).toBe(false);
  });

  it("fails closed when no verified Coston2 market is configured", () => {
    expect(() => resolveFlareMarketConfig({})).toThrow("FLARE_MARKET_NOT_CONFIGURED");
  });

  it("parses an explicit planned Coston2 deployment without inventing a fallback", () => {
    const config = resolveFlareMarketConfig({
      VITE_COSTON2_RPC_URL: "https://coston2.example.invalid/rpc",
      VITE_FLARE_MARKET_ADDRESS: "0x1000000000000000000000000000000000000001",
      VITE_FLARE_MARKET_DEPLOYMENT_BLOCK: "33590000",
      VITE_FLARE_DEPLOYMENT_STATUS: "planned",
    });
    expect(config.marketAddress).toBe("0x1000000000000000000000000000000000000001");
    expect(config.deploymentBlock).toBe(33_590_000n);
    expect(config.deploymentStatus).toBe("planned");
  });

  it("rejects malformed deployment metadata", () => {
    expect(() => resolveFlareMarketConfig({
      VITE_COSTON2_RPC_URL: "https://coston2.example.invalid/rpc",
      VITE_FLARE_MARKET_ADDRESS: "not-an-address",
      VITE_FLARE_MARKET_DEPLOYMENT_BLOCK: "1",
    })).toThrow("FLARE_MARKET_ADDRESS_INVALID");
    expect(() => resolveFlareMarketConfig({
      VITE_COSTON2_RPC_URL: "https://coston2.example.invalid/rpc",
      VITE_FLARE_MARKET_ADDRESS: "0x1000000000000000000000000000000000000001",
      VITE_FLARE_MARKET_DEPLOYMENT_BLOCK: "not-a-block",
    })).toThrow("FLARE_DEPLOYMENT_BLOCK_INVALID");
  });
});
