import assert from "node:assert/strict";
import test from "node:test";
import {
  bidReceiptDigest,
  decodeBidReceipt,
  flareBidIngressTypedData,
  teeIdentityFromPublicKey,
  teePublicKeyFingerprint,
} from "@veilbid/flare-bindings";
import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters } from "viem";
import {
  FlareBidIngressGateway,
  parseFlareBidIngressRequest,
} from "../dist/flare-ingress.js";

const market = "0x1000000000000000000000000000000000000001";
const ciphertext = "0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c122222222222222222222222222222222d76c006c8f0949a5f57117854f500d53910a263492072ba1db807ddaf0957c1b10d2673c4b90231c8c1301e1784b7f53e0398e964ce685";
const vendor = privateKeyToAccount(`0x${"55".repeat(32)}`);

function teeKey(byte) {
  const account = privateKeyToAccount(`0x${byte.repeat(32)}`);
  return {
    account,
    publicKey: {
      x: `0x${account.publicKey.slice(4, 68)}`,
      y: `0x${account.publicKey.slice(68, 132)}`,
    },
  };
}

const machines = [teeKey("11"), teeKey("22"), teeKey("44")];
const teeIds = machines.map(({ publicKey }) => teeIdentityFromPublicKey(publicKey));
const fingerprints = machines.map(({ publicKey }) => teePublicKeyFingerprint(publicKey));
const receiptParameter = {
  type: "tuple",
  components: [
    { name: "schemaVersion", type: "uint16" },
    { name: "chainId", type: "uint256" },
    { name: "market", type: "address" },
    { name: "extensionId", type: "uint256" },
    { name: "codeVersion", type: "bytes32" },
    { name: "tenderId", type: "uint256" },
    { name: "vendor", type: "address" },
    { name: "submissionNonce", type: "uint256" },
    { name: "rulesHash", type: "bytes32" },
    { name: "plaintextCommitment", type: "bytes32" },
    { name: "teeId", type: "address" },
    { name: "expiry", type: "uint64" },
    { name: "signature", type: "bytes" },
  ],
};

function tender(overrides = {}) {
  return {
    market,
    status: "Open",
    chainTimestamp: 1_000n,
    bidDeadline: 2_000n,
    rulesHash: `0x${"22".repeat(32)}`,
    extensionId: 65_537n,
    codeVersion: `0x${"33".repeat(32)}`,
    teeIds,
    teeKeyFingerprints: fingerprints,
    teePublicKeys: machines.map(({ publicKey }) => publicKey),
    approved: true,
    submitted: false,
    ...overrides,
  };
}

async function signedRequest(overrides = {}) {
  const authorization = {
    market,
    tenderId: 7n,
    vendor: vendor.address,
    teeId: teeIds[2],
    submissionNonce: 9n,
    ciphertext,
    expiresAt: 1_200n,
    ...overrides,
  };
  return {
    schemaVersion: 1,
    market: authorization.market,
    tenderId: authorization.tenderId.toString(),
    vendor: authorization.vendor,
    teeId: authorization.teeId,
    submissionNonce: authorization.submissionNonce.toString(),
    ciphertext: authorization.ciphertext,
    expiresAt: authorization.expiresAt.toString(),
    authorization: await vendor.signTypedData(flareBidIngressTypedData(authorization)),
  };
}

test("gateway forwards only an authorized opaque ECIES instruction", async () => {
  const observed = [];
  const gateway = new FlareBidIngressGateway(
    { async inspect(_tenderId, account) {
      assert.equal(account, vendor.address);
      return tender();
    } },
    { async submit(machineIndex, instruction) {
      observed.push({ machineIndex, instruction });
      return { actionId: `0x${"99".repeat(32)}` };
    } },
  );
  const accepted = await gateway.submit(parseFlareBidIngressRequest(await signedRequest()));
  assert.deepEqual(accepted, {
    actionId: `0x${"99".repeat(32)}`,
    teeId: teeIds[2],
    expiresAt: 1_200n,
  });
  assert.equal(observed.length, 1);
  assert.equal(observed[0].machineIndex, 2);
  assert.equal(observed[0].instruction.message, ciphertext);
  assert.deepEqual(Object.keys(observed[0].instruction).sort(), ["message", "opCommand", "opType"]);
});

