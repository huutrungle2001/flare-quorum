import assert from "node:assert/strict";
import test from "node:test";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  bidReceiptDigest,
  directBidInstruction,
  encryptPrivateBidForTee,
  privateBidCommitment,
  prepareBidReceiptSet,
  teeIdentityFromPublicKey,
  teePublicKeyFingerprint,
  type FlarePrivateBidSubmission,
} from "../dist/private-bid.js";
import { coston2XrpUsdFeedId } from "../dist/smart-account.js";

const recipientPublicBytes = secp256k1.getPublicKey(hexToBytes(`0x${"44".repeat(32)}`), false);
const recipientPublicKey = {
  x: bytesToHex(recipientPublicBytes.slice(1, 33)),
  y: bytesToHex(recipientPublicBytes.slice(33, 65)),
};

const canonicalBid: FlarePrivateBidSubmission = {
  schemaVersion: 1,
  chainId: 114n,
  market: "0x1000000000000000000000000000000000000001",
  extensionId: 65_537n,
  codeVersion: `0x${"11".repeat(32)}`,
  tenderId: 42n,
  vendor: "0x2000000000000000000000000000000000000002",
  submissionNonce: 7n,
  rules: {
    schemaVersion: 1,
    ceilingXrpMicros: 1_000n,
    bidDeadline: 1_700_000_000n,
    allowXrp: true,
    allowUsd: true,
    ftsoFeedId: coston2XrpUsdFeedId,
    maxDeliveryDays: 30,
    minWarrantyDays: 12,
    maxWarrantyDays: 36,
    priceWeightBps: 6_000,
    deliveryWeightBps: 2_500,
    warrantyWeightBps: 1_500,
    requiredCredentials: [],
  },
  receiptExpiry: 1_700_000_000n,
  quoteCurrency: 0,
  priceMicros: 400n,
  deliveryDays: 5,
  warrantyDays: 24,
  credentials: [],
  salt: `0x${"77".repeat(32)}`,
};

test("private bid commitment matches the canonical Go vector", () => {
  assert.equal(
    privateBidCommitment(canonicalBid),
    "0x982631d2fe15e058d0bac43a2cbfd3c0cb0c77166b499fd6a992e4690702a2dc",
  );
  assert.throws(
    () => privateBidCommitment({ ...canonicalBid, quoteCurrency: 9 as 0 }),
    /INVALID_PRIVATE_BID/,
  );
  assert.throws(
    () => privateBidCommitment({ ...canonicalBid, deliveryDays: 31 }),
    /INVALID_PRIVATE_BID/,
  );
});

test("TEE key identity and contract fingerprint match the Go/Solidity representation", () => {
  assert.deepEqual(recipientPublicKey, {
    x: "0x2c0b7cf95324a07d05398b240174dc0c2be444d96b159aa6c7f7b1e668680991",
    y: "0xae31a9c671a36543f46cea8fce6984608aa316aa0472a7eed08847440218cb2f",
  });
  assert.equal(teeIdentityFromPublicKey(recipientPublicKey), "0x7564105E977516C53bE337314c7E53838967bDaC");
  assert.equal(teePublicKeyFingerprint(recipientPublicKey), "0x6ab1757c2549dcaafef121277564105e977516c53be337314c7e53838967bdac");
  assert.throws(
    () => teeIdentityFromPublicKey({ x: `0x${"00".repeat(32)}`, y: `0x${"00".repeat(32)}` }),
    /INVALID_TEE_PUBLIC_KEY/,
  );
});

