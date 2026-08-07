import assert from "node:assert/strict";
import test from "node:test";
import {
  parseFlareFundingCheckpoint,
  parseFlareFundingJob,
} from "../dist/flare-funding-job.js";

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
      scoringPolicy: {
        schemaVersion: 1,
        ceilingXrpMicros: "1000000",
        bidDeadline: "2000000000",
        allowXrp: true,
        allowUsd: true,
        ftsoFeedId: "0x015852502f55534400000000000000000000000000",
        maxDeliveryDays: 30,
        minWarrantyDays: 12,
        maxWarrantyDays: 36,
        priceWeightBps: 6000,
        deliveryWeightBps: 2500,
        warrantyWeightBps: 1500,
        requiredCredentials: [],
      },
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
    },
  };
}

test("parses a public-safe deterministic mint-and-fund job", () => {
  const parsed = parseFlareFundingJob(fixture());
  assert.equal(parsed.nonce, 7n);
  assert.equal(parsed.terms.scoringPolicy.ceilingXrpMicros, 1_000_000n);
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
  const invalidPolicy = fixture();
  invalidPolicy.terms.scoringPolicy.priceWeightBps = 5999;
  assert.throws(() => parseFlareFundingJob(invalidPolicy), /INVALID_FLARE_SCORING_POLICY/);
});

test("parses a delayed checkpoint and binds it to the original public job", () => {
  const checkpoint = {
    version: 1,
    kind: "flare-xrp-funding",
    job: fixture(),
    xrplFinality: {
      transactionId: `0x${"11".repeat(32)}`,
      transactionLedgerIndex: 100,
      validatedLedgerIndex: 102,
      confirmations: 3,
    },
    fdcRequestTransactionHash: `0x${"aa".repeat(32)}`,
    fdcVotingRound: "55",
    fdcAbiEncodedRequest: "0x1234",
    directMintingTransactionHash: `0x${"bb".repeat(32)}`,
    directMintingBlock: "200",
    userOperationCommitment: `0x${"cc".repeat(32)}`,
    paymentAmountUBA: "1100025",
    executionAllowedAt: "300",
  };
  const parsed = parseFlareFundingCheckpoint(checkpoint);
  assert.equal(parsed.fdcVotingRound, 55n);
  assert.equal(parsed.paymentAmountUBA, 1_100_025n);
  assert.equal(parsed.job.nonce, 7n);
  assert.equal(parsed.xrplFinality.confirmations, 3);
});

test("rejects checkpoint transaction drift and private-shaped fields", () => {
  const checkpoint = {
    version: 1,
    kind: "flare-xrp-funding",
    job: fixture(),
    xrplFinality: {
      transactionId: `0x${"22".repeat(32)}`,
      transactionLedgerIndex: 100,
      validatedLedgerIndex: 102,
      confirmations: 3,
    },
    fdcRequestTransactionHash: `0x${"aa".repeat(32)}`,
    fdcVotingRound: "55",
    fdcAbiEncodedRequest: "0x1234",
    directMintingTransactionHash: `0x${"bb".repeat(32)}`,
    directMintingBlock: "200",
    userOperationCommitment: `0x${"cc".repeat(32)}`,
    paymentAmountUBA: "1100025",
    executionAllowedAt: "300",
  };
  assert.throws(
    () => parseFlareFundingCheckpoint(checkpoint),
    /XRPL_CHECKPOINT_TRANSACTION_MISMATCH/,
  );
  assert.throws(
    () => parseFlareFundingCheckpoint({ ...checkpoint, privateKey: "never" }),
    /UNKNOWN_FLARE_FUNDING_CHECKPOINT_FIELD/,
  );
});
