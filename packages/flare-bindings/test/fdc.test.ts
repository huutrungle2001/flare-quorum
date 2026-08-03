import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";
import {
  assetManagerDirectMintingAbi,
  assertXrpPaymentProof,
  encodeExecuteDirectMintingWithData,
  type XrpPaymentProof,
} from "../src/fdc.ts";

const txId = `0x${"11".repeat(32)}` as const;
const attestationType = `0x${"22".repeat(32)}` as const;
const sourceId = `0x${"33".repeat(32)}` as const;
const memoData = `0x${"fe030000000000000019"}${"44".repeat(32)}` as const;
const owner = "0x1000000000000000000000000000000000000001" as const;

function proofFixture(): XrpPaymentProof {
  return {
    merkleProof: [`0x${"55".repeat(32)}`],
    data: {
      attestationType,
      sourceId,
      votingRound: 700n,
      lowestUsedTimestamp: 1_700_000_000n,
      requestBody: { transactionId: txId, proofOwner: owner },
      responseBody: {
        blockNumber: 12_345n,
        blockTimestamp: 1_700_000_001n,
        sourceAddress: "rTestSource",
        sourceAddressHash: `0x${"66".repeat(32)}`,
        receivingAddressHash: `0x${"77".repeat(32)}`,
        intendedReceivingAddressHash: `0x${"00".repeat(32)}`,
        spentAmount: 1_000_000n,
        intendedSpentAmount: 1_000_000n,
        receivedAmount: 999_000n,
        intendedReceivedAmount: 999_000n,
        hasMemoData: true,
        firstMemoData: memoData,
        hasDestinationTag: false,
        destinationTag: 0n,
        status: 0,
      },
    },
  };
}

test("encodes the official nested IXRPPayment proof without changing user-op bytes", () => {
  const proof = proofFixture();
  const userOperationData = `0x${"88".repeat(32)}` as const;
  const data = encodeExecuteDirectMintingWithData(proof, userOperationData);
  const decoded = decodeFunctionData({ abi: assetManagerDirectMintingAbi, data });
  assert.equal(decoded.functionName, "executeDirectMintingWithData");
  assert.equal(decoded.args[1], userOperationData);
  assert.equal(decoded.args[0].data.requestBody.transactionId, txId);
  assert.equal(decoded.args[0].data.responseBody.firstMemoData, memoData);
});

test("rejects a proof with wrong memo, destination tag, or domain", () => {
  const proof = proofFixture();
  const expected = {
    attestationType,
    sourceId,
    transactionId: txId,
    proofOwner: owner,
    memoData,
    minimumReceivedAmount: 900_000n,
  } as const;
  assert.doesNotThrow(() => assertXrpPaymentProof(proof, expected));

  const wrongMemo = structuredClone(proof);
  wrongMemo.data.responseBody.firstMemoData = "0x1234";
  assert.throws(() => assertXrpPaymentProof(wrongMemo, expected), /INVALID_XRP_PAYMENT/);

  const tagged = structuredClone(proof);
  tagged.data.responseBody.hasDestinationTag = true;
  assert.throws(() => assertXrpPaymentProof(tagged, expected), /INVALID_XRP_PAYMENT/);

  const wrongDomain = structuredClone(proof);
  wrongDomain.data.sourceId = `0x${"99".repeat(32)}`;
  assert.throws(() => assertXrpPaymentProof(wrongDomain, expected), /FDC_PAYMENT_DOMAIN_MISMATCH/);

  assert.throws(
    () => assertXrpPaymentProof(proof, { ...expected, votingRound: 701n }),
    /FDC_VOTING_ROUND_MISMATCH/,
  );
});

test("rejects underfunded payment and empty Merkle proof", () => {
  const expected = {
    attestationType,
    sourceId,
    transactionId: txId,
    proofOwner: owner,
    memoData,
    minimumReceivedAmount: 1_000_001n,
  } as const;
  assert.throws(() => assertXrpPaymentProof(proofFixture(), expected), /FDC_PAYMENT_UNDERFUNDED/);

  const empty = proofFixture();
  empty.merkleProof = [];
  assert.throws(() => assertXrpPaymentProof(empty, { ...expected, minimumReceivedAmount: 1n }), /INVALID_FDC_PROOF/);
});
