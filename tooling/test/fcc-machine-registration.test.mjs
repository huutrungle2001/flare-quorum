import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

import {
  evaluateActiveMachineSet,
  evaluateRegisteredMachine,
  inspectMachineRegistrationEndpoints,
  isTeeNotFoundError,
  machineRegistrationEnvironment,
  machineEvidenceRelativePath,
  normalizeMachineOrigin,
  parseMachineInfo,
  registeredMachineExtensionId,
  registeredMachineReadinessBlockers,
  registrationAddresses,
  requiredMachineRouteUpdate,
} from "../flare/fcc-machine-registration.mjs";
import {
  evaluateAvailabilityWindow,
  operationTypesRespectReservations,
  readFccOperationalBaseline,
} from "../flare/fcc-operational-baseline.mjs";

const repositoryRoot = new URL("../..", import.meta.url).pathname;

test("routes product and foundation machine evidence to separate canonical files", () => {
  const productId = `0x${"0".repeat(59)}101db`;
  assert.equal(machineEvidenceRelativePath({ FCC_MARKET_EXTENSION_ID: productId }), "evidence/coston2/fcc-market-machines.json");
  assert.equal(machineEvidenceRelativePath({ FCC_EXTENSION_ID: `0x${"0".repeat(59)}101d7` }), "evidence/coston2/fcc-machines.json");
  assert.equal(machineEvidenceRelativePath({
    FCC_MARKET_EXTENSION_ID: productId,
    FCC_MACHINE_EVIDENCE_PATH: "evidence/coston2/custom.json",
  }), "evidence/coston2/custom.json");
});

test("routes V2 machines through isolated IDs, endpoints, and evidence", () => {
  const v2Id = `0x${"0".repeat(59)}101ff`;
  const environment = {
    FCC_RELEASE_PROFILE: "v2",
    FCC_V2_EXTENSION_ID: v2Id,
    FCC_MACHINES_EXTENSION_ID: `0x${"0".repeat(59)}101d9`,
    FCC_MARKET_EXTENSION_ID: `0x${"0".repeat(59)}101db`,
    FLARE_FCC_V2_PROXY_URLS: "https://v2-1.example,https://v2-2.example,https://v2-3.example",
    FCC_V2_PROXY_CONTROL_URLS: "https://control-1.example,https://control-2.example,https://control-3.example",
    FCC_V2_NORMAL_PROXY_URL: "https://normal-v2.example",
  };
  assert.equal(registeredMachineExtensionId(environment), v2Id);
  assert.equal(machineEvidenceRelativePath(environment), "evidence/coston2/fcc-market-v2-machines-refresh.json");
  assert.deepEqual(machineRegistrationEnvironment(environment), {
    publicUrls: ["https://v2-1.example", "https://v2-2.example", "https://v2-3.example"],
    controlUrls: ["https://control-1.example", "https://control-2.example", "https://control-3.example"],
    normalProxyUrl: "https://normal-v2.example",
  });
  assert.deepEqual(machineRegistrationEnvironment({ FCC_RELEASE_PROFILE: "v2" }).controlUrls, []);
});

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
  const publicUrls = [1, 2, 3].map((n) => `https://tee-${n}.flarequorum.example/`);
  const localUrls = [1, 2, 3].map((n) => `http://127.0.0.1:${6673 + n}/`);
  const allUrls = [...localUrls, ...publicUrls];
  const fetchImplementation = async (url) => {
    if (url.pathname === "/instruction") return new Response(null, { status: 405 });
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
  assert.deepEqual(result.machines.map(({ controlUrl }) => controlUrl), localUrls);

  const missingInstructionRoute = await inspectMachineRegistrationEndpoints({
    publicUrls,
    localUrls,
    normalProxyUrl: "https://tee-proxy-coston2-1.flare.rocks/",
    expected,
    fetchImplementation: async (url) => {
      if (url.pathname === "/instruction") return new Response(null, { status: 404 });
      return fetchImplementation(url);
    },
  });
  assert.ok(missingInstructionRoute.blockers.includes(
    "MACHINE_1_INSTRUCTION_ROUTE_UNAVAILABLE",
  ));

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
  assert.equal(result.controlUrls.length, 3);
  assert.equal(result.publicUrls.length, 0);
});