test("browser ECIES ciphertext decrypts with tee-node's go-ethereum path", async () => {
  const ciphertext = await encryptPrivateBidForTee(
    new TextEncoder().encode("VEILBID_ECIES_VECTOR_V1"),
    recipientPublicKey,
    {
      ephemeralPrivateKey: `0x${"11".repeat(32)}`,
      iv: `0x${"22".repeat(16)}`,
    },
  );
  assert.equal(
    ciphertext,
    "0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c122222222222222222222222222222222d76c006c8f0949a5f57117854f500d53910a263492072ba1db807ddaf0957c1b10d2673c4b90231c8c1301e1784b7f53e0398e964ce685",
  );
  assert.deepEqual(directBidInstruction(ciphertext), {
    opType: "0x5645494c4249445f424944000000000000000000000000000000000000000000",
    opCommand: "0x5355424d49545f56310000000000000000000000000000000000000000000000",
    message: ciphertext,
  });
});

test("receipt digest remains compatible with the Go/Solidity golden vector", () => {
  assert.equal(bidReceiptDigest({
    schemaVersion: 1,
    chainId: 114n,
    market: "0x2000000000000000000000000000000000000002",
    extensionId: 65_537n,
    codeVersion: "0x0000000000000000000000000000000000000000000000000000000000001234",
    tenderId: 42n,
    vendor: "0x1000000000000000000000000000000000000001",
    submissionNonce: 7n,
    rulesHash: "0x57c12e9878a9218766f316c084784bfd97b102512847a30f999d32a2c8a5e444",
    plaintextCommitment: "0xb587b30b0b7743bc2e8179defb8431dac5d71cc616ef21909771cd785738c6aa",
    teeId: "0x3000000000000000000000000000000000000003",
    expiry: 900n,
    signature: "0x010203",
  }), "0xb22f48371a8f6813be92a51d188dee114c4f188a6d7f201e3712ae8878fed658");
});

test("three TEE receipts are signature-checked and normalized to frozen order", async () => {
  const accounts = ["11", "22", "33"].map((byte) => privateKeyToAccount(`0x${byte.repeat(32)}`));
  const context = {
    market: canonicalBid.market,
    extensionId: canonicalBid.extensionId,
    codeVersion: canonicalBid.codeVersion,
    tenderId: canonicalBid.tenderId,
    rulesHash: "0x8969aa4d8ee1fde2fbf813214484c245419fd278b1b791fe05997813315f8cb2",
    vendor: canonicalBid.vendor,
    submissionNonce: canonicalBid.submissionNonce,
    plaintextCommitment: privateBidCommitment(canonicalBid),
    bidDeadline: canonicalBid.rules.bidDeadline,
    teeIds: accounts.map((account) => account.address) as [typeof accounts[0]["address"], typeof accounts[0]["address"], typeof accounts[0]["address"]],
  };
  const receipts = await Promise.all(accounts.map(async (account) => {
    const receipt = {
      schemaVersion: 1,
      chainId: 114n,
      market: context.market,
      extensionId: context.extensionId,
      codeVersion: context.codeVersion,
      tenderId: context.tenderId,
      vendor: context.vendor,
      submissionNonce: context.submissionNonce,
      rulesHash: context.rulesHash,
      plaintextCommitment: context.plaintextCommitment,
      teeId: account.address,
      expiry: context.bidDeadline,
      signature: "0x" as const,
    };
    return {
      ...receipt,
      signature: await account.signMessage({ message: { raw: bidReceiptDigest(receipt) } }),
    };
  }));
  const prepared = await prepareBidReceiptSet([receipts[2], receipts[0], receipts[1]], context);
  assert.deepEqual(prepared.receipts.map((receipt) => receipt.teeId), context.teeIds);
  assert.equal(prepared.signatures.length, 3);
  await assert.rejects(
    prepareBidReceiptSet([{ ...receipts[0], plaintextCommitment: `0x${"99".repeat(32)}` }, receipts[1], receipts[2]], context),
    /INVALID_BID_RECEIPT_SET/,
  );
  await assert.rejects(
    prepareBidReceiptSet([receipts[0], { ...receipts[1], signature: receipts[0].signature }, receipts[2]], context),
    /INVALID_BID_RECEIPT_SIGNATURE/,
  );
});
