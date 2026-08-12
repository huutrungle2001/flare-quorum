import {
  hashFlarePublicBuyerBrief,
  parseFlarePublicBuyerBrief,
  type FlarePublicBuyerBrief,
} from "@flarequorum/flare-bindings";
import type { Hex } from "viem";

const requestTimeoutMs = 10_000;
const verifiedCache = new Map<string, FlarePublicBuyerBrief>();

export type FlarePublicBriefLoadState =
  | { status: "verified"; brief: FlarePublicBuyerBrief }
  | { status: "loading" | "missing" | "invalid" | "unavailable"; brief: null };

function registryUrl(env: Record<string, string | undefined> = import.meta.env): string {
  const value = (env.VITE_FLARE_PUBLIC_BRIEF_URL ?? env.VITE_FLARE_INGRESS_URL)?.trim();
  if (!value) throw new Error("FLARE_PUBLIC_BRIEF_REGISTRY_NOT_CONFIGURED");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("FLARE_PUBLIC_BRIEF_REGISTRY_URL_INVALID");
  }
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
  ) throw new Error("FLARE_PUBLIC_BRIEF_REGISTRY_URL_INVALID");
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function ingressUrl(env: Record<string, string | undefined>): string {
  const value = env.VITE_FLARE_INGRESS_URL?.trim();
  if (!value) throw new Error("FLARE_INGRESS_NOT_CONFIGURED");
  return registryUrl({ VITE_FLARE_PUBLIC_BRIEF_URL: value });
}

function metadataHash(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("INVALID_FLARE_PUBLIC_BRIEF_HASH");
  return value.toLowerCase() as Hex;
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function verifiedEnvelope(value: unknown, expectedHash: Hex): FlarePublicBuyerBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("FLARE_PUBLIC_BRIEF_RESPONSE_INVALID");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 || typeof candidate.metadataHash !== "string" ||
    candidate.metadataHash.toLowerCase() !== expectedHash.toLowerCase()
  ) throw new Error("FLARE_PUBLIC_BRIEF_RESPONSE_INVALID");
  const brief = parseFlarePublicBuyerBrief(candidate.brief);
  if (hashFlarePublicBuyerBrief(brief).toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error("FLARE_PUBLIC_BRIEF_VERIFICATION_FAILED");
  }
  return brief;
}

export async function loadFlarePublicBrief(
  value: Hex,
  env: Record<string, string | undefined> = import.meta.env,
): Promise<FlarePublicBriefLoadState> {
  const hash = metadataHash(value);
  const cached = verifiedCache.get(hash);
  if (cached) return { status: "verified", brief: cached };
  let response: Response;
  try {
    response = await request(`${registryUrl(env)}/flare/public-briefs/${hash}`, {
      headers: { accept: "application/json" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "FLARE_PUBLIC_BRIEF_REGISTRY_NOT_CONFIGURED") {
      return { status: "unavailable", brief: null };
    }
    return { status: "unavailable", brief: null };
  }
  if (response.status === 404) return { status: "missing", brief: null };
  if (!response.ok) return { status: "unavailable", brief: null };
  try {
    const brief = verifiedEnvelope(await response.json(), hash);
    verifiedCache.set(hash, brief);
    return { status: "verified", brief };
  } catch {
    return { status: "invalid", brief: null };
  }
}

export async function publishFlarePublicBrief(
  value: FlarePublicBuyerBrief,
  env: Record<string, string | undefined> = import.meta.env,
): Promise<{ metadataHash: Hex; brief: FlarePublicBuyerBrief }> {
  const brief = parseFlarePublicBuyerBrief(value);
  const hash = hashFlarePublicBuyerBrief(brief);
  let response: Response;
  try {
    response = await request(`${registryUrl(env)}/flare/public-briefs/${hash}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(brief),
    });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code.startsWith("FLARE_PUBLIC_BRIEF_REGISTRY_")) throw cause;
    throw new Error("FLARE_PUBLIC_BRIEF_REGISTRY_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new Error(response.status === 409
      ? "FLARE_PUBLIC_BRIEF_VERIFICATION_FAILED"
      : "FLARE_PUBLIC_BRIEF_REGISTRY_UNAVAILABLE");
  }
  let published: FlarePublicBuyerBrief;
  try {
    published = verifiedEnvelope(await response.json(), hash);
  } catch {
    throw new Error("FLARE_PUBLIC_BRIEF_VERIFICATION_FAILED");
  }
  verifiedCache.set(hash, published);
  return { metadataHash: hash, brief: published };
}

export async function assertFlareIngressReady(
  env: Record<string, string | undefined> = import.meta.env,
): Promise<void> {
  let response: Response;
  try {
    response = await request(`${ingressUrl(env)}/health`, {
      headers: { accept: "application/json" },
    });
  } catch {
    throw new Error("FLARE_INGRESS_NOT_READY");
  }
  if (!response.ok) throw new Error("FLARE_INGRESS_NOT_READY");
  try {
    const value = await response.json() as Record<string, unknown>;
    if (
      value.status !== "ok" ||
      value.chainId !== 114 ||
      value.schemaVersion !== 1 ||
      value.machineBindingsValid !== true
    ) throw new Error("FLARE_INGRESS_NOT_READY");
  } catch {
    throw new Error("FLARE_INGRESS_NOT_READY");
  }
}

export function clearFlarePublicBriefCache(): void {
  verifiedCache.clear();
}
