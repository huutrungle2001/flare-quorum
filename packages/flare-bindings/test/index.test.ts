import assert from "node:assert/strict";
import test from "node:test";
import {
  coston2FlarePublicRelease,
  isCoston2FlareDeployment,
  veilBidFlareAwardReceiptAbi,
  veilBidFlareMarketAbi,
} from "../dist/index.js";

test("Flare bindings expose the Coston2 ABI and sanitized release facts", () => {
  assert.ok(Array.isArray(veilBidFlareMarketAbi));
  assert.ok(veilBidFlareMarketAbi.some((item) => item.type === "event" && item.name === "TenderAwarded"));
  const getTender = veilBidFlareMarketAbi.find((item) => item.type === "function" && item.name === "getTender");
  assert.equal(getTender?.type, "function");
  assert.equal((getTender?.outputs?.[0] as { components?: readonly { name?: string }[] })?.components?.some((component) => component.name === "resultExpiry"), true);
  assert.ok(veilBidFlareAwardReceiptAbi.some((item) => item.type === "function" && item.name === "getAward"));
  assert.equal(isCoston2FlareDeployment({ chainId: 114, status: "planned" }), true);
  assert.equal(isCoston2FlareDeployment({ chainId: 1, status: "verified" }), false);
  assert.equal(coston2FlarePublicRelease.status, "verified");
  assert.equal(coston2FlarePublicRelease.chainId, 114);
  assert.equal(coston2FlarePublicRelease.fcc.extensionId, "66011");
  assert.equal(coston2FlarePublicRelease.protocols.fdcHub.startsWith("0x"), true);
});
