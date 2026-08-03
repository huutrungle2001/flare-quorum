#!/usr/bin/env node
import { once } from "node:events";
import { FlareIngressConfigError, loadFlareIngressConfig } from "./flare-ingress-config.js";
import { createFlareIngressServer } from "./flare-ingress-http.js";
import { LiveFlareBidIngressChain, LiveFlareBidIngressProxy } from "./flare-ingress-live.js";
import { FlareBidIngressGateway } from "./flare-ingress.js";

function output(value: Record<string, boolean | number | string>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(): Promise<void> {
  const config = loadFlareIngressConfig(process.env);
  const gateway = new FlareBidIngressGateway(
    new LiveFlareBidIngressChain(config),
    new LiveFlareBidIngressProxy(config),
  );
  const server = createFlareIngressServer(gateway, config.webOrigin);
  server.listen(config.port, config.host);
  await once(server, "listening");
  output({
    event: "flare-ingress.listening",
    chainId: 114,
    host: config.host,
    port: config.port,
  });

  const stop = (): void => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error: unknown) => {
  output({
    event: "flare-ingress.startup-failed",
    code: error instanceof FlareIngressConfigError ? error.code : "unexpected-error",
  });
  process.exitCode = 1;
});
