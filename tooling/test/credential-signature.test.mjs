import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCredentialSignature } from "../flare/credential-signature.mjs";

const body = "11".repeat(64);

test("normalizes wallet recovery bytes for go-ethereum credential verification", () => {
  assert.equal(normalizeCredentialSignature(`0x${body}1b`), `0x${body}00`);
  assert.equal(normalizeCredentialSignature(`0x${body}1c`), `0x${body}01`);
  assert.equal(normalizeCredentialSignature(`0x${body}00`), `0x${body}00`);
  assert.equal(normalizeCredentialSignature(`0x${body}01`), `0x${body}01`);
});

test("rejects malformed or unsupported credential signatures", () => {
  assert.throws(() => normalizeCredentialSignature("0x12"), /INVALID_CREDENTIAL_SIGNATURE/);
  assert.throws(
    () => normalizeCredentialSignature(`0x${body}02`),
    /INVALID_CREDENTIAL_SIGNATURE_RECOVERY/,
  );
});
