import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters } from "viem";
import {
  buildXrpPaymentPrepareRequest,
  calculateFdcVotingRound,
  decodeXrpPaymentDaProof,
  prepareXrpPaymentRequest,
  retrieveXrpPaymentProof,
} from "../dist/fdc-client.js";
import {
  testXrpSourceId,
  xrpPaymentAttestationType,
  xrpPaymentResponseParameter,
  type XrpPaymentResponse,
} from "../dist/fdc.js";

const transactionId = `0x${"11".repeat(32)}` as const;
const proofOwner = "0x1000000000000000000000000000000000000001" as const;

function responseFixture(): XrpPaymentResponse {
  return {
    attestationType: xrpPaymentAttestationType,
    sourceId: testXrpSourceId,
    votingRound: 700n,
    lowestUsedTimestamp: 1_700_000_000n,
    requestBody: { transactionId, proofOwner },
    responseBody: {
      blockNumber: 12_345n,
      blockTimestamp: 1_700_000_001n,
      sourceAddress: "rTestSource",
      sourceAddressHash: `0x${"22".repeat(32)}`,
      receivingAddressHash: `0x${"33".repeat(32)}`,
      intendedReceivingAddressHash: `0x${"00".repeat(32)}`,
      spentAmount: 1_100_000n,
      intendedSpentAmount: 1_100_000n,
      receivedAmount: 1_100_000n,
      intendedReceivedAmount: 1_100_000n,
      hasMemoData: true,
      firstMemoData: `0xfe00${"00".repeat(8)}${"44".repeat(32)}`,
      hasDestinationTag: false,
      destinationTag: 0n,
      status: 0,
    },
  };
}

test("builds the official testXRP XRPPayment verifier request", () => {
  assert.deepEqual(buildXrpPaymentPrepareRequest(transactionId, proofOwner), {
    attestationType: xrpPaymentAttestationType,
    sourceId: testXrpSourceId,
    requestBody: { transactionId, proofOwner },
  });
  assert.throws(
    () => buildXrpPaymentPrepareRequest("0x1234", proofOwner),
    /INVALID_XRP_PAYMENT_REQUEST/,
  );
});

test("uses the exact verifier endpoint and never needs to expose the API key", async () => {
  const seen: Array<{ url: string; key: string | null }> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: String(input), key: headers.get("X-API-KEY") });
    return new Response(JSON.stringify({ status: "VALID", abiEncodedRequest: "0x1234" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await prepareXrpPaymentRequest({
    verifierBaseUrl: "https://fdc-verifiers-testnet.flare.network/",
    apiKey: "not-logged",
    transactionId,
    proofOwner,
  }, { fetchImplementation });
  assert.equal(result.abiEncodedRequest, "0x1234");
  assert.deepEqual(seen, [{
    url: "https://fdc-verifiers-testnet.flare.network/verifier/xrp/XRPPayment/prepareRequest",
    key: "not-logged",
  }]);
});

test("decodes the DA raw response and treats a pending response as non-success", async () => {
  const response = responseFixture();
  const responseHex = encodeAbiParameters([xrpPaymentResponseParameter], [response]);
  const decoded = decodeXrpPaymentDaProof({
    response_hex: responseHex,
    proof: [`0x${"55".repeat(32)}`],
  });
  assert.equal(decoded.data.requestBody.transactionId, transactionId);
  assert.equal(decoded.data.responseBody.firstMemoData, response.responseBody.firstMemoData);

  const pending = await retrieveXrpPaymentProof({
    daLayerBaseUrl: "https://ctn2-data-availability.flare.network",
    votingRoundId: 700n,
    abiEncodedRequest: "0x1234",
  }, {
    fetchImplementation: async () => new Response("{}", {
      status: 202,
      headers: { "content-type": "application/json" },
    }),
  });
  assert.equal(pending, null);
});

test("calculates the request voting round from the mined block timestamp", () => {
  assert.equal(calculateFdcVotingRound(1_120n, 1_000n, 90n), 1n);
  assert.throws(
    () => calculateFdcVotingRound(999n, 1_000n, 90n),
    /INVALID_FDC_VOTING_ROUND_PARAMETERS/,
  );
});
