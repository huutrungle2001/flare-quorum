import assert from "node:assert/strict";
import test from "node:test";

import { renderJudgeSummary } from "../scripts/summarize-judge-report.mjs";

test("judge health summary records public provenance without endpoint bodies", () => {
  const report = {
    status: "PASSED",
    live: {
      publicIdentifiers: {
        chainId: 114,
        checkpointBlock: 34000000,
        market: "0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC",
      },
      machineAvailability: [1, 2, 3].map(() => ({ availabilityStatus: "PASSED" })),
      endpointStatus: {
        web: { statusCode: 200, responseBody: "private-web-body" },
        ingress: { statusCode: 200, ciphertext: "private-ciphertext" },
      },
    },
  };
  const summary = renderJudgeSummary(
    report,
    "a".repeat(40),
    "b".repeat(64),
  );
  assert.match(summary, /Status: \*\*PASSED\*\*/);
  assert.match(summary, /Fresh release machines: `3\/3`/);
  assert.match(summary, /Source commit: `aaaaaaaaaaaa`/);
  assert.ok(summary.includes("Report SHA-256: `" + "b".repeat(64) + "`"));
  assert.doesNotMatch(summary, /private-web-body|private-ciphertext/);
});