test("resolves hosted product machines without changing the local foundation ID", () => {
  assert.equal(
    registeredMachineExtensionId({
      FCC_EXTENSION_ID: `0x${"00".repeat(29)}0101d7`,
      FCC_MARKET_EXTENSION_ID: `0x${"00".repeat(29)}0101db`,
    }),
    `0x${"00".repeat(29)}0101db`,
  );
  assert.equal(
    registeredMachineExtensionId({
      FCC_MACHINES_EXTENSION_ID: `0x${"00".repeat(29)}0101d9`,
      FCC_EXTENSION_ID: `0x${"00".repeat(29)}0101d7`,
      FCC_MARKET_EXTENSION_ID: `0x${"00".repeat(29)}0101db`,
    }),
    `0x${"00".repeat(29)}0101d9`,
  );
  assert.equal(
    registeredMachineExtensionId({ FCC_EXTENSION_ID: `0x${"00".repeat(29)}0101d7` }),
    `0x${"00".repeat(29)}0101d7`,
  );
});

test("removes the root slash that would redirect FCC instruction POSTs", () => {
  assert.equal(normalizeMachineOrigin("https://tee.example/"), "https://tee.example");
  assert.equal(normalizeMachineOrigin("https://tee.example/path/"), "https://tee.example/path/");
  const environment = machineRegistrationEnvironment({
    FLARE_FCC_PROXY_URLS: "https://tee-1.example/,https://tee-2.example/,https://tee-3.example/",
  });
  assert.deepEqual(environment.publicUrls, [
    "https://tee-1.example",
    "https://tee-2.example",
    "https://tee-3.example",
  ]);
});

test("repairs only an existing machine whose registered route differs", () => {
  const machine = { teeId: "0x1111111111111111111111111111111111111111", publicUrl: "https://tee.example/" };
  assert.deepEqual(requiredMachineRouteUpdate({
    teeId: machine.teeId,
    teeProxyId: "0x2222222222222222222222222222222222222222",
    url: "https://tee.example/",
  }, machine), {
    teeId: machine.teeId,
    teeProxyId: "0x2222222222222222222222222222222222222222",
    url: "https://tee.example",
  });
  assert.equal(requiredMachineRouteUpdate({
    teeId: "0x0000000000000000000000000000000000000000",
    teeProxyId: "0x0000000000000000000000000000000000000000",
    url: "",
  }, machine), null);
});

test("accepts only the exact three active identities and routes", () => {
  const expectedMachines = [1, 2, 3].map((value) => ({
    teeId: `0x${value.toString(16).padStart(40, "0")}`,
    publicUrl: `https://tee-${value}.example/`,
  }));
  const activeIds = expectedMachines.map(({ teeId }) => teeId).reverse();
  const activeUrls = expectedMachines.map(({ publicUrl }) =>
    publicUrl.replace(/\/$/, "")
  ).reverse();
  assert.equal(
    evaluateActiveMachineSet(activeIds, activeUrls, expectedMachines).status,
    "PASSED",
  );

  const staleId = "0x0000000000000000000000000000000000000004";
  const withStaleMachine = evaluateActiveMachineSet(
    [...activeIds, staleId],
    [...activeUrls, expectedMachines[0].publicUrl],
    expectedMachines,
  );
  assert.equal(withStaleMachine.status, "FAILED");
  assert.equal(withStaleMachine.assertions.exactlyThreeActiveMachines, false);

  const wrongRoute = evaluateActiveMachineSet(
    activeIds,
    ["https://stale.example", ...activeUrls.slice(1)],
    expectedMachines,
  );
  assert.equal(wrongRoute.status, "FAILED");
  assert.equal(wrongRoute.assertions.exactActiveRoutes, false);

  const expectedSubset = evaluateActiveMachineSet(
    activeIds.slice(0, 1),
    activeUrls.slice(0, 1),
    expectedMachines,
    { requireComplete: false },
  );
  assert.equal(expectedSubset.status, "PASSED");
  assert.equal(expectedSubset.assertions.exactlyThreeActiveMachines, false);

  const staleSubset = evaluateActiveMachineSet(
    [staleId],
    [expectedMachines[0].publicUrl],
    expectedMachines,
    { requireComplete: false },
  );
  assert.equal(staleSubset.status, "FAILED");
  assert.equal(staleSubset.assertions.activeIdentitiesExpected, false);
});

test("recognizes only the current manager's TeeNotFound error", () => {
  assert.equal(isTeeNotFoundError(new Error("execution reverted: 0xceb05b68")), true);
  assert.equal(isTeeNotFoundError({ cause: { errorName: "TeeNotFound" } }), true);
  assert.equal(isTeeNotFoundError(new Error("RPC timeout")), false);
});

