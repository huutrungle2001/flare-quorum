import {
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  hashMessage,
  isAddressEqual,
  keccak256,
  recoverAddress,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import type { FlareSelectionResult } from "./protocol.js";

export const teeActionResultPrefix = stringToHex("TEE_ACTION_RESULT", { size: 32 });
export const proxyActionResultPrefix = stringToHex("PROXY_ACTION_RESULT", { size: 32 });
export const veilBidSelectionOpType = stringToHex("VEILBID_SELECTION", { size: 32 });
export const veilBidSelectV1OpCommand = stringToHex("SELECT_V1", { size: 32 });

const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;
const bytes21Pattern = /^0x[0-9a-fA-F]{42}$/;
const bytesPattern = /^0x(?:[0-9a-fA-F]{2})*$/;
const signaturePattern = /^0x[0-9a-fA-F]{130}$/;

const selectionResultParameter = [{
  type: "tuple",
  components: [
    { name: "schemaVersion", type: "uint16" },
    { name: "chainId", type: "uint256" },
    { name: "market", type: "address" },
    { name: "extensionId", type: "uint256" },
    { name: "codeVersion", type: "bytes32" },
    { name: "tenderId", type: "uint256" },
    { name: "rulesHash", type: "bytes32" },
    { name: "orderedBidRoot", type: "bytes32" },
    { name: "quorumBitmap", type: "uint8" },
    { name: "ftsoFeedId", type: "bytes21" },
    { name: "ftsoValue", type: "uint256" },
    { name: "ftsoDecimals", type: "int8" },
    { name: "ftsoTimestamp", type: "uint64" },
    { name: "closeBlock", type: "uint64" },
    { name: "winnerBidId", type: "uint256" },
    { name: "winner", type: "address" },
    { name: "winningAmountXrp", type: "uint256" },
    { name: "resultNonce", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
}] as const;

export type FccSubmissionTag = "submit" | "threshold" | "end";

export interface FccActionResult {
  id: Hex;
  submissionTag: FccSubmissionTag;
  status: number;
  log: string;
  opType: Hex;
  opCommand: Hex;
  additionalResultStatus: Hex;
  version: string;
  data: Hex;
}

export interface FccActionResponse {
  result: FccActionResult;
  signature: Hex;
  proxySignature: Hex;
}

export interface VerifiedSelectionAction {
  response: FccActionResponse;
  result: FlareSelectionResult;
  teeId: Address;
  actionResultHash: Hex;
  signingDigest: Hex;
}

export interface VerifySelectionActionOptions {
  actionId: Hex;
  chainId: bigint;
  allowedTeeIds: readonly Address[];
  expectedVersion?: string;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function hex(value: unknown, pattern: RegExp, code: string): Hex {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(code);
  return value.toLowerCase() as Hex;
}

function text(value: unknown, code: string): string {
  if (typeof value !== "string") throw new Error(code);
  return value;
}

function status(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 255) {
    throw new Error("INVALID_FCC_ACTION_STATUS");
  }
  return value as number;
}

function submissionTag(value: unknown): FccSubmissionTag {
  if (value !== "submit" && value !== "threshold" && value !== "end") {
    throw new Error("INVALID_FCC_SUBMISSION_TAG");
  }
  return value;
}

/** Parses the pinned tee-node ActionResponse JSON without retaining a raw body. */
export function parseFccActionResponse(value: unknown): FccActionResponse {
  const envelope = record(value, "INVALID_FCC_ACTION_RESPONSE");
  const result = record(envelope.result, "INVALID_FCC_ACTION_RESULT");
  return {
    result: {
      id: hex(result.id, bytes32Pattern, "INVALID_FCC_ACTION_ID"),
      submissionTag: submissionTag(result.submissionTag),
      status: status(result.status),
      log: text(result.log, "INVALID_FCC_ACTION_LOG"),
      opType: hex(result.opType, bytes32Pattern, "INVALID_FCC_OP_TYPE"),
      opCommand: hex(result.opCommand, bytes32Pattern, "INVALID_FCC_OP_COMMAND"),
      additionalResultStatus: hex(
        result.additionalResultStatus,
        bytesPattern,
        "INVALID_FCC_ADDITIONAL_STATUS",
      ),
      version: text(result.version, "INVALID_FCC_EXTENSION_VERSION"),
      data: hex(result.data, bytesPattern, "INVALID_FCC_ACTION_DATA"),
    },
    signature: hex(envelope.signature, signaturePattern, "INVALID_FCC_TEE_SIGNATURE"),
    proxySignature: hex(envelope.proxySignature, signaturePattern, "INVALID_FCC_PROXY_SIGNATURE"),
  };
}

/** Matches tee-node ActionResult.Hash exactly. */
export function fccActionResultHash(result: Pick<FccActionResult, "data" | "id" | "submissionTag" | "status">): Hex {
  return keccak256(concat([
    keccak256(result.data),
    result.id,
    keccak256(stringToHex(result.submissionTag)),
    toHex(result.status, { size: 1 }),
  ]));
}

/** Matches signing.NewPayload(prefix, chainID, resultHash).Hash exactly. */
export function fccSigningDigest(prefix: Hex, chainId: bigint, resultHash: Hex): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "bytes32" }],
    [prefix, chainId, resultHash],
  ));
}

