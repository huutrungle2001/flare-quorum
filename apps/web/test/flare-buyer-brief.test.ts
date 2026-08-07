import { describe, expect, it } from "vitest";
import { hashFlareBuyerBrief } from "../src/flare/FlareBuyerWorkspace";

const vendor = "0x1000000000000000000000000000000000000001" as const;

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
});
