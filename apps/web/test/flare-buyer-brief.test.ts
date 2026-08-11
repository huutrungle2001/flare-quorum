import { afterEach, describe, expect, it } from "vitest";
import { hashFlareBuyerBrief } from "../src/flare/FlareBuyerWorkspace";
import {
  buyerPublicDraftStorageKey,
  readBuyerPublicDraft,
  saveBuyerPublicDraft,
} from "../src/flare/buyerPublicDraft";

const vendor = "0x1000000000000000000000000000000000000001" as const;

afterEach(() => sessionStorage.clear());

describe("Coston2 public Buyer Brief", () => {
  it("hashes the canonical public brief deterministically and excludes bid fields", () => {
    const input = {
      title: "Treasury reporting",
      category: "software" as const,
      objective: "Deliver a monthly XRP treasury report for the finance team.",
      acceptanceCriteria: "Report includes source links, totals, and a review checklist.",
      vendorQuestions: "Which source systems and review cadence do you support?",
      bidDeadline: 1_800_000_000n,
      approvedVendors: [vendor],
    };
    expect(hashFlareBuyerBrief(input)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashFlareBuyerBrief(input)).toBe(hashFlareBuyerBrief({ ...input, objective: `  ${input.objective}\r\n` }));
    expect(hashFlareBuyerBrief(input)).not.toBe(hashFlareBuyerBrief({ ...input, category: "research" }));
  });

  it("persists only the explicit public brief allowlist for the current tab", () => {
    saveBuyerPublicDraft({
      title: "Treasury reporting",
      category: "software",
      objective: "Deliver a monthly XRP treasury report for the finance team.",
      acceptanceCriteria: "Report includes source links and totals.",
      vendorQuestions: "Which systems do you support?",
      ceiling: "1.5",
      vendors: [vendor],
      deadlineMinutes: "60",
      priceWeight: "60",
      deliveryWeight: "25",
      warrantyWeight: "15",
    });

    const raw = sessionStorage.getItem(buyerPublicDraftStorageKey) ?? "";
    expect(raw).not.toMatch(/bidPlaintext|ciphertext|credential|salt|signature/i);
    expect(readBuyerPublicDraft()).toMatchObject({
      schemaVersion: 1,
      title: "Treasury reporting",
      vendors: [vendor],
    });
  });

  it("rejects a draft record with any field outside the public allowlist", () => {
    sessionStorage.setItem(buyerPublicDraftStorageKey, JSON.stringify({
      schemaVersion: 1,
      title: "Treasury reporting",
      category: "software",
      objective: "A sufficiently long public objective.",
      acceptanceCriteria: "Public checks.",
      vendorQuestions: "",
      ceiling: "1",
      vendors: [vendor],
      deadlineMinutes: "30",
      priceWeight: "60",
      deliveryWeight: "25",
      warrantyWeight: "15",
      bidPlaintext: "must never be accepted",
    }));
    expect(readBuyerPublicDraft()).toBeNull();
  });
});