export function decodeSelectionResult(data: Hex): FlareSelectionResult {
  if (!bytesPattern.test(data) || data === "0x") throw new Error("INVALID_FCC_SELECTION_DATA");
  let decoded: FlareSelectionResult;
  try {
    [decoded] = decodeAbiParameters(selectionResultParameter, data);
  } catch {
    throw new Error("INVALID_FCC_SELECTION_DATA");
  }
  const canonical = encodeAbiParameters(selectionResultParameter, [decoded]);
  if (canonical.toLowerCase() !== data.toLowerCase()) throw new Error("NON_CANONICAL_FCC_SELECTION_DATA");
  if (!bytes32Pattern.test(decoded.codeVersion)
    || !bytes32Pattern.test(decoded.rulesHash)
    || !bytes32Pattern.test(decoded.orderedBidRoot)
    || !bytes21Pattern.test(decoded.ftsoFeedId)) {
    throw new Error("INVALID_FCC_SELECTION_DATA");
  }
  return decoded;
}

/**
 * Verifies the contract-relevant TEE signature and frozen signer allowlist.
 * It deliberately returns only parsed public result fields, never the raw JSON.
 */
export async function verifySelectionActionResponse(
  value: unknown,
  options: VerifySelectionActionOptions,
): Promise<VerifiedSelectionAction> {
  const response = parseFccActionResponse(value);
  const action = response.result;
  if (action.id !== options.actionId.toLowerCase()) throw new Error("FCC_ACTION_ID_MISMATCH");
  if (action.submissionTag !== "submit" && action.submissionTag !== "threshold") {
    throw new Error("FCC_SELECTION_NOT_FINAL");
  }
  if (action.status !== 1) throw new Error("FCC_SELECTION_FAILED");
  if (action.opType !== veilBidSelectionOpType || action.opCommand !== veilBidSelectV1OpCommand) {
    throw new Error("FCC_SELECTION_OPERATION_MISMATCH");
  }
  if (options.expectedVersion !== undefined && action.version !== options.expectedVersion) {
    throw new Error("FCC_EXTENSION_VERSION_MISMATCH");
  }
  const actionResultHash = fccActionResultHash(action);
  const signingDigest = fccSigningDigest(teeActionResultPrefix, options.chainId, actionResultHash);
  const teeId = getAddress(await recoverAddress({
    hash: hashMessage({ raw: signingDigest }),
    signature: response.signature,
  }));
  if (!options.allowedTeeIds.some((allowed) => isAddressEqual(allowed, teeId))) {
    throw new Error("FCC_TEE_NOT_FROZEN_FOR_TENDER");
  }
  return {
    response,
    result: decodeSelectionResult(action.data),
    teeId,
    actionResultHash,
    signingDigest,
  };
}
