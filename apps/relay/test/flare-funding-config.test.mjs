import assert from "node:assert/strict";
import test from "node:test";
import {
  FlareFundingConfigError,
  loadFlareFundingConfig,
} from "../dist/flare-funding-config.js";

const baseEnv = {
  COSTON2_RPC_URL: "https://coston2.example.invalid/rpc",
  XRPL_TESTNET_RPC_URL: "https://xrpl.example.invalid",
  FLARE_MARKET_ADDRESS: "0x1000000000000000000000000000000000000001",
  FLARE_MARKET_DEPLOYMENT_BLOCK: "33590000",
};

test("funding health is read-only and uses official Coston2 endpoints by default", () => {
  const config = loadFlareFundingConfig("health", baseEnv);
  assert.equal(config.executorPrivateKey, null);
  assert.equal(config.verifierApiKey, null);
  assert.equal(config.marketDeploymentStatus, "planned");
  assert.equal(config.verifierBaseUrl, "https://fdc-verifiers-testnet.flare.network");
  assert.equal(config.daLayerBaseUrl, "https://ctn2-data-availability.flare.network");
  assert.equal(config.xrplConfirmations, 3);
});

test("funding writes require a dedicated key, verifier key, and verified market", () => {
  assert.throws(
    () => loadFlareFundingConfig("execute", baseEnv),
    (error) => error instanceof FlareFundingConfigError &&
      error.code === "missing-flare-funding-executor-private-key",
  );
  const withKey = {
    ...baseEnv,
    FLARE_FUNDING_EXECUTOR_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  };
  assert.throws(
    () => loadFlareFundingConfig("execute", withKey),
    (error) => error instanceof FlareFundingConfigError &&
      error.code === "missing-fdc-verifier-api-key",
  );
  assert.throws(
    () => loadFlareFundingConfig("execute", {
      ...withKey,
      VERIFIER_API_KEY_TESTNET: "configured-locally",
    }),
    (error) => error instanceof FlareFundingConfigError &&
      error.code === "unverified-flare-market-funding-disabled",
  );
  const config = loadFlareFundingConfig("execute", {
    ...withKey,
    VERIFIER_API_KEY_TESTNET: "configured-locally",
    FLARE_DEPLOYMENT_STATUS: "verified",
  });
  assert.notEqual(config.executorPrivateKey, null);
});

test("rejects credential-bearing and insecure remote URLs", () => {
  assert.throws(
    () => loadFlareFundingConfig("health", {
      ...baseEnv,
      XRPL_TESTNET_RPC_URL: "http://xrpl.example.invalid",
    }),
    (error) => error instanceof FlareFundingConfigError &&
      error.code === "invalid-xrpl-testnet-rpc-url",
  );
  assert.throws(
    () => loadFlareFundingConfig("health", {
      ...baseEnv,
      COSTON2_RPC_URL: [
        "https",
        "://",
        "user",
        ":",
        "pass",
        "@coston2.example.invalid/rpc",
      ].join(""),
    }),
    (error) => error instanceof FlareFundingConfigError &&
      error.code === "invalid-coston2-rpc-url",
  );
});
