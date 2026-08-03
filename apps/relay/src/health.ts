import { createServer, type Server } from "node:http";
import type { LiveRelay } from "./live.js";

export function startHealthServer(
  relay: LiveRelay,
  host: string,
  port: number,
): Promise<Server> {
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/live") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end('{"status":"ok"}');
      return;
    }
    if (request.method !== "GET" || request.url !== "/health") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end('{"status":"not-found"}');
      return;
    }
    const health = await relay.health();
    response.writeHead(health.status === "unavailable" ? 503 : 200, {
      "cache-control": "no-store",
      "content-type": "application/json",
    });
    response.end(JSON.stringify(health));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}
