import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, hashMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  fccActionResultHash,
  fccSigningDigest,
  foundationBindingHash,
  parseFccActionResponse,
  teeActionResultPrefix,
  veilBidFoundationOpType,
  veilBidFoundationPingV1OpCommand,
  veilBidSelectionOpType,
  veilBidSelectV1OpCommand,
  verifyFoundationActionResponse,
  verifySelectionActionResponse,
} from "../src/fcc-result.ts";

const selectionResultParameter = [{
  type: "tuple",
  components: [
    { name: "schemaVersion", type: "uint16" }, { name: "chainId", type: "uint256" },
    { name: "market", type: "address" }, { name: "extensionId", type: "uint256" },
    { name: "codeVersion", type: "bytes32" }, { name: "tenderId", type: "uint256" },
    { name: "rulesHash", type: "bytes32" }, { name: "orderedBidRoot", type: "bytes32" },
    { name: "quorumBitmap", type: "uint8" }, { name: "ftsoFeedId", type: "bytes21" },
    { name: "ftsoValue", type: "uint256" }, { name: "ftsoDecimals", type: "int8" },
    { name: "ftsoTimestamp", type: "uint64" }, { name: "closeBlock", type: "uint64" },
    { name: "winnerBidId", type: "uint256" }, { name: "winner", type: "address" },
    { name: "winningAmountXrp", type: "uint256" }, { name: "resultNonce", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
}] as const;

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const actionId = `0x${"22".repeat(32)}` as const;
const selection = {
  schemaVersion: 1,
  chainId: 114n,
  market: "0x1000000000000000000000000000000000000001",
  extensionId: 65_537n,
  codeVersion: `0x${"33".repeat(32)}`,
  tenderId: 42n,
  rulesHash: `0x${"44".repeat(32)}`,
  orderedBidRoot: `0x${"55".repeat(32)}`,
  quorumBitmap: 7,
  ftsoFeedId: "0x015852502f55534400000000000000000000000000",
  ftsoValue: 250_000n,
  ftsoDecimals: 5,
  ftsoTimestamp: 1_700_000_000n,
  closeBlock: 33_500_010n,
  winnerBidId: 1n,
  winner: "0x2000000000000000000000000000000000000002",
  winningAmountXrp: 400_000n,
  resultNonce: 3n,
  expiry: 2_000n,
} as const;

test("uses Solidity bytes32 operation identifiers instead of hashes", () => {
  assert.equal(
    veilBidSelectionOpType,
    "0x5645494c4249445f53454c454354494f4e000000000000000000000000000000",
  );
  assert.equal(
    veilBidSelectV1OpCommand,
    "0x53454c4543545f56310000000000000000000000000000000000000000000000",
  );
});

const foundationRequest = {
  schemaVersion: 1,
  chainId: 114n,
  market: "0x1000000000000000000000000000000000000001" as const,
  requestNonce: `0x${"22".repeat(32)}` as const,
  payloadHash: `0x${"33".repeat(32)}` as const,
};

test("verifies a domain-bound foundation action and rejects a changed request", async () => {
  const data = encodeAbiParameters([{
    type: "tuple",
    components: [
      { name: "schemaVersion", type: "uint16" }, { name: "chainId", type: "uint256" },
      { name: "market", type: "address" }, { name: "requestNonce", type: "bytes32" },
      { name: "payloadHash", type: "bytes32" }, { name: "bindingHash", type: "bytes32" },
    ],
  }], [{ ...foundationRequest, bindingHash: foundationBindingHash(foundationRequest) }]);
  const result = {
    id: `0x${"44".repeat(32)}` as const,
    submissionTag: "submit" as const,
    status: 1,
    log: "ok",
    opType: veilBidFoundationOpType,
    opCommand: veilBidFoundationPingV1OpCommand,
    additionalResultStatus: "0x" as const,
    version: "v0.2.2",
    data,
  };
  const digest = fccSigningDigest(teeActionResultPrefix, 114n, fccActionResultHash(result));
  const signature = await account.sign({ hash: hashMessage({ raw: digest }) });
  const response = { result, signature, proxySignature: signature };
  const verified = await verifyFoundationActionResponse(response, {
    actionId: result.id,
    chainId: 114n,
    allowedTeeIds: [account.address],
    expectedVersion: "v0.2.2",
    expectedRequest: foundationRequest,
  });
  assert.equal(verified.teeId, account.address);
  assert.equal(verified.result.bindingHash, foundationBindingHash(foundationRequest));
  await assert.rejects(
    verifyFoundationActionResponse(response, {
      actionId: result.id,
      chainId: 114n,
      allowedTeeIds: [account.address],
      expectedRequest: { ...foundationRequest, payloadHash: `0x${"55".repeat(32)}` },
    }),
    /FCC_FOUNDATION_REQUEST_MISMATCH/,
  );
});

async function responseFixture() {
  const data = encodeAbiParameters(selectionResultParameter, [selection]);
  const result = {
    id: actionId,
    submissionTag: "threshold" as const,
    status: 1,
    log: "ok",
    opType: veilBidSelectionOpType,
    opCommand: veilBidSelectV1OpCommand,
    additionalResultStatus: "0x" as const,
    version: "0.2.0",
    data,
  };
  const digest = fccSigningDigest(teeActionResultPrefix, 114n, fccActionResultHash(result));
  const signature = await account.sign({ hash: hashMessage({ raw: digest }) });
  return { result, signature, proxySignature: signature };
}

test("verifies the pinned FCC ActionResponse and decodes canonical selection data", async () => {
  const response = await responseFixture();
  const verified = await verifySelectionActionResponse(response, {
    actionId,
    chainId: 114n,
    allowedTeeIds: [account.address],
    expectedVersion: "0.2.0",
  });
  assert.equal(verified.teeId, account.address);
  assert.equal(verified.result.tenderId, 42n);
  assert.equal(verified.result.winner, selection.winner);
  assert.equal(verified.result.winningAmountXrp, 400_000n);
});

test("rejects a changed result, failed status, or non-final submission tag", async () => {
  const changed = await responseFixture();
  changed.result.data = `${changed.result.data.slice(0, -2)}00` as `0x${string}`;
  await assert.rejects(
    verifySelectionActionResponse(changed, { actionId, chainId: 114n, allowedTeeIds: [account.address] }),
    /FCC_TEE_NOT_FROZEN_FOR_TENDER|INVALID_FCC_SELECTION_DATA/,
  );

  const failed = await responseFixture();
  failed.result.status = 0;
  await assert.rejects(
    verifySelectionActionResponse(failed, { actionId, chainId: 114n, allowedTeeIds: [account.address] }),
    /FCC_SELECTION_FAILED/,
  );

  const transient = await responseFixture();
  transient.result.submissionTag = "end";
  await assert.rejects(
    verifySelectionActionResponse(transient, { actionId, chainId: 114n, allowedTeeIds: [account.address] }),
    /FCC_SELECTION_NOT_FINAL/,
  );
});

test("fails closed on a malformed signature-bearing proxy envelope", async () => {
  const response = await responseFixture();
  assert.equal(parseFccActionResponse(response).result.id, actionId);
  assert.throws(
    () => parseFccActionResponse({ ...response, signature: "0x1234" }),
    /INVALID_FCC_TEE_SIGNATURE/,
  );
  assert.throws(
    () => parseFccActionResponse({ ...response, result: { ...response.result, opType: "VEILBID_SELECTION" } }),
    /INVALID_FCC_OP_TYPE/,
  );
});
