import assert from "node:assert/strict";
import test from "node:test";
import {
  directBidInstruction,
  teeIdentityFromPublicKey,
  teePublicKeyFingerprint,
} from "@veilbid/flare-bindings";
import { privateKeyToAccount } from "viem/accounts";
import {
  LiveFlareBidIngressChain,
  LiveFlareBidIngressProxy,
} from "../dist/flare-ingress-live.js";

const market = "0x1000000000000000000000000000000000000001";
const manager = "0x2000000000000000000000000000000000000002";
const vendor = "0x3000000000000000000000000000000000000003";
const codeVersion = `0x${"77".repeat(32)}`;
const proxyUrls = ["https://tee-1.example", "https://tee-2.example", "https://tee-3.example"];

function machineKey(byte) {
  const account = privateKeyToAccount(`0x${byte.repeat(32)}`);
  return {
    x: `0x${account.publicKey.slice(4, 68)}`,
    y: `0x${account.publicKey.slice(68, 132)}`,
  };
}

const publicKeys = [machineKey("11"), machineKey("22"), machineKey("44")];
const teeIds = publicKeys.map(teeIdentityFromPublicKey);
const fingerprints = publicKeys.map(teePublicKeyFingerprint);

function tender() {
  return {
    buyer: "0x4000000000000000000000000000000000000004",
    metadataHash: `0x${"01".repeat(32)}`,
    rulesHash: `0x${"02".repeat(32)}`,
    publicCeilingXrp: 10n,
    bidDeadline: 2_000n,
    closeBlock: 0n,
    bidCount: 0n,
    approvedVendorCount: 2,
    commonQuorumBitmap: 0,
    orderedBidRoot: `0x${"00".repeat(32)}`,
    extensionId: 65_537n,
    codeVersion,
    ftsoFeedId: `0x${"03".repeat(21)}`,
    ftsoValue: 0n,
    ftsoDecimals: 0,
    ftsoTimestamp: 0n,
    selectionStartedAt: 0n,
    selectionAttempt: 0,
    resultNonce: 0n,
    resultExpiry: 0n,
    requestId: `0x${"00".repeat(32)}`,
    status: 1,
    teeIds,
    teeKeyFingerprints: fingerprints,
  };
}

function reader(overrides = {}) {
  const calls = [];
  const machineOverrides = overrides.machine ?? {};
  return {
    calls,
    async getChainId() { return overrides.chainId ?? 114; },
    async getBlock() { return { number: 500n, timestamp: 1_000n }; },
    async getCode(args) {
      calls.push({ kind: "code", ...args });
      return overrides.missingCode === args.address ? "0x" : "0x6000";
    },
    async readContract(args) {
      calls.push({ kind: "read", ...args });
      const firstArg = args.args?.[0];
      const index = typeof firstArg === "string"
        ? teeIds.findIndex((id) => id.toLowerCase() === firstArg.toLowerCase())
        : -1;
      switch (args.functionName) {
        case "teeManager": return overrides.manager ?? manager;
        case "getTender": return tender();
        case "getTeeMachineStatus": return machineOverrides.status ?? 2;
        case "getExtensionId": return machineOverrides.extensionId ?? 65_537n;
        case "getPublicKey": return machineOverrides.publicKey ?? publicKeys[index];
        case "getTeeMachineWithAttestationData": return {
          teeId: machineOverrides.teeId ?? teeIds[index],
          initialTeeId: teeIds[index],
          url: machineOverrides.url ?? proxyUrls[index],
          codeHash: machineOverrides.codeHash ?? codeVersion,
          platform: `0x${"55".repeat(32)}`,
        };
        case "isApprovedVendor": return true;
        case "hasSubmittedBid": return false;
        default: throw new Error(`unexpected ${args.functionName}`);
      }
    },
  };
}

const config = {
  rpcUrl: "https://coston2.example.invalid/rpc",
  marketAddress: market,
  teeManagerAddress: manager,
  proxyUrls,
};

test("live ingress reads one block and verifies manager, production machines, code, URL, and keys", async () => {
  const chainReader = reader();
  const chain = new LiveFlareBidIngressChain(config, chainReader);
  const result = await chain.inspect(7n, vendor);
  assert.equal(result.chainTimestamp, 1_000n);
  assert.equal(result.approved, true);
  assert.equal(result.submitted, false);
  assert.deepEqual(result.teeIds, teeIds);
  assert.deepEqual(result.teePublicKeys, publicKeys);
  assert.ok(chainReader.calls.length > 10);
  assert.ok(chainReader.calls.every((call) => call.blockNumber === 500n));
});

test("live ingress rejects every stale or mismatched machine binding", async () => {
  for (const [overrides, code] of [
    [{ manager: "0x9000000000000000000000000000000000000009" }, "FLARE_TEE_MANAGER_BINDING_MISMATCH"],
    [{ machine: { status: 1 } }, "FCC_MACHINE_NOT_PRODUCTION"],
    [{ machine: { extensionId: 65_538n } }, "FCC_MACHINE_EXTENSION_MISMATCH"],
    [{ machine: { codeHash: `0x${"88".repeat(32)}` } }, "FCC_MACHINE_CODE_VERSION_MISMATCH"],
    [{ machine: { url: "https://other.example" } }, "FCC_MACHINE_PROXY_URL_MISMATCH"],
    [{ machine: { publicKey: publicKeys[1] } }, "FCC_TEE_IDENTITY_MISMATCH"],
  ]) {
    await assert.rejects(
      new LiveFlareBidIngressChain(config, reader(overrides)).inspect(7n, vendor),
      new RegExp(code),
    );
  }
});

