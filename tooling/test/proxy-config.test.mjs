import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  renderCoston2ProxyConfig,
  writePrivateProxyConfig,
} from "../flare/proxy-config.mjs";

const manifest = {
  network: { chainId: 114 },
  contracts: {
    flareSystemsManager: "0x1111111111111111111111111111111111111111",
    relay: "0x2222222222222222222222222222222222222222",
    voterRegistry: "0x3333333333333333333333333333333333333333",
  },
};

const environment = {
  FCC_INDEXER_HOST: "indexer.example.invalid",
  FCC_INDEXER_PORT: "3306",
  FCC_INDEXER_DATABASE: "indexer",
  FCC_INDEXER_USER: "test-user",
  FCC_INDEXER_PASSWORD: 'test-"password',
};

test("renders a fail-closed Coston2 proxy config without embedding API keys", () => {
  const source = renderCoston2ProxyConfig({ environment, manifest });
  assert.match(source, /chain_id = 114/);
  assert.match(source, /voter_registry = "0x3333/);
  assert.match(source, /password = "test-\\"password"/);
  assert.match(source, /api_key_variable = "FCC_DIRECT_API_KEY"/);
  assert.match(source, /api_key_optional = false/);
  assert.match(source, /allow_magic_pass = true/);
  assert.match(source, /internal = "6663"/);
  assert.match(source, /external = "6664"/);
  assert.doesNotMatch(source, /\[metrics\]/);
  assert.doesNotMatch(source, /PROXY_PRIVATE_KEY\s*=/);
  assert.doesNotMatch(source, /FCC_DIRECT_API_KEY\s*=/);
});

test("rejects missing, injected, and invalid indexer settings", () => {
  assert.throws(
    () => renderCoston2ProxyConfig({
      environment: { ...environment, FCC_INDEXER_PASSWORD: "" },
      manifest,
    }),
    /FCC_INDEXER_PASSWORD_MISSING/,
  );
  assert.throws(
    () => renderCoston2ProxyConfig({
      environment: { ...environment, FCC_INDEXER_HOST: "host\n[direct]" },
      manifest,
    }),
    /FCC_INDEXER_HOST_INVALID/,
  );
  assert.throws(
    () => renderCoston2ProxyConfig({
      environment: { ...environment, FCC_INDEXER_PORT: "70000" },
      manifest,
    }),
    /FCC_INDEXER_PORT_INVALID/,
  );
});

test("writes confidential proxy config with owner-only permissions", () => {
  const directory = mkdtempSync(join(tmpdir(), "flare-quorum-proxy-config-"));
  const path = join(directory, "nested", "config.toml");
  writePrivateProxyConfig(path, "private-runtime-config\n");
  assert.equal(readFileSync(path, "utf8"), "private-runtime-config\n");
  assert.equal(statSync(path).mode & 0o777, 0o600);
});
