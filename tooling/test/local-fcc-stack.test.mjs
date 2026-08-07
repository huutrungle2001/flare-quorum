import assert from "node:assert/strict";
import test from "node:test";

import {
  bytes32Text,
  evaluateLocalFccMachineSet,
  evaluateLocalDirectProbe,
  evaluateLocalFccInfo,
} from "../flare/local-fcc-stack.mjs";

const expectedExtensionId = `0x${"0".repeat(59)}10000`;
const expectedOwner = "0xE412d04DA2A211F7ADC80311CC0FF9F03440B64E";
const actionId = `0x${"ab".repeat(32)}`;

test("encodes FCC operation identifiers as zero-padded bytes32 text", () => {
  assert.equal(
    bytes32Text("VEILBID_BID"),
    `0x${Buffer.concat([Buffer.from("VEILBID_BID"), Buffer.alloc(21)]).toString("hex")}`,
  );
  assert.throws(() => bytes32Text(""), /FCC_BYTES32_TEXT_INVALID/);
  assert.throws(() => bytes32Text("x".repeat(33)), /FCC_BYTES32_TEXT_INVALID/);
});

test("requires three passing machines with distinct public keys", () => {
  const machines = ["11", "22", "33"].map((byte) => ({
    status: "PASSED",
    info: { publicIdentifiers: { publicKeyFingerprintSha256: byte.repeat(32) } },
  }));
  assert.equal(evaluateLocalFccMachineSet(machines).status, "PASSED");
  assert.equal(evaluateLocalFccMachineSet([machines[0], machines[0], machines[2]]).status, "FAILED");
});

test("sanitizes and verifies simulated local FCC info", () => {
  const result = evaluateLocalFccInfo({
    attestation: { kind: "simulated" },
    dataSignature: `0x${"12".repeat(65)}`,
    proxySignature: `0x${"ab".repeat(65)}`,
    teeInfo: { present: true },
    machineData: {
      codeHash: `0x${"11".repeat(32)}`,
      extensionId: expectedExtensionId,
      governanceHash: `0x${"22".repeat(32)}`,
      initialOwner: expectedOwner,
      platform: bytes32Text("TEST_PLATFORM"),
      publicKey: "0xpublic",
    },
  }, { expectedExtensionId, expectedOwner });
  assert.equal(result.status, "PASSED");
  assert.equal(result.publicIdentifiers.mode, "simulated-local-coston2");
  assert.equal(Object.hasOwn(result.publicIdentifiers, "publicKey"), false);
});

test("verifies authenticated routing without accepting a fabricated bid", () => {
  const result = evaluateLocalDirectProbe({
    unauthenticatedStatus: 401,
    authenticatedStatus: 200,
    action: { data: { id: actionId, type: "direct", submissionTag: "submit" } },
    resultResponseStatus: 200,
    response: {
      result: {
        id: actionId,
        submissionTag: "submit",
        status: 0,
        log: "error: INVALID_PRIVATE_BID",
        opType: bytes32Text("VEILBID_BID"),
        opCommand: bytes32Text("SUBMIT_V1"),
        version: "0.2.2",
        data: "0x",
      },
      signature: `0x${"12".repeat(65)}`,
      proxySignature: `0x${"ab".repeat(65)}`,
    },
  });
  assert.equal(result.status, "PASSED");
  assert.equal(Object.hasOwn(result.publicIdentifiers, "actionId"), false);
});
