import assert from "node:assert/strict";
import test from "node:test";
import { roundMilliseconds, summarizeIngressTimings } from "../flare/ingress-benchmarks.mjs";

test("summarizes public-safe ingress timings without changing sample identity", () => {
  const result = summarizeIngressTimings([
    { machine: 1, directResponseMs: 2.3456, resultResponseMs: 5.2, endToEndMs: 7.5456 },
    { machine: 2, directResponseMs: 3, resultResponseMs: 4, endToEndMs: 7 },
  ]);
  assert.equal(result.sampleCount, 2);
  assert.deepEqual(result.samples, [
    { machine: 1, directResponseMs: 2.346, resultResponseMs: 5.2, endToEndMs: 7.546 },
    { machine: 2, directResponseMs: 3, resultResponseMs: 4, endToEndMs: 7 },
  ]);
  assert.deepEqual(result.endToEnd, { minMs: 7, maxMs: 7.546, averageMs: 7.273 });
});

test("rejects malformed or negative latency samples", () => {
  assert.throws(() => summarizeIngressTimings([]), /INGRESS_LATENCY_SAMPLES_INVALID/);
  assert.throws(() => summarizeIngressTimings([
    { machine: 1, directResponseMs: -1, resultResponseMs: 2, endToEndMs: 3 },
  ]), /INGRESS_DIRECT_LATENCY_INVALID/);
  assert.throws(() => roundMilliseconds(Number.NaN), /INGRESS_LATENCY_VALUE_INVALID/);
});
