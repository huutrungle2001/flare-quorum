#!/usr/bin/env node
import { once } from "node:events";
import { coston2FlarePublicRelease } from "@flarequorum/flare-bindings";
import { FlareIngressConfigError, loadFlareIngressConfig } from "./flare-ingress-config.js";
import { createFlareIngressServer } from "./flare-ingress-http.js";
import { LiveFlareBidIngressChain, LiveFlareBidIngressProxy } from "./flare-ingress-live.js";
import { FlareBidIngressGateway } from "./flare-ingress.js";
import { FileFlarePublicBriefStore } from "./flare-public-brief-store.js";
import { collectSelectionQuorum } from "./flare-results.js";

function output(value: Record<string, boolean | number | string>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(): Promise<void> {
  const config = loadFlareIngressConfig(process.env);
  const chain = new LiveFlareBidIngressChain(config);
  const gateway = new FlareBidIngressGateway(
    chain,
    new LiveFlareBidIngressProxy(config),
  );
  const publicBriefStore = new FileFlarePublicBriefStore(config.publicBriefDirectory);
  const server = createFlareIngressServer({
    machineKeys: (tenderId) => gateway.machineKeys(tenderId),
    submit: (request) => gateway.submit(request),
    result: (tenderId, machineIndex, actionId) => gateway.result(tenderId, machineIndex, actionId),
    selectionQuorum: async (tenderId) => {
      const selection = await chain.selectionContext(tenderId);
      if (selection.status !== "ComputePending") throw new Error("FLARE_SELECTION_NOT_PENDING");
      if (selection.context.resultExpiry < selection.chainTimestamp) {
        throw new Error("FLARE_SELECTION_RESULT_EXPIRED");
      }
      return collectSelectionQuorum({
        proxyUrls: config.proxyUrls,
        context: selection.context,
        expectedVersion: coston2FlarePublicRelease.fcc.version.replace(/^v/, ""),
      });
    },
    health: () => gateway.health(config.healthTenderId),
  }, config.webOrigin, publicBriefStore);
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
