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
  assert.deepEqual(config.fccProxyUrls, []);
  assert.equal(config.fccExtensionVersion, null);
  assert.equal(config.fccInstructionFeeWei, null);
  assert.equal(config.actionBudget, 1);
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

test("Flare write modes require three secure FCC proxies, version, and fee", () => {
  const verified = {
    ...baseEnv,
    FLARE_DEPLOYMENT_STATUS: "verified",
    FLARE_FINALIZER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  };
  assert.throws(
    () => loadFlareRelayConfig("once", verified),
    (error) => error instanceof FlareRelayConfigError && error.code === "missing-fcc-proxy-set",
  );
  assert.throws(
    () => loadFlareRelayConfig("once", {
      ...verified,
      FLARE_FCC_PROXY_URLS: "http://public.example,http://second.example,http://third.example",
    }),
    (error) => error instanceof FlareRelayConfigError && error.code === "insecure-fcc-proxy-url",
  );
  const withProxies = {
    ...verified,
    FLARE_FCC_PROXY_URLS: "https://one.example,https://two.example/base/,https://three.example",
  };
  assert.throws(
    () => loadFlareRelayConfig("once", withProxies),
    (error) => error instanceof FlareRelayConfigError && error.code === "missing-fcc-extension-version",
  );
  assert.throws(
    () => loadFlareRelayConfig("once", { ...withProxies, FLARE_FCC_EXTENSION_VERSION: "0.2.0" }),
    (error) => error instanceof FlareRelayConfigError && error.code === "missing-fcc-instruction-fee",
  );
  const config = loadFlareRelayConfig("once", {
    ...withProxies,
    FLARE_FCC_EXTENSION_VERSION: "0.2.0",
    FLARE_FCC_INSTRUCTION_FEE_WEI: "1000000",
  });
  assert.deepEqual(config.fccProxyUrls, [
    "https://one.example",
    "https://two.example/base",
    "https://three.example",
  ]);
  assert.equal(config.fccInstructionFeeWei, 1_000_000n);
});

test("Flare action budget is bounded and defaults to one", () => {
  assert.throws(
    () => loadFlareRelayConfig("health", { ...baseEnv, FLARE_ACTION_BUDGET: "0" }),
    (error) => error instanceof FlareRelayConfigError && error.code === "invalid-flare-action-budget",
  );
  assert.equal(loadFlareRelayConfig("health", { ...baseEnv, FLARE_ACTION_BUDGET: "3" }).actionBudget, 3);
});
