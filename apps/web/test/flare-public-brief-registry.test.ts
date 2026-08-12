import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalFlarePublicBuyerBrief, hashFlarePublicBuyerBrief } from "@flarequorum/flare-bindings";
import {
  assertFlareIngressReady,
  clearFlarePublicBriefCache,
  loadFlarePublicBrief,
  publishFlarePublicBrief,
} from "../src/flare/flarePublicBriefRegistry";

const brief = canonicalFlarePublicBuyerBrief({
  title: "Verified public procurement brief",
  category: "research",
  objective: "Deliver the requested public research procurement outcome.",
  acceptanceCriteria: "Meet every published acceptance criterion.",
  vendorQuestions: "Describe the proposed research method.",
  bidDeadline: 1_800_000_000n,
  approvedVendors: ["0x2000000000000000000000000000000000000002"],
});
const hash = hashFlarePublicBuyerBrief(brief);
const env = {
  VITE_FLARE_PUBLIC_BRIEF_URL: "https://briefs.example",
  VITE_FLARE_INGRESS_URL: "https://ingress.example",
};

afterEach(() => {
  clearFlarePublicBriefCache();
  vi.unstubAllGlobals();
});

describe("Flare public Buyer Brief registry client", () => {
  it("publishes and verifies the content-addressed brief", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, metadataHash: hash, brief }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(publishFlarePublicBrief(brief, env)).resolves.toEqual({ metadataHash: hash, brief });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://briefs.example/flare/public-briefs/${hash}`,
      expect.objectContaining({ method: "PUT", credentials: "omit", redirect: "error" }),
    );
  });

  it("fails closed for missing and hash-mismatched content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await expect(loadFlarePublicBrief(hash, env)).resolves.toEqual({ status: "missing", brief: null });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      metadataHash: hash,
      brief: { ...brief, category: "software" },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(loadFlarePublicBrief(hash, env)).resolves.toEqual({ status: "invalid", brief: null });
  });

  it("requires machine-bound ingress health before buyer funding starts", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "ok",
      service: "flare-quorum-ingress",
      chainId: 114,
      schemaVersion: 1,
      machineBindingsValid: true,
      tenderId: "23",
      tenderStatus: "Awarded",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(assertFlareIngressReady(env)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ingress.example/health",
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok",
      chainId: 114,
      schemaVersion: 1,
      machineBindingsValid: false,
    }), { status: 200 })));
    await expect(assertFlareIngressReady(env)).rejects.toThrow("FLARE_INGRESS_NOT_READY");
  });
});
