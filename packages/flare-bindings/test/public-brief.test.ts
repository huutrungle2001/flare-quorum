import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalFlarePublicBuyerBrief,
  hashFlarePublicBuyerBrief,
  parseFlarePublicBuyerBrief,
} from "../dist/public-brief.js";

const vendor = "0x2000000000000000000000000000000000000002";
const input = {
  title: "  Coston2 reporting service  ",
  category: "software" as const,
  objective: "Deliver a public Coston2 reporting dashboard.\r\n",
  acceptanceCriteria: "All public acceptance checks must pass.",
  vendorQuestions: "Describe the proposed delivery plan.",
  bidDeadline: 1_800_000_000n,
  approvedVendors: [vendor],
};

test("public Buyer Brief canonicalization preserves the existing metadata hash domain", () => {
  const brief = canonicalFlarePublicBuyerBrief(input);
  assert.equal(brief.title, "Coston2 reporting service");
  assert.equal(brief.objective, "Deliver a public Coston2 reporting dashboard.");
  assert.equal(brief.bidDeadline, "1800000000");
  assert.equal(brief.approvedVendors[0], vendor.toLowerCase());
  assert.match(hashFlarePublicBuyerBrief(brief), /^0x[0-9a-f]{64}$/);
  assert.equal(hashFlarePublicBuyerBrief(input), hashFlarePublicBuyerBrief(brief));
});

test("public Buyer Brief parsing rejects extra and bid-shaped fields", () => {
  const brief = canonicalFlarePublicBuyerBrief(input);
  assert.throws(
    () => parseFlarePublicBuyerBrief({ ...brief, priceMicros: "100" }),
    /INVALID_FLARE_PUBLIC_BRIEF/,
  );
  assert.throws(
    () => parseFlarePublicBuyerBrief({ ...brief, approvedVendors: [] }),
    /INVALID_FLARE_PUBLIC_BRIEF/,
  );
});
