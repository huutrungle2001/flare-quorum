import assert from "node:assert/strict";
import test from "node:test";
import { isCoston2FlareDeployment, veilBidFlareMarketAbi } from "../dist/index.js";

test("Flare bindings expose only the planned Coston2 ABI", () => {
  assert.ok(Array.isArray(veilBidFlareMarketAbi));
  assert.ok(veilBidFlareMarketAbi.some((item) => item.type === "event" && item.name === "TenderAwarded"));
  const getTender = veilBidFlareMarketAbi.find((item) => item.type === "function" && item.name === "getTender");
  assert.equal(getTender?.type, "function");
  assert.equal((getTender?.outputs?.[0] as { components?: readonly { name?: string }[] })?.components?.some((component) => component.name === "resultExpiry"), true);
  assert.equal(isCoston2FlareDeployment({ chainId: 114, status: "planned" }), true);
  assert.equal(isCoston2FlareDeployment({ chainId: 1, status: "verified" }), false);
});
