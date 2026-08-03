import assert from "node:assert/strict";
import test from "node:test";
import {
  compareMarketRuntime,
  maskImmutableRuntime,
} from "../flare/market-runtime-verifier.mjs";

const artifact = {
  deployedBytecode: {
    object: `0x6001${"00".repeat(32)}6002${"00".repeat(32)}6003`,
    immutableReferences: {
      first: [{ start: 2, length: 32 }],
      second: [{ start: 36, length: 32 }],
    },
  },
};

test("masks all compiler-declared immutable slots before logic comparison", () => {
  const live = `0x6001${"11".repeat(32)}6002${"22".repeat(32)}6003`;
  const comparison = compareMarketRuntime(artifact, live);
  assert.equal(comparison.sizeMatches, true);
  assert.equal(comparison.logicMatches, true);
  assert.notEqual(comparison.runtimeHash, comparison.maskedRuntimeHash);
});

test("rejects logic drift outside immutable slots and malformed metadata", () => {
  const drifted = `0x6001${"11".repeat(32)}6102${"22".repeat(32)}6003`;
  assert.equal(compareMarketRuntime(artifact, drifted).logicMatches, false);
  assert.throws(() => maskImmutableRuntime("0x6001", {}), /IMMUTABLE_REFERENCES_MISSING/);
  assert.throws(
    () => maskImmutableRuntime("0x6001", { bad: [{ start: 1, length: 31 }] }),
    /INVALID_IMMUTABLE_REFERENCE/,
  );
});
