import { resolve } from "node:path";

import {
  renderCoston2ProxyConfig,
  writePrivateProxyConfig,
} from "../flare/proxy-config.mjs";
import { readFoundationManifest } from "../flare/foundations.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const outputPath = resolve(
  repositoryRoot,
  ".local/fcc/extension-proxy.coston2.toml",
);

try {
  const source = renderCoston2ProxyConfig({
    environment: process.env,
    manifest: readFoundationManifest(repositoryRoot),
  });
  writePrivateProxyConfig(outputPath, source);
  console.log(
    JSON.stringify({
      status: "written",
      path: ".local/fcc/extension-proxy.coston2.toml",
      mode: "0600",
      chainId: 114,
      directApiKeyFromEnvironment: "FCC_DIRECT_API_KEY",
      proxyKeyFromEnvironment: "PROXY_PRIVATE_KEY",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "failed",
      code: error instanceof Error ? error.message : "FCC_PROXY_CONFIG_FAILED",
    }),
  );
  process.exitCode = 1;
}
