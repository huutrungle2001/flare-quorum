import assert from "node:assert/strict";
import test from "node:test";
import { parseFlareFundingJob } from "../dist/flare-funding-job.js";

function fixture() {
  return {
    version: 1,
    xrplTransactionId: `0x${"11".repeat(32)}`,
    personalAccount: "0x1000000000000000000000000000000000000001",
    nonce: "7",
    walletId: 0,
    executorFeeUBA: "0",
    terms: {
      metadataHash: `0x${"22".repeat(32)}`,
      rulesHash: `0x${"33".repeat(32)}`,
      publicCeilingXrp: "1000000",
      bidDeadline: "2000000000",
      approvedVendors: ["0x2000000000000000000000000000000000000002"],
      extensionId: "65922",
      codeVersion: `0x${"44".repeat(32)}`,
      teeIds: [
        "0x3000000000000000000000000000000000000003",
        "0x4000000000000000000000000000000000000004",
        "0x5000000000000000000000000000000000000005",
      ],
      teeKeyFingerprints: [
        `0x${"55".repeat(32)}`,
        `0x${"66".repeat(32)}`,
        `0x${"77".repeat(32)}`,
      ],
      ftsoFeedId: "0x015852502f55534400000000000000000000000000",
    },
  };
}

test("parses a public-safe deterministic mint-and-fund job", () => {
  const parsed = parseFlareFundingJob(fixture());
  assert.equal(parsed.nonce, 7n);
  assert.equal(parsed.terms.publicCeilingXrp, 1_000_000n);
  assert.equal(parsed.terms.extensionId, 65_922n);
});

test("rejects unknown fields, JSON numbers for large integers, and duplicate TEEs", () => {
  assert.throws(
    () => parseFlareFundingJob({ ...fixture(), privateBid: "must-not-enter-job" }),
    /UNKNOWN_FLARE_FUNDING_JOB_FIELD/,
  );
  const unsafeNumber = fixture();
  unsafeNumber.nonce = 7;
  assert.throws(() => parseFlareFundingJob(unsafeNumber), /INVALID_SMART_ACCOUNT_NONCE/);
  const duplicate = fixture();
  duplicate.terms.teeIds[1] = duplicate.terms.teeIds[0];
  assert.throws(() => parseFlareFundingJob(duplicate), /INVALID_TEE_IDS/);
});
