import {
  verifySelectionActionResponse,
  type FccActionResponse,
  type FlareSelectionResult,
} from "@flarequorum/flare-bindings";
import { isAddressEqual, keccak256, stringToHex, type Address, type Hex } from "viem";

const coston2ChainId = 114n;
const resultThreshold = 2;
const maxProxyResponseBytes = 64 * 1024;

export interface FlareTenderSelectionContext {
  market: Address;
  tenderId: bigint;
  extensionId: bigint;
  codeVersion: Hex;
  rulesHash: Hex;
  orderedBidRoot: Hex;
  commonQuorumBitmap: number;
  ftsoFeedId: Hex;
  ftsoValue: bigint;
  ftsoDecimals: number;
  ftsoTimestamp: bigint;
  closeBlock: bigint;
  resultNonce: bigint;
  resultExpiry: bigint;
  requestId: Hex;
  teeIds: readonly [Address, Address, Address];
}

export interface TeeActionProof {
  actionId: Hex;
  submissionTagHash: Hex;
  status: number;
  signature: Hex;
}

export interface SelectionQuorum {
  result: FlareSelectionResult;
  resultData: Hex;
  proofs: readonly TeeActionProof[];
  teeIds: readonly Address[];
  resultDataHash: Hex;
}

export interface FccProxyFetch {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}

export class FccSelectionPendingError extends Error {
  readonly responses: number;
  readonly matchingSigners: number;

  constructor(responses: number, matchingSigners: number) {
    super("FCC_SELECTION_QUORUM_PENDING");
    this.name = "FccSelectionPendingError";
    this.responses = responses;
    this.matchingSigners = matchingSigners;
  }
}

function equalHex(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function assertSelectionEnvelope(result: FlareSelectionResult, context: FlareTenderSelectionContext): void {
  if (
    result.schemaVersion !== 1
    || result.chainId !== coston2ChainId
    || !isAddressEqual(result.market, context.market)
    || result.extensionId !== context.extensionId
    || !equalHex(result.codeVersion, context.codeVersion)
    || result.tenderId !== context.tenderId
    || !equalHex(result.rulesHash, context.rulesHash)
    || !equalHex(result.orderedBidRoot, context.orderedBidRoot)
    || result.quorumBitmap !== context.commonQuorumBitmap
    || !equalHex(result.ftsoFeedId, context.ftsoFeedId)
    || result.ftsoValue !== context.ftsoValue
    || result.ftsoDecimals !== context.ftsoDecimals
    || result.ftsoTimestamp !== context.ftsoTimestamp
    || result.closeBlock !== context.closeBlock
    || result.resultNonce !== context.resultNonce
    || result.expiry !== context.resultExpiry
  ) throw new Error("FCC_SELECTION_TENDER_BINDING_MISMATCH");
}

function quorumTeeIds(context: FlareTenderSelectionContext): Address[] {
  if (!Number.isInteger(context.commonQuorumBitmap)
    || context.commonQuorumBitmap < 0
    || (context.commonQuorumBitmap & ~0x07) !== 0) {
    throw new Error("INVALID_TENDER_TEE_QUORUM");
  }
  const ids = context.teeIds.filter((_, index) => (context.commonQuorumBitmap & (1 << index)) !== 0);
  if (ids.length < resultThreshold) throw new Error("INVALID_TENDER_TEE_QUORUM");
  return ids;
}

function actionResultUrl(proxyUrl: string, requestId: Hex): URL {
  const base = new URL(proxyUrl);
  if (base.username || base.password || base.search || base.hash) throw new Error("INVALID_FCC_PROXY_URL");
  const loopback = base.hostname === "localhost" || base.hostname === "127.0.0.1" || base.hostname === "[::1]";
  if (base.protocol !== "https:" && !(base.protocol === "http:" && loopback)) {
    throw new Error("INSECURE_FCC_PROXY_URL");
  }
  const suffix = base.pathname.endsWith("/") ? "" : "/";
  base.pathname = `${base.pathname}${suffix}action/result/${requestId}`;
  base.searchParams.set("submissionTag", "threshold");
  return base;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxProxyResponseBytes)) {
    throw new Error("FCC_PROXY_RESPONSE_TOO_LARGE");
  }
  if (response.body === null) throw new Error("INVALID_FCC_PROXY_JSON");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxProxyResponseBytes) {
      await reader.cancel();
      throw new Error("FCC_PROXY_RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks, bytes).toString("utf8");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("INVALID_FCC_PROXY_JSON");
  }
}

async function fetchProxyResult(
  proxyUrl: string,
  context: FlareTenderSelectionContext,
  allowedTeeIds: readonly Address[],
  expectedVersion: string,
  fetchImpl: FccProxyFetch,
): Promise<{ response: FccActionResponse; result: FlareSelectionResult; teeId: Address; dataHash: Hex }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(actionResultUrl(proxyUrl, context.requestId), {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("FCC_PROXY_RESULT_UNAVAILABLE");
    const verified = await verifySelectionActionResponse(await readBoundedJson(response), {
      actionId: context.requestId,
      chainId: coston2ChainId,
      allowedTeeIds,
      expectedVersion,
    });
    assertSelectionEnvelope(verified.result, context);
    return {
      response: verified.response,
      result: verified.result,
      teeId: verified.teeId,
      dataHash: keccak256(verified.response.result.data),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches public-safe selection outputs in parallel and requires two distinct
 * frozen TEE identities to sign the exact same canonical result bytes.
 */
export async function collectSelectionQuorum({
  proxyUrls,
  context,
  expectedVersion,
  fetchImpl = fetch,
}: {
  proxyUrls: readonly string[];
  context: FlareTenderSelectionContext;
  expectedVersion: string;
  fetchImpl?: FccProxyFetch;
}): Promise<SelectionQuorum> {
  if (proxyUrls.length < resultThreshold || new Set(proxyUrls).size !== proxyUrls.length) {
    throw new Error("INVALID_FCC_PROXY_SET");
  }
  if (expectedVersion.trim() === "") throw new Error("INVALID_FCC_EXTENSION_VERSION");
  const allowedTeeIds = quorumTeeIds(context);
  const settled = await Promise.allSettled(proxyUrls.map((url) =>
    fetchProxyResult(url, context, allowedTeeIds, expectedVersion, fetchImpl)));
  const valid = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  const groups = new Map<Hex, typeof valid>();
  for (const item of valid) {
    const group = groups.get(item.dataHash) ?? [];
    if (!group.some((candidate) => isAddressEqual(candidate.teeId, item.teeId))) group.push(item);
    groups.set(item.dataHash, group);
  }
  const quorum = [...groups.entries()]
    .filter(([, entries]) => entries.length >= resultThreshold)
    .sort((left, right) => right[1].length - left[1].length)[0];
  if (quorum === undefined) {
    const best = Math.max(0, ...[...groups.values()].map((entries) => entries.length));
    throw new FccSelectionPendingError(valid.length, best);
  }
  const [resultDataHash, entries] = quorum;
  const selected = entries.slice(0, resultThreshold);
  return {
    result: selected[0].result,
    resultData: selected[0].response.result.data,
    proofs: selected.map(({ response }) => ({
      actionId: response.result.id,
      submissionTagHash: keccak256(stringToHex(response.result.submissionTag)),
      status: response.result.status,
      signature: response.signature,
    })),
    teeIds: selected.map(({ teeId }) => teeId),
    resultDataHash,
  };
}
