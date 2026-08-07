import { createHash } from "node:crypto";

const hex32Pattern = /^0x[0-9a-f]{64}$/i;
const addressPattern = /^0x[0-9a-f]{40}$/i;

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function serialized(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

function signaturePresent(value) {
  return typeof value === "string" && /^0x[0-9a-f]{130}$/i.test(value);
}

export function bytes32Text(value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length === 0 || bytes.length > 32) {
    throw new Error("FCC_BYTES32_TEXT_INVALID");
  }
  return `0x${Buffer.concat([bytes, Buffer.alloc(32 - bytes.length)]).toString("hex")}`;
}

export function evaluateLocalFccInfo(info, { expectedExtensionId, expectedOwner }) {
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new Error("FCC_LOCAL_INFO_INVALID");
  }
  const machineData = info.machineData;
  if (!machineData || typeof machineData !== "object" || Array.isArray(machineData)) {
    throw new Error("FCC_LOCAL_INFO_INVALID");
  }
  if (!hex32Pattern.test(expectedExtensionId) || !addressPattern.test(expectedOwner)) {
    throw new Error("FCC_LOCAL_EXPECTATION_INVALID");
  }
  const publicKey = serialized(machineData.publicKey);
  const nonzeroHex32 = (value) =>
    hex32Pattern.test(value ?? "") && !/^0x0{64}$/i.test(value);
  const assertions = {
    hasAttestation: serialized(info.attestation).length > 4,
    hasDataSignature: signaturePresent(info.dataSignature),
    hasProxySignature: signaturePresent(info.proxySignature),
    hasTeeInfo: info.teeInfo !== undefined && info.teeInfo !== null,
    extensionIdMatches:
      String(machineData.extensionId ?? "").toLowerCase() === expectedExtensionId.toLowerCase(),
    initialOwnerMatches:
      String(machineData.initialOwner ?? "").toLowerCase() === expectedOwner.toLowerCase(),
    codeHashIsNonzero: nonzeroHex32(machineData.codeHash),
    governanceHashIsNonzero: nonzeroHex32(machineData.governanceHash),
    publicKeyPresent: publicKey.length > 4,
    platformIsSimulated:
      String(machineData.platform ?? "").toLowerCase() === bytes32Text("TEST_PLATFORM"),
  };
  return {
    status: Object.values(assertions).every(Boolean) ? "PASSED" : "FAILED",
    assertions,
    publicIdentifiers: {
      mode: "simulated-local-coston2",
      platform: machineData.platform,
      publicKeyFingerprintSha256: sha256Text(publicKey),
    },
  };
}

export function evaluateLocalDirectProbe({
  unauthenticatedStatus,
  authenticatedStatus,
  action,
  resultResponseStatus,
  response,
}) {
  const actionId = action?.data?.id;
  if (!hex32Pattern.test(actionId ?? "")) {
    throw new Error("FCC_LOCAL_DIRECT_ACTION_INVALID");
  }
  const result = response?.result ?? {};
  const assertions = {
    missingApiKeyRejected: unauthenticatedStatus === 401,
    authenticatedDirectAccepted: authenticatedStatus === 200,
    queueActionShapeValid:
      action?.data?.type === "direct" && action?.data?.submissionTag === "submit",
    signedResultFetched: resultResponseStatus === 200,
    teeRejectedMalformedCiphertext:
      result.status === 0 && result.log === "error: INVALID_PRIVATE_BID",
    resultBoundToAction:
      String(result.id ?? "").toLowerCase() === actionId.toLowerCase(),
    resultSubmissionTagIsSubmit: result.submissionTag === "submit",
    operationTypeMatches:
      String(result.opType ?? "").toLowerCase() === bytes32Text("VEILBID_BID"),
    operationCommandMatches:
      String(result.opCommand ?? "").toLowerCase() === bytes32Text("SUBMIT_V1"),
    teeSignaturePresent: signaturePresent(response?.signature),
    proxySignaturePresent: signaturePresent(response?.proxySignature),
    noBidPayloadReturned:
      result.data === "0x" || result.data === null || result.data === undefined,
  };
  return {
    status: Object.values(assertions).every(Boolean) ? "PASSED" : "FAILED",
    assertions,
    publicIdentifiers: {
      actionIdFingerprintSha256: sha256Text(actionId),
      extensionVersion: typeof result.version === "string" ? result.version : null,
    },
  };
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
}

export async function verifyLocalFccStack({
  baseUrl,
  apiKey,
  expectedExtensionId,
  expectedOwner,
  infoAttempts = 40,
  pollAttempts = 40,
  pollIntervalMs = 250,
}) {
  const parsed = new URL(baseUrl);
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username || parsed.password || parsed.pathname !== "/" ||
    parsed.search || parsed.hash
  ) throw new Error("FCC_LOCAL_BASE_URL_UNSAFE");
  if (typeof apiKey !== "string" || apiKey.length < 32) {
    throw new Error("FCC_LOCAL_DIRECT_API_KEY_INVALID");
  }
  let infoPayload;
  for (let attempt = 0; attempt < infoAttempts; attempt += 1) {
    try {
      const infoResponse = await fetchWithTimeout(new URL("info", parsed));
      if (infoResponse.ok) {
        infoPayload = await infoResponse.json();
        break;
      }
    } catch {
      // The proxy opens its socket before the first TEE info refresh completes.
      // Keep the transient transport error private and retry within the bound.
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  if (!infoPayload) throw new Error("FCC_LOCAL_INFO_TIMEOUT");
  const info = evaluateLocalFccInfo(infoPayload, {
    expectedExtensionId,
    expectedOwner,
  });

  const body = JSON.stringify({
    opType: bytes32Text("VEILBID_BID"),
    opCommand: bytes32Text("SUBMIT_V1"),
    message: "0x00",
  });
  const unauthenticated = await fetchWithTimeout(new URL("direct", parsed), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const authenticated = await fetchWithTimeout(new URL("direct", parsed), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body,
  });
  if (!authenticated.ok) {
    throw new Error(`FCC_LOCAL_DIRECT_HTTP_${authenticated.status}`);
  }
  const action = await authenticated.json();
  const actionId = action?.data?.id;
  if (!hex32Pattern.test(actionId ?? "")) {
    throw new Error("FCC_LOCAL_DIRECT_ACTION_INVALID");
  }

  let resultResponse;
  let response;
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const resultUrl = new URL(`action/result/${actionId}`, parsed);
    resultUrl.searchParams.set("submissionTag", "submit");
    resultResponse = await fetchWithTimeout(resultUrl);
    if (resultResponse.ok) {
      response = await resultResponse.json();
      break;
    }
    if (resultResponse.status !== 404) {
      throw new Error(`FCC_LOCAL_RESULT_HTTP_${resultResponse.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  if (!response) throw new Error("FCC_LOCAL_RESULT_TIMEOUT");
  const direct = evaluateLocalDirectProbe({
    unauthenticatedStatus: unauthenticated.status,
    authenticatedStatus: authenticated.status,
    action,
    resultResponseStatus: resultResponse.status,
    response,
  });
  return {
    status: info.status === "PASSED" && direct.status === "PASSED" ? "PASSED" : "FAILED",
    scope: "local simulated Coston2 stack; not a registered production TEE",
    info,
    direct,
  };
}
