import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Address } from "viem";
import {
  parseFlareBidIngressRequest,
  type FlareBidIngressAccepted,
  type FlareBidIngressGateway,
} from "./flare-ingress.js";

const maximumRequestBytes = 600 * 1024;
const machineRoute = /^\/flare\/ingress\/tenders\/([1-9][0-9]*)\/machines$/;
const resultRoute = /^\/flare\/ingress\/tenders\/([1-9][0-9]*)\/machines\/([0-2])\/results\/(0x[0-9a-fA-F]{64})$/;
const rateLimitWindowMs = 60_000;
const rateLimitRequests = 120;
const maximumRateLimitEntries = 10_000;
const healthRoute = "/health";

interface PublicIngressGateway {
  machineKeys(tenderId: bigint): ReturnType<FlareBidIngressGateway["machineKeys"]>;
  submit(request: ReturnType<typeof parseFlareBidIngressRequest>): Promise<FlareBidIngressAccepted>;
  result(tenderId: bigint, machineIndex: number, actionId: `0x${string}`): ReturnType<FlareBidIngressGateway["result"]>;
  health?(): Promise<Record<string, unknown>>;
}

class HttpIngressError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

class FixedWindowRateLimiter {
  readonly entries = new Map<string, { count: number; startedAt: number }>();

  allow(key: string, now = Date.now()): boolean {
    const current = this.entries.get(key);
    if (current !== undefined && now - current.startedAt < rateLimitWindowMs) {
      current.count += 1;
      return current.count <= rateLimitRequests;
    }
    if (this.entries.size >= maximumRateLimitEntries) {
      for (const [candidate, value] of this.entries) {
        if (now - value.startedAt >= rateLimitWindowMs) this.entries.delete(candidate);
      }
      if (this.entries.size >= maximumRateLimitEntries && !this.entries.has(key)) return false;
    }
    this.entries.set(key, { count: 1, startedAt: now });
    return true;
  }
}

function scalarHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function setPublicHeaders(response: ServerResponse, origin: string | undefined, webOrigin: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Vary", "Origin");
  if (origin === webOrigin) response.setHeader("Access-Control-Allow-Origin", webOrigin);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(value)}\n`);
}

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = scalarHeader(request.headers["content-type"]);
  if (contentType?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new HttpIngressError(415, "UNSUPPORTED_CONTENT_TYPE");
  }
  const declared = scalarHeader(request.headers["content-length"]);
  if (declared !== undefined && (!/^[0-9]+$/.test(declared) || Number(declared) > maximumRequestBytes)) {
    throw new HttpIngressError(413, "REQUEST_TOO_LARGE");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maximumRequestBytes) throw new HttpIngressError(413, "REQUEST_TOO_LARGE");
    chunks.push(bytes);
  }
  if (total === 0) throw new HttpIngressError(400, "INVALID_BID_INGRESS_REQUEST");
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } catch {
    throw new HttpIngressError(400, "INVALID_BID_INGRESS_REQUEST");
  }
}

function mappedError(error: unknown): HttpIngressError {
  if (error instanceof HttpIngressError) return error;
  const code = error instanceof Error ? error.message : "";
  if (code === "INVALID_BID_INGRESS_REQUEST" || code === "INVALID_FLARE_TENDER_ID") {
    return new HttpIngressError(400, code);
  }
  if (code === "BID_INGRESS_AUTHORIZATION_INVALID") {
    return new HttpIngressError(401, code);
  }
  if (
    code === "BID_INGRESS_NOT_AVAILABLE" || code === "BID_INGRESS_MARKET_MISMATCH" ||
    code === "BID_INGRESS_TEE_MISMATCH" || code === "FCC_TEE_IDENTITY_MISMATCH"
  ) return new HttpIngressError(409, code);
  if (
    code === "FCC_PROXY_REJECTED" || code === "FCC_PROXY_RESPONSE_INVALID" ||
    code === "FCC_PROXY_ACTION_INVALID" || code === "FCC_PROXY_ACTION_MISMATCH"
  ) return new HttpIngressError(502, "FCC_PROXY_RESPONSE_INVALID");
  if (code === "FCC_PROXY_RESULT_PENDING") return new HttpIngressError(202, code);
  if (code === "FCC_PROXY_UNAVAILABLE") return new HttpIngressError(503, code);
  return new HttpIngressError(503, "FLARE_INGRESS_UNAVAILABLE");
}

function requestPath(request: IncomingMessage): string {
  try {
    const parsed = new URL(request.url ?? "", "http://relay.invalid");
    if (parsed.search !== "" || parsed.hash !== "") throw new Error("query rejected");
    return parsed.pathname;
  } catch {
    throw new HttpIngressError(404, "NOT_FOUND");
  }
}

export function createFlareIngressHandler(
  gateway: PublicIngressGateway,
  webOrigin: string,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const limiter = new FixedWindowRateLimiter();
  return async (request, response) => {
    const origin = scalarHeader(request.headers.origin);
    setPublicHeaders(response, origin, webOrigin);
    try {
      const path = requestPath(request);
      const machineMatch = machineRoute.exec(path);
      const resultMatch = resultRoute.exec(path);
      const knownRoute = machineMatch !== null || resultMatch !== null || path === "/flare/ingress/bids" || path === healthRoute;
      if (request.method === "OPTIONS" && knownRoute) {
        if (origin !== webOrigin) throw new HttpIngressError(403, "ORIGIN_NOT_ALLOWED");
        response.statusCode = 204;
        response.setHeader(
          "Access-Control-Allow-Methods",
          machineMatch || resultMatch || path === healthRoute ? "GET, OPTIONS" : "POST, OPTIONS",
        );
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setHeader("Access-Control-Max-Age", "600");
        response.end();
        return;
      }
      if (knownRoute && !limiter.allow(request.socket.remoteAddress ?? "unknown")) {
        throw new HttpIngressError(429, "RATE_LIMITED");
      }
      if (request.method === "GET" && machineMatch !== null) {
        const tenderId = BigInt(machineMatch[1]);
        const machines = await gateway.machineKeys(tenderId);
        json(response, 200, {
          schemaVersion: 1,
          tenderId: tenderId.toString(),
          machines: machines.map(({ teeId, fingerprint, publicKey }) => ({
            teeId,
            fingerprint,
            publicKey,
          })),
        });
        return;
      }
      if (request.method === "GET" && resultMatch !== null) {
        const result = await gateway.result(
          BigInt(resultMatch[1]),
          Number(resultMatch[2]),
          resultMatch[3] as `0x${string}`,
        );
        json(response, 200, {
          schemaVersion: 1,
          status: "ready",
          actionId: result.actionId,
          teeId: result.teeId,
          data: result.data,
          expiresAt: result.expiresAt.toString(),
        });
        return;
      }
      if (request.method === "GET" && path === healthRoute) {
        const health = gateway.health
          ? await gateway.health()
          : {
            status: "ok",
            service: "flare-quorum-ingress",
            chainId: 114,
            schemaVersion: 1,
          };
        json(response, 200, health);
        return;
      }
      if (request.method === "POST" && path === "/flare/ingress/bids") {
        const accepted = await gateway.submit(parseFlareBidIngressRequest(await jsonBody(request)));
        json(response, 202, {
          schemaVersion: 1,
          actionId: accepted.actionId,
          teeId: accepted.teeId,
          expiresAt: accepted.expiresAt.toString(),
        });
        return;
      }
      throw new HttpIngressError(404, "NOT_FOUND");
    } catch (error) {
      const failure = mappedError(error);
      if (!response.headersSent) json(response, failure.status, { error: failure.code });
      else response.destroy();
    }
  };
}

export function createFlareIngressServer(
  gateway: PublicIngressGateway,
  webOrigin: string,
): Server {
  const handler = createFlareIngressHandler(gateway, webOrigin);
  return createServer((request, response) => {
    void handler(request, response);
  });
}

export interface FlareIngressMachineResponse {
  schemaVersion: 1;
  tenderId: string;
  machines: readonly {
    teeId: Address;
    fingerprint: `0x${string}`;
    publicKey: { x: `0x${string}`; y: `0x${string}` };
  }[];
}
