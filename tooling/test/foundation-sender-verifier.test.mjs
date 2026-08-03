import assert from "node:assert/strict";
import test from "node:test";
import { patchSingleAddressImmutables } from "../flare/foundation-sender-verifier.mjs";

test("patches every 32-byte immutable reference without changing runtime length", () => {
  const bytecode = `0x${"11".repeat(96)}`;
  const patched = patchSingleAddressImmutables(bytecode, {
    first: [{ start: 0, length: 32 }],
    second: [{ start: 64, length: 32 }],
  }, "0x1000000000000000000000000000000000000001");
  const replacement = `${"00".repeat(12)}1000000000000000000000000000000000000001`;
  assert.equal(patched.length, bytecode.length);
  assert.equal(patched.slice(2, 66), replacement);
  assert.equal(patched.slice(130, 194), replacement);
});

test("rejects missing and truncated immutable metadata", () => {
  assert.throws(() => patchSingleAddressImmutables("0x11", {}, "0x1000000000000000000000000000000000000001"), /IMMUTABLE_REFERENCES_MISSING/);
  assert.throws(() => patchSingleAddressImmutables("0x11", { bad: [{ start: 0, length: 20 }] }, "0x1000000000000000000000000000000000000001"), /INVALID_IMMUTABLE_REFERENCE/);
});