function actionResponse(instruction, overrides = {}) {
  const returnedInstruction = { ...instruction, ...overrides.instruction };
  return {
    data: {
      id: `0x${"99".repeat(32)}`,
      type: overrides.type ?? "direct",
      submissionTag: overrides.submissionTag ?? "submit",
      message: `0x${Buffer.from(JSON.stringify(returnedInstruction)).toString("hex")}`,
    },
    additionalVariableMessages: null,
    timestamps: null,
    additionalActionData: null,
    signatures: null,
  };
}

function resultResponse(instruction, data = `0x${"77".repeat(32)}`) {
  return {
    result: {
      id: `0x${"99".repeat(32)}`,
      submissionTag: "submit",
      status: 1,
      log: "ok",
      opType: instruction.opType,
      opCommand: instruction.opCommand,
      additionalResultStatus: "0x",
      version: "veilbid-coston2",
      data,
    },
    signature: `0x${"00".repeat(65)}`,
    proxySignature: `0x${"00".repeat(65)}`,
  };
}

test("live proxy authenticates /direct and returns only the bound action id", async () => {
  const instruction = directBidInstruction(`0x${"aa".repeat(114)}`);
  const observed = [];
  const proxy = new LiveFlareBidIngressProxy({
    proxyUrls,
    directApiKeys: ["test-only-key-one", "test-only-key-two", "test-only-key-three"],
  }, async (url, init) => {
    observed.push({ url: url.toString(), init });
    return new Response(JSON.stringify(actionResponse(instruction)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const result = await proxy.submit(1, instruction);
  assert.deepEqual(result, { actionId: `0x${"99".repeat(32)}` });
  assert.equal(observed[0].url, "https://tee-2.example/direct");
  assert.equal(observed[0].init.headers["X-API-Key"], "test-only-key-two");
  assert.deepEqual(JSON.parse(observed[0].init.body), instruction);
  assert.equal(JSON.stringify(result).includes(instruction.message), false);
});

test("live proxy reads only a parsed bid result and keeps the request ciphertext out", async () => {
  const instruction = directBidInstruction(`0x${"aa".repeat(114)}`);
  const observed = [];
  const proxy = new LiveFlareBidIngressProxy({
    proxyUrls,
    directApiKeys: ["test-only-key-one", "test-only-key-two", "test-only-key-three"],
  }, async (url, init) => {
    observed.push({ url: url.toString(), init });
    return new Response(JSON.stringify(resultResponse(instruction)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const result = await proxy.result(1, `0x${"99".repeat(32)}`);
  assert.deepEqual(result, {
    actionId: `0x${"99".repeat(32)}`,
    status: 1,
    submissionTag: "submit",
    opType: instruction.opType,
    opCommand: instruction.opCommand,
    data: `0x${"77".repeat(32)}`,
  });
  assert.equal(observed[0].url, "https://tee-2.example/action/result/0x9999999999999999999999999999999999999999999999999999999999999999?submissionTag=submit");
  assert.equal(observed[0].init.headers["X-API-Key"], "test-only-key-two");
  assert.equal(JSON.stringify(result).includes(instruction.message), false);
});

test("live proxy rejects unbound, malformed, and failed responses without returning their body", async () => {
  const instruction = directBidInstruction(`0x${"aa".repeat(114)}`);
  for (const [response, code] of [
    [new Response("denied", { status: 401 }), "FCC_PROXY_REJECTED"],
    [new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } }), "FCC_PROXY_RESPONSE_INVALID"],
    [new Response(JSON.stringify(actionResponse(instruction, { type: "instruction" })), {
      status: 200, headers: { "content-type": "application/json" },
    }), "FCC_PROXY_RESPONSE_INVALID"],
    [new Response(JSON.stringify(actionResponse(instruction, { instruction: { message: `0x${"bb".repeat(114)}` } })), {
      status: 200, headers: { "content-type": "application/json" },
    }), "FCC_PROXY_ACTION_MISMATCH"],
  ]) {
    const proxy = new LiveFlareBidIngressProxy({
      proxyUrls,
      directApiKeys: ["test-only-key-one", "test-only-key-two", "test-only-key-three"],
    }, async () => response);
    await assert.rejects(proxy.submit(0, instruction), new RegExp(code));
  }
});

test("live proxy reports a pending result without exposing upstream response text", async () => {
  const proxy = new LiveFlareBidIngressProxy({
    proxyUrls,
    directApiKeys: ["test-only-key-one", "test-only-key-two", "test-only-key-three"],
  }, async () => new Response("pending-sensitive-body", { status: 404 }));
  await assert.rejects(
    proxy.result(0, `0x${"99".repeat(32)}`),
    /FCC_PROXY_RESULT_PENDING/,
  );
});
