import assert from "node:assert/strict";
import test from "node:test";
import { isCoston2FlareDeployment, veilBidFlareMarketAbi } from "../src/index.ts";

test("Flare bindings expose only the planned Coston2 ABI", () => {
  assert.ok(Array.isArray(veilBidFlareMarketAbi));
  assert.ok(veilBidFlareMarketAbi.some((item) => item.type === "event" && item.name === "TenderAwarded"));
  assert.equal(isCoston2FlareDeployment({ chainId: 114, status: "planned" }), true);
  assert.equal(isCoston2FlareDeployment({ chainId: 1, status: "verified" }), false);
});
