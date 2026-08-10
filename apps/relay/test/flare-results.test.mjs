import assert from "node:assert/strict";
import test from "node:test";
import {
  fccActionResultHash,
  fccSigningDigest,
  teeActionResultPrefix,
  flareQuorumSelectionOpType,
  flareQuorumSelectV1OpCommand,
} from "@flarequorum/flare-bindings";
import { encodeAbiParameters, hashMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  collectSelectionQuorum,
  FccSelectionPendingError,
} from "../dist/flare-results.js";

const selectionParameter = [{ type: "tuple", components: [
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
] }];

const accounts = ["11", "22", "33"].map((byte) => privateKeyToAccount(`0x${byte.repeat(32)}`));
const context = {
  market: "0x1000000000000000000000000000000000000001",
  tenderId: 42n,
  extensionId: 65_537n,
  codeVersion: `0x${"44".repeat(32)}`,
  rulesHash: `0x${"55".repeat(32)}`,
  orderedBidRoot: `0x${"66".repeat(32)}`,
  commonQuorumBitmap: 7,
  ftsoFeedId: "0x015852502f55534400000000000000000000000000",
  ftsoValue: 250_000n,
  ftsoDecimals: 5,
  ftsoTimestamp: 1_700_000_000n,
  closeBlock: 33_500_010n,
  resultNonce: 3n,
  resultExpiry: 2_000n,
  requestId: `0x${"77".repeat(32)}`,
  teeIds: accounts.map((account) => account.address),
};

const selection = {
  schemaVersion: 1, chainId: 114n, market: context.market, extensionId: context.extensionId,
  codeVersion: context.codeVersion, tenderId: context.tenderId, rulesHash: context.rulesHash,
  orderedBidRoot: context.orderedBidRoot, quorumBitmap: context.commonQuorumBitmap,
  ftsoFeedId: context.ftsoFeedId, ftsoValue: context.ftsoValue, ftsoDecimals: context.ftsoDecimals,
  ftsoTimestamp: context.ftsoTimestamp, closeBlock: context.closeBlock, winnerBidId: 1n,
  winner: "0x2000000000000000000000000000000000000002", winningAmountXrp: 400_000n,
  resultNonce: context.resultNonce, expiry: context.resultExpiry,
};

async function signedResponse(account, result = selection) {
  const actionResult = {
    id: context.requestId,
    submissionTag: "threshold",
    status: 1,
    log: "ok",
    opType: flareQuorumSelectionOpType,
    opCommand: flareQuorumSelectV1OpCommand,
    additionalResultStatus: "0x",
    version: "0.2.0",
    data: encodeAbiParameters(selectionParameter, [result]),
  };
  const digest = fccSigningDigest(teeActionResultPrefix, 114n, fccActionResultHash(actionResult));
  const signature = await account.sign({ hash: hashMessage({ raw: digest }) });
  return { result: actionResult, signature, proxySignature: signature };
}

function fetchFixture(responses, observed = []) {
  return async (url, init) => {
    observed.push({ url: String(url), init });
    const host = new URL(url).hostname;
    const body = responses[host];
    return body === undefined
      ? new Response("pending", { status: 404 })
      : Response.json(body);
  };
}

test("collects two distinct frozen TEE signatures over identical selection bytes", async () => {
  const observed = [];
  const responses = {
    "tee-1.example": await signedResponse(accounts[0]),
    "tee-2.example": await signedResponse(accounts[1]),
    "tee-3.example": await signedResponse(accounts[2], { ...selection, winningAmountXrp: 410_000n }),
  };
  const quorum = await collectSelectionQuorum({
    proxyUrls: ["https://tee-1.example", "https://tee-2.example", "https://tee-3.example"],
    context,
    expectedVersion: "0.2.0",
    fetchImpl: fetchFixture(responses, observed),
  });
  assert.equal(quorum.result.winningAmountXrp, 400_000n);
  assert.deepEqual(quorum.teeIds, [accounts[0].address, accounts[1].address]);
  assert.equal(quorum.proofs.length, 2);
  assert.ok(observed.every(({ url }) => url.endsWith(`/action/result/${context.requestId}?submissionTag=threshold`)));
  assert.ok(observed.every(({ init }) => init.redirect === "error"));
});

test("does not count the same TEE twice or combine conflicting result bytes", async () => {
  const duplicate = await signedResponse(accounts[0]);
  const conflicting = await signedResponse(accounts[1], { ...selection, winnerBidId: 0n, winner: "0x0000000000000000000000000000000000000000", winningAmountXrp: 0n });
  await assert.rejects(
    collectSelectionQuorum({
      proxyUrls: ["https://tee-1.example", "https://tee-2.example", "https://tee-3.example"],
      context,
      expectedVersion: "0.2.0",
      fetchImpl: fetchFixture({
        "tee-1.example": duplicate,
        "tee-2.example": duplicate,
        "tee-3.example": conflicting,
      }),
    }),
    (error) => error instanceof FccSelectionPendingError
      && error.responses === 3
      && error.matchingSigners === 1,
  );
});

test("treats unavailable or malformed proxies as pending, never as success", async () => {
  await assert.rejects(
    collectSelectionQuorum({
      proxyUrls: ["https://tee-1.example", "https://tee-2.example", "https://tee-3.example"],
      context,
      expectedVersion: "0.2.0",
      fetchImpl: fetchFixture({ "tee-1.example": { status: "success" } }),
    }),
    (error) => error instanceof FccSelectionPendingError
      && error.responses === 0
      && error.matchingSigners === 0,
  );
});
