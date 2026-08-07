import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

import {
  evaluateRegisteredMachine,
  inspectMachineRegistrationEndpoints,
  machineRegistrationEnvironment,
  parseMachineInfo,
} from "../flare/fcc-machine-registration.mjs";

const expected = {
  extensionId: `0x${"00".repeat(29)}0101d7`,
  initialOwner: "0xE412d04DA2A211F7ADC80311CC0FF9F03440B64E",
  codeHash: `0x${"11".repeat(32)}`,
  platform: `0x${"22".repeat(32)}`,
};

function info(byte) {
  const publicKey = privateKeyToAccount(`0x${byte.repeat(32)}`).publicKey.slice(4);
  return {
    machineData: {
      ...expected,
      governanceHash: `0x${"33".repeat(32)}`,
      publicKey: { x: `0x${publicKey.slice(0, 64)}`, y: `0x${publicKey.slice(64)}` },
    },
  };
}

test("derives a public TEE identity only from a fully bound machine info envelope", () => {
  const parsed = parseMachineInfo(info("11"), expected);
  assert.match(parsed.teeId, /^0x[0-9A-Fa-f]{40}$/);
  assert.match(parsed.publicKeyFingerprintSha256, /^[0-9a-f]{64}$/);
  assert.throws(
    () => parseMachineInfo({ machineData: { ...info("11").machineData, codeHash: `0x${"99".repeat(32)}` } }, expected),
    /FCC_MACHINE_INFO_BINDING_MISMATCH/,
  );
});

test("requires three stable public endpoints exposing the same local identities", async () => {
  const publicUrls = [1, 2, 3].map((n) => `https://tee-${n}.veilbid.example/`);
  const localUrls = [1, 2, 3].map((n) => `http://127.0.0.1:${6673 + n}/`);
  const allUrls = [...localUrls, ...publicUrls];
  const fetchImplementation = async (url) => {
    const index = allUrls.findIndex((origin) => url.href.startsWith(origin));
    if (url.href === "https://tee-proxy-coston2-1.flare.rocks/info") {
      return new Response(JSON.stringify({ ready: true }), { status: 200 });
    }
    const machine = (index % 3) + 1;
    return new Response(JSON.stringify(info(String(machine).repeat(2))), { status: 200 });
  };
  const result = await inspectMachineRegistrationEndpoints({
    publicUrls,
    localUrls,
    normalProxyUrl: "https://tee-proxy-coston2-1.flare.rocks/",
    expected,
    fetchImplementation,
  });
  assert.equal(result.status, "READY");
  assert.equal(result.machines.length, 3);

  const blocked = await inspectMachineRegistrationEndpoints({
    publicUrls: ["https://random.trycloudflare.com/"],
    localUrls,
    normalProxyUrl: "https://tee-proxy-coston2-1.flare.rocks/",
    expected,
    fetchImplementation,
  });
  assert.deepEqual(blocked.blockers, ["THREE_STABLE_PROXY_URLS_NOT_CONFIGURED"]);
});

test("uses three loopback proxy defaults without exposing configuration values", () => {
  const result = machineRegistrationEnvironment({});
  assert.equal(result.localUrls.length, 3);
  assert.equal(result.publicUrls.length, 0);
});

test("accepts only a production on-chain machine with exact frozen bindings", () => {
  const machine = parseMachineInfo(info("11"), expected);
  const runtime = { machine: 1, publicUrl: "https://tee-1.veilbid.example", ...machine };
  const result = evaluateRegisteredMachine({
    machine: runtime,
    status: 2,
    registeredExtensionId: BigInt(expected.extensionId),
    expectedExtensionId: BigInt(expected.extensionId),
    record: {
      teeId: runtime.teeId,
      url: runtime.publicUrl,
      codeHash: runtime.codeHash,
      platform: runtime.platform,
    },
    publicKey: { x: runtime.publicKeyX, y: runtime.publicKeyY },
  });
  assert.ok(Object.values(result.assertions).every(Boolean));
  assert.equal(evaluateRegisteredMachine({
    machine: runtime,
    status: 1,
    registeredExtensionId: BigInt(expected.extensionId),
    expectedExtensionId: BigInt(expected.extensionId),
    record: {
      teeId: runtime.teeId,
      url: runtime.publicUrl,
      codeHash: runtime.codeHash,
      platform: runtime.platform,
    },
    publicKey: { x: runtime.publicKeyX, y: runtime.publicKeyY },
  }).assertions.productionStatus, false);
});
