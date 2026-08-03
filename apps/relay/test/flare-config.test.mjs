import assert from "node:assert/strict";
import test from "node:test";
import {
  FlareRelayConfigError,
  loadFlareRelayConfig,
} from "../dist/flare-config.js";

const baseEnv = {
  COSTON2_RPC_URL: "https://coston2.example.invalid/rpc",
  FLARE_MARKET_ADDRESS: "0x1000000000000000000000000000000000000001",
  FLARE_MARKET_DEPLOYMENT_BLOCK: "33590000",
};

test("Flare relay reads explicit Coston2 config without Sepolia fallback", () => {
  const config = loadFlareRelayConfig("health", baseEnv);
  assert.equal(config.marketAddress, baseEnv.FLARE_MARKET_ADDRESS);
  assert.equal(config.deploymentBlock, 33_590_000n);
  assert.equal(config.deploymentStatus, "planned");
  assert.equal(config.signerPrivateKey, null);
});

test("Flare relay fails closed when market or deployment metadata is missing", () => {
  assert.throws(
    () => loadFlareRelayConfig("health", { COSTON2_RPC_URL: baseEnv.COSTON2_RPC_URL }),
    (error) => error instanceof FlareRelayConfigError && error.code === "missing-flare-market-address",
  );
  assert.throws(
    () => loadFlareRelayConfig("health", { ...baseEnv, FLARE_MARKET_DEPLOYMENT_BLOCK: "future" }),
    (error) => error instanceof FlareRelayConfigError && error.code === "invalid-flare-deployment-block",
  );
});

test("Flare write modes require a verified release and a dedicated signer", () => {
  assert.throws(
    () => loadFlareRelayConfig("once", baseEnv),
    (error) => error instanceof FlareRelayConfigError && error.code === "missing-flare-finalizer-private-key",
  );
  assert.throws(
    () => loadFlareRelayConfig("once", {
      ...baseEnv,
      FLARE_FINALIZER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    }),
    (error) => error instanceof FlareRelayConfigError && error.code === "unverified-flare-deployment-write-disabled",
  );
});
