import assert from "node:assert/strict";
import test from "node:test";
import {
  FlareIngressConfigError,
  loadFlareIngressConfig,
} from "../dist/flare-ingress-config.js";

const baseEnv = {
  COSTON2_RPC_URL: "https://coston2.example.invalid/rpc/",
  FLARE_MARKET_ADDRESS: "0x1000000000000000000000000000000000000001",
  FLARE_TEE_MANAGER: "0x2000000000000000000000000000000000000002",
  FLARE_DEPLOYMENT_STATUS: "verified",
  FLARE_FCC_PROXY_URLS: "https://tee-1.example/,https://tee-2.example,https://tee-3.example",
  FLARE_FCC_DIRECT_API_KEYS: "test-only-key-one,test-only-key-two,test-only-key-three",
  FLARE_INGRESS_HEALTH_TENDER_ID: "21",
  FLARE_INGRESS_WEB_ORIGIN: "https://app.example/",
};

test("ingress config requires an explicit verified three-machine deployment", () => {
  const config = loadFlareIngressConfig(baseEnv);
  assert.equal(config.rpcUrl, "https://coston2.example.invalid/rpc");
  assert.equal(config.marketAddress, baseEnv.FLARE_MARKET_ADDRESS);
  assert.equal(config.teeManagerAddress, baseEnv.FLARE_TEE_MANAGER);
  assert.deepEqual(config.proxyUrls, [
    "https://tee-1.example",
    "https://tee-2.example",
    "https://tee-3.example",
  ]);
  assert.equal(config.directApiKeys.length, 3);
  assert.equal(config.healthTenderId, 21n);
  assert.equal(config.webOrigin, "https://app.example");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8788);
  assert.match(config.publicBriefDirectory, /\.local\/flare-public-briefs$/);
});

test("ingress config fails closed on unverified or incomplete chain bindings", () => {
  for (const [field, code] of [
    ["FLARE_MARKET_ADDRESS", "missing-flare-market-address"],
    ["FLARE_TEE_MANAGER", "missing-flare-tee-manager-address"],
    ["FLARE_FCC_PROXY_URLS", "invalid-flare-ingress-proxy-set"],
    ["FLARE_FCC_DIRECT_API_KEYS", "invalid-flare-ingress-api-key-set"],
    ["FLARE_INGRESS_HEALTH_TENDER_ID", "missing-flare-ingress-health-tender-id"],
  ]) {
    const env = { ...baseEnv };
    delete env[field];
    assert.throws(
      () => loadFlareIngressConfig(env),
      (error) => error instanceof FlareIngressConfigError && error.code === code,
    );
  }
  assert.throws(
    () => loadFlareIngressConfig({ ...baseEnv, FLARE_DEPLOYMENT_STATUS: "planned" }),
    (error) => error instanceof FlareIngressConfigError && error.code === "unverified-flare-ingress-disabled",
  );
  assert.throws(
    () => loadFlareIngressConfig({ ...baseEnv, FLARE_TEE_MANAGER: `0x${"00".repeat(20)}` }),
    (error) => error instanceof FlareIngressConfigError && error.code === "invalid-flare-tee-manager-address",
  );
});

test("ingress config rejects insecure, duplicate, credential-bearing, and malformed endpoints", () => {
  for (const [field, value, code] of [
    ["COSTON2_RPC_URL", ["https", "://", "user", ":", "password", "@coston2.example/rpc"].join(""), "invalid-coston2-rpc-url"],
    ["FLARE_FCC_PROXY_URLS", "http://tee-1.example,https://tee-2.example,https://tee-3.example", "invalid-flare-ingress-proxy-url"],
    ["FLARE_FCC_PROXY_URLS", "https://tee.example,https://tee.example,https://tee-3.example", "invalid-flare-ingress-proxy-set"],
    ["FLARE_INGRESS_WEB_ORIGIN", "https://app.example/path", "invalid-flare-ingress-web-origin"],
    ["FLARE_INGRESS_HOST", "public.example", "invalid-flare-ingress-host"],
    ["FLARE_INGRESS_PORT", "70000", "invalid-flare-ingress-port"],
    ["FLARE_INGRESS_HEALTH_TENDER_ID", "0", "invalid-flare-ingress-health-tender-id"],
  ]) {
    assert.throws(
      () => loadFlareIngressConfig({ ...baseEnv, [field]: value }),
      (error) => error instanceof FlareIngressConfigError && error.code === code,
    );
  }
});
