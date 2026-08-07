import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { FlareLiveRelay } from "./flare-live.js";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(value));
}

function portValue(value: string | undefined): number {
  if (!value?.trim() || !/^[0-9]+$/.test(value)) return 8787;
  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 0 && port <= 65_535 ? port : 8787;
}

export function flareHealthPort(env: NodeJS.ProcessEnv = process.env): number {
  return portValue(env.FLARE_HEALTH_PORT ?? env.PORT);
}

export function flareHealthHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.FLARE_HEALTH_HOST?.trim() || env.FINALIZER_HEALTH_HOST?.trim() || "127.0.0.1";
}

export async function startFlareHealthServer(
  relay: Pick<FlareLiveRelay, "health">,
  host = flareHealthHost(),
  port = flareHealthPort(),
): Promise<Server> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "GET") {
      json(response, 405, { status: "method-not-allowed" });
      return;
    }
    if (request.url === "/live") {
      json(response, 200, { status: "ok", service: "veilbid-flare-relay" });
      return;
    }
    if (request.url === "/health") {
      try {
        const health = await relay.health();
        json(response, health.status === "unavailable" ? 503 : 200, health);
      } catch {
        json(response, 503, { status: "unavailable" });
      }
      return;
    }
    json(response, 404, { status: "not-found" });
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  return server;
}