test("gateway publishes only chain-matched TEE encryption keys", async () => {
  const gateway = new FlareBidIngressGateway(
    { async inspect(_tenderId, account) {
      assert.equal(account, undefined);
      return tender();
    } },
    { async submit() { throw new Error("not called"); } },
  );
  const keys = await gateway.machineKeys(7n);
  assert.deepEqual(keys.map((value) => value.teeId), teeIds);
  assert.deepEqual(keys.map((value) => value.fingerprint), fingerprints);
  await assert.rejects(
    new FlareBidIngressGateway(
      { async inspect() { return tender({ teeKeyFingerprints: [`0x${"00".repeat(32)}`, fingerprints[1], fingerprints[2]] }); } },
      { async submit() { throw new Error("not called"); } },
    ).machineKeys(7n),
    /FCC_TEE_IDENTITY_MISMATCH/,
  );
});

test("gateway fails closed on replay, wrong signature, state, and plaintext-shaped fields", async () => {
  const request = await signedRequest();
  assert.throws(
    () => parseFlareBidIngressRequest({ ...request, priceMicros: "400" }),
    /INVALID_BID_INGRESS_REQUEST/,
  );
  const neverProxy = { async submit() { throw new Error("proxy must not be called"); } };
  await assert.rejects(
    new FlareBidIngressGateway({ async inspect() { return tender(); } }, neverProxy).submit(
      parseFlareBidIngressRequest({ ...request, ciphertext: `${ciphertext.slice(0, -2)}00` }),
    ),
    /BID_INGRESS_AUTHORIZATION_INVALID/,
  );
  for (const state of [
    { status: "Closed" },
    { approved: false },
    { submitted: true },
    { chainTimestamp: 1_200n },
  ]) {
    await assert.rejects(
      new FlareBidIngressGateway({ async inspect() { return tender(state); } }, neverProxy).submit(
        parseFlareBidIngressRequest(request),
      ),
      /BID_INGRESS_NOT_AVAILABLE/,
    );
  }
});

test("gateway result route returns only a fully domain-bound TEE receipt", async () => {
  const receiptSigner = privateKeyToAccount(`0x${"66".repeat(32)}`);
  const resultTender = tender({ teeIds: [receiptSigner.address, teeIds[1], teeIds[2]] });
  const mismatchedTender = tender({ teeIds: [receiptSigner.address, teeIds[1], teeIds[2]], rulesHash: `0x${"55".repeat(32)}` });
  const unsigned = {
    schemaVersion: 1,
    chainId: 114n,
    market,
    extensionId: 65_537n,
    codeVersion: `0x${"33".repeat(32)}`,
    tenderId: 7n,
    rulesHash: `0x${"22".repeat(32)}`,
    vendor: vendor.address,
    submissionNonce: 9n,
    plaintextCommitment: `0x${"44".repeat(32)}`,
    teeId: receiptSigner.address,
    expiry: 1_200n,
    signature: "0x",
  };
  const receipt = {
    ...unsigned,
    signature: await receiptSigner.signMessage({ message: { raw: bidReceiptDigest(unsigned) } }),
  };
  const data = encodeAbiParameters([receiptParameter], [receipt]);
  const gateway = new FlareBidIngressGateway(
    { async inspect() { return resultTender; } },
    {
      async submit() { throw new Error("not called"); },
      async result() {
        return {
          actionId: `0x${"99".repeat(32)}`,
          status: 1,
          submissionTag: "submit",
          opType: "0x5645494c4249445f424944000000000000000000000000000000000000000000",
          opCommand: "0x5355424d49545f56310000000000000000000000000000000000000000000000",
          data,
        };
      },
    },
  );
  const accepted = await gateway.result(7n, 0, `0x${"99".repeat(32)}`);
  assert.equal(accepted.teeId, receiptSigner.address);
  assert.deepEqual(decodeBidReceipt(accepted.data), receipt);
  await assert.rejects(
    new FlareBidIngressGateway(
      { async inspect() { return mismatchedTender; } },
      {
        async submit() { throw new Error("not called"); },
        async result() {
          return {
            actionId: `0x${"99".repeat(32)}`,
            status: 1,
            submissionTag: "submit",
            opType: "0x5645494c4249445f424944000000000000000000000000000000000000000000",
            opCommand: "0x5355424d49545f56310000000000000000000000000000000000000000000000",
            data,
          };
        },
      },
    ).result(7n, 0, `0x${"99".repeat(32)}`),
    /FCC_PROXY_ACTION_MISMATCH/,
  );
});
