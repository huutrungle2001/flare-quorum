import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createResilientSepoliaClient,
  defaultSepoliaRpcUrl,
  fallbackSepoliaRpcUrls,
  resolveSepoliaRpcUrls,
} from "../src/chain/sepoliaRpc";

describe("Sepolia RPC resilience", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a configured RPC first and includes independent fallbacks", () => {
    expect(resolveSepoliaRpcUrls("https://example.test/rpc")).toEqual([
      "https://example.test/rpc",
      defaultSepoliaRpcUrl,
      ...fallbackSepoliaRpcUrls,
    ]);
  });

  it("does not retry the same URL when the configured RPC is the default", () => {
    const urls = resolveSepoliaRpcUrls(` ${defaultSepoliaRpcUrl} `);
    expect(urls).toEqual([
      defaultSepoliaRpcUrl,
      ...fallbackSepoliaRpcUrls,
    ]);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("continues through the fallback list when the primary fetch fails", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = (input instanceof Request ? input.url : String(input))
        .replace(/\/$/, "");
      requestedUrls.push(url);
      if (url === defaultSepoliaRpcUrl) {
        throw new TypeError("Failed to fetch");
      }
      const request = JSON.parse(String(init?.body)) as { id: number };
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: "0xaa36a7",
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }));

    const client = createResilientSepoliaClient(defaultSepoliaRpcUrl);
    await expect(client.getChainId()).resolves.toBe(11_155_111);
    expect(requestedUrls.slice(0, 2)).toEqual([
      defaultSepoliaRpcUrl,
      fallbackSepoliaRpcUrls[0],
    ]);
  });
});