test("writes the exact address keys expected by the FCC registration client", () => {
  const addresses = registrationAddresses({
    contracts: {
      flareSystemsManager: "0x1111111111111111111111111111111111111111",
      fccFdc2Hub: "0x2222222222222222222222222222222222222222",
      flareTeeManager: "0x3333333333333333333333333333333333333333",
    },
  });
  assert.deepEqual(Object.keys(addresses), [
    "FlareSystemsManager",
    "Fdc2Hub",
    "FlareTeeManager",
  ]);
  assert.equal("FlareSystemManager" in addresses, false);
});

test("accepts stable remote control endpoints for hosted Railway machines", async () => {
  const publicUrls = [1, 2, 3].map(
    (n) => `https://flare-quorum-fcc-${n}-production.up.railway.app/`,
  );
  const fetchImplementation = async (url) => {
    if (url.pathname === "/instruction") return new Response(null, { status: 405 });
    if (url.href === "https://tee-proxy-coston2-1.flare.rocks/info") {
      return new Response(JSON.stringify({ ready: true }), { status: 200 });
    }
    const machine = publicUrls.findIndex((origin) => url.href.startsWith(origin)) + 1;
    return new Response(JSON.stringify(info(String(machine).repeat(2))), { status: 200 });
  };
  const result = await inspectMachineRegistrationEndpoints({
    publicUrls,
    controlUrls: publicUrls,
    normalProxyUrl: "https://tee-proxy-coston2-1.flare.rocks/",
    expected,
    fetchImplementation,
  });
  assert.equal(result.status, "READY");
  assert.deepEqual(result.machines.map(({ controlUrl }) => controlUrl), publicUrls);
});

test("accepts only a production on-chain machine with exact frozen bindings", () => {
  const machine = parseMachineInfo(info("11"), expected);
  const runtime = { machine: 1, publicUrl: "https://tee-1.flarequorum.example", ...machine };
  const availability = evaluateAvailabilityWindow({
    endTs: 31_000,
    validityDurationSeconds: 21_600,
    checkpointTimestamp: 10_000,
    maxCheckAgeSeconds: 21_600,
    lastSigningPolicyId: 42,
  });
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
    availability,
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
    availability,
  }).assertions.productionStatus, false);
});

test("fails a production machine whose availability check is expired or stale", () => {
  const expired = evaluateAvailabilityWindow({
    endTs: 30_000,
    validityDurationSeconds: 21_600,
    checkpointTimestamp: 30_001,
    maxCheckAgeSeconds: 21_600,
    lastSigningPolicyId: 42,
  });
  assert.equal(expired.status, "FAILED");
  assert.equal(expired.assertions.validityNotExpired, false);
  assert.equal(expired.assertions.checkFresh, false);
});

test("allows an explicit availability refresh only when every non-availability binding still passes", () => {
  const assertions = {
    productionStatus: true,
    extensionMatches: true,
    teeIdMatches: true,
    urlMatches: true,
    codeHashMatches: true,
    platformMatches: true,
    publicKeyMatches: true,
    availabilityNotExpired: false,
    availabilityFresh: false,
    availabilityWindowValid: true,
  };
  const expiredVerification = {
    status: "FAILED",
    activeSet: { status: "PASSED" },
    machines: [1, 2, 3].map((machine) => ({ machine, assertions })),
  };
  assert.deepEqual(registeredMachineReadinessBlockers(
    expiredVerification,
    { allowAvailabilityRefresh: true },
  ), []);
  assert.match(
    registeredMachineReadinessBlockers(expiredVerification)[0],
    /READINESS_STALE_OR_MISMATCH/,
  );
  assert.match(
    registeredMachineReadinessBlockers({
      ...expiredVerification,
      machines: expiredVerification.machines.map((machine, index) => index === 0
        ? { ...machine, assertions: { ...assertions, publicKeyMatches: false } }
        : machine),
    }, { allowAvailabilityRefresh: true })[0],
    /READINESS_STALE_OR_MISMATCH/,
  );
});

test("loads the current provider-push baseline and rejects reserved operation types", () => {
  const baseline = readFccOperationalBaseline(repositoryRoot);
  assert.equal(baseline.delivery.path, "/instruction");
  assert.equal(baseline.delivery.externalPort, 6664);
  assert.equal(operationTypesRespectReservations(
    ["VEILBID_FOUNDATION", "VEILBID_BID", "VEILBID_SELECTION"],
    baseline.opTypes.reservedPrefixes,
  ), true);
  assert.equal(operationTypesRespectReservations(
    ["F_RESERVED"],
    baseline.opTypes.reservedPrefixes,
  ), false);
});
