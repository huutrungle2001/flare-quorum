import { resolve } from "node:path";

import {
  renderCoston2ProxyConfig,
  writePrivateProxyConfig,
} from "../flare/proxy-config.mjs";
import { readFoundationManifest } from "../flare/foundations.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
try {
  const manifest = readFoundationManifest(repositoryRoot);
  const outputs = [1, 2, 3].map((machine) => {
    const relativePath = `.local/fcc/extension-proxy-${machine}.coston2.toml`;
    const source = renderCoston2ProxyConfig({
      environment: {
        ...process.env,
        FCC_PROXY_REDIS_ENDPOINT: `redis-${machine}:6379`,
      },
      manifest,
    });
    writePrivateProxyConfig(resolve(repositoryRoot, relativePath), source);
    return {
      machine,
      path: relativePath,
      redisEndpoint: `redis-${machine}:6379`,
      directApiKeyFromEnvironment: `FCC_DIRECT_API_KEY_${machine}`,
      proxyKeyFromEnvironment: `PROXY_PRIVATE_KEY_${machine}`,
    };
  });
  console.log(
    JSON.stringify({
      status: "written",
      mode: "0600",
      chainId: 114,
      outputs,
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
