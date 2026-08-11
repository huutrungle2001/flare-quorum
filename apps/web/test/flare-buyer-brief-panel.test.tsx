import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalFlarePublicBuyerBrief, hashFlarePublicBuyerBrief } from "@flarequorum/flare-bindings";
import { FlareBuyerBriefPanel } from "../src/flare/FlareBuyerBriefPanel";
import { clearFlarePublicBriefCache } from "../src/flare/flarePublicBriefRegistry";
import type { FlarePublicTender } from "../src/public-market/loadFlareMarket";

const brief = canonicalFlarePublicBuyerBrief({
  title: "Verified treasury reporting",
  category: "software",
  objective: "Deliver a monthly public XRP treasury report.",
  acceptanceCriteria: "Include source links, totals, and review checks.",
  vendorQuestions: "Which public sources will you use?",
  bidDeadline: 1_800_000_000n,
  approvedVendors: ["0x2000000000000000000000000000000000000002"],
});
const hash = hashFlarePublicBuyerBrief(brief);
const tender = { tenderId: 7n, metadataHash: hash } as FlarePublicTender;
const registryEnv = { VITE_FLARE_PUBLIC_BRIEF_URL: "https://briefs.example" };

afterEach(() => {
  cleanup();
  clearFlarePublicBriefCache();
  vi.unstubAllGlobals();
});

describe("verified public Buyer Brief panel", () => {
  it("automatically displays the public brief after matching metadataHash", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      metadataHash: hash,
      brief,
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    render(<FlareBuyerBriefPanel tender={tender} env={registryEnv} />);
    expect(screen.getByText("VERIFYING PUBLIC BRIEF…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: brief.title })).toBeInTheDocument();
    expect(screen.getByText(brief.objective)).toBeInTheDocument();
    expect(screen.getByText(brief.acceptanceCriteria)).toBeInTheDocument();
    expect(screen.getByText("BRIEF VERIFIED")).toBeInTheDocument();
  });

  it("never renders a mismatched registry brief", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      metadataHash: hash,
      brief: { ...brief, category: "research" },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    render(<FlareBuyerBriefPanel tender={tender} env={registryEnv} />);
    await waitFor(() => expect(screen.getByText("BRIEF VERIFICATION FAILED")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: brief.title })).toBeNull();
  });
});
