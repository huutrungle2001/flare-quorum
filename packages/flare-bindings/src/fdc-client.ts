import {
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import {
  decodeXrpPaymentResponse,
  testXrpSourceId,
  xrpPaymentAttestationType,
  type XrpPaymentProof,
} from "./fdc.js";

const MAX_VERIFIER_RESPONSE_BYTES = 256 * 1024;
const MAX_DA_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface FdcHttpOptions {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export interface PreparedXrpPaymentRequest {
  abiEncodedRequest: Hex;
}

interface JsonResponse {
  status: number;
  value: unknown;
}

function endpoint(baseUrl: string, path: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("INVALID_FDC_ENDPOINT");
  }
  const loopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";
  if (
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("INVALID_FDC_ENDPOINT");
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}${path}`;
  return parsed.toString();
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MALFORMED_FDC_RESPONSE");
  }
  return value as Record<string, unknown>;
}

function boundedHex(value: unknown, maximumBytes: number, code: string): Hex {
  if (
    typeof value !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(value) ||
    (value.length - 2) / 2 > maximumBytes
  ) {
    throw new Error(code);
  }
  return value as Hex;
}

async function postJson(
  url: string,
  body: unknown,
  headers: Readonly<Record<string, string>>,
  maximumBytes: number,
  options: FdcHttpOptions,
): Promise<JsonResponse> {
  const response = await (options.fetchImplementation ?? fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("FDC_RESPONSE_TOO_LARGE");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new Error("FDC_RESPONSE_TOO_LARGE");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("MALFORMED_FDC_RESPONSE");
  }
  return { status: response.status, value };
}

export function buildXrpPaymentPrepareRequest(
  transactionId: Hex,
  proofOwner: Address,
): Readonly<Record<string, unknown>> {
  const normalizedTransactionId = boundedHex(
    transactionId,
    32,
    "INVALID_XRPL_TRANSACTION_ID",
  );
  if (normalizedTransactionId.length !== 66 || !isAddress(proofOwner)) {
    throw new Error("INVALID_XRP_PAYMENT_REQUEST");
  }
  return {
    attestationType: xrpPaymentAttestationType,
    sourceId: testXrpSourceId,
    requestBody: {
      transactionId: normalizedTransactionId.toLowerCase(),
      proofOwner: getAddress(proofOwner),
    },
  };
}

/** Call the official XRP verifier without reflecting credentials or raw errors. */
export async function prepareXrpPaymentRequest(
  input: {
    verifierBaseUrl: string;
    apiKey: string;
    transactionId: Hex;
    proofOwner: Address;
  },
  options: FdcHttpOptions = {},
): Promise<PreparedXrpPaymentRequest> {
  if (input.apiKey.trim() === "") throw new Error("MISSING_FDC_VERIFIER_API_KEY");
  const url = endpoint(
    input.verifierBaseUrl,
    "/verifier/xrp/XRPPayment/prepareRequest",
  );
  const response = await postJson(
    url,
    buildXrpPaymentPrepareRequest(input.transactionId, input.proofOwner),
    { "X-API-KEY": input.apiKey },
    MAX_VERIFIER_RESPONSE_BYTES,
    options,
  );
  if (response.status !== 200) throw new Error("FDC_VERIFIER_REJECTED");
  const body = record(response.value);
  if (
    typeof body.status === "string" &&
    body.status !== "VALID" &&
    !body.status.startsWith("OK")
  ) {
    throw new Error("FDC_VERIFIER_REJECTED");
  }
  return {
    abiEncodedRequest: boundedHex(
      body.abiEncodedRequest,
      64 * 1024,
      "MALFORMED_FDC_REQUEST",
    ),
  };
}

/** Decode one proof returned by the Coston2 DA v1 raw endpoint. */
export function decodeXrpPaymentDaProof(value: unknown): XrpPaymentProof {
  const body = record(value);
  const responseHex = boundedHex(
    body.response_hex,
    1024 * 1024,
    "MALFORMED_FDC_RESPONSE_HEX",
  );
  if (!Array.isArray(body.proof) || body.proof.length === 0 || body.proof.length > 256) {
    throw new Error("MALFORMED_FDC_MERKLE_PROOF");
  }
  const merkleProof = body.proof.map((item) => {
    const node = boundedHex(item, 32, "MALFORMED_FDC_MERKLE_PROOF");
    if (node.length !== 66) throw new Error("MALFORMED_FDC_MERKLE_PROOF");
    return node;
  });
  return { merkleProof, data: decodeXrpPaymentResponse(responseHex) };
}

export async function retrieveXrpPaymentProof(
  input: {
    daLayerBaseUrl: string;
    daLayerApiKey?: string;
    votingRoundId: bigint;
    abiEncodedRequest: Hex;
  },
  options: FdcHttpOptions = {},
): Promise<XrpPaymentProof | null> {
  if (input.votingRoundId < 0n || input.votingRoundId > 0xffff_ffff_ffff_ffffn) {
    throw new Error("INVALID_FDC_VOTING_ROUND");
  }
  const url = endpoint(
    input.daLayerBaseUrl,
    "/api/v1/fdc/proof-by-request-round-raw",
  );
  const headers: Readonly<Record<string, string>> = input.daLayerApiKey?.trim()
    ? { "X-API-KEY": input.daLayerApiKey }
    : {};
  const response = await postJson(
    url,
    {
      votingRoundId: Number(input.votingRoundId),
      requestBytes: boundedHex(
        input.abiEncodedRequest,
        64 * 1024,
        "MALFORMED_FDC_REQUEST",
      ),
    },
    headers,
    MAX_DA_RESPONSE_BYTES,
    options,
  );
  if (response.status === 404 || response.status === 202) return null;
  if (response.status !== 200) throw new Error("FDC_DA_UNAVAILABLE");
  const body = record(response.value);
  if (body.response_hex === undefined) return null;
  return decodeXrpPaymentDaProof(body);
}

export function calculateFdcVotingRound(
  requestBlockTimestamp: bigint,
  firstVotingRoundStartTimestamp: bigint,
  votingEpochDurationSeconds: bigint,
): bigint {
  if (
    votingEpochDurationSeconds <= 0n ||
    requestBlockTimestamp < firstVotingRoundStartTimestamp
  ) {
    throw new Error("INVALID_FDC_VOTING_ROUND_PARAMETERS");
  }
  return (
    (requestBlockTimestamp - firstVotingRoundStartTimestamp) /
    votingEpochDurationSeconds
  );
}
