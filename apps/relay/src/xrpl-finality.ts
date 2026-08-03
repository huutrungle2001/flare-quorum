import type { Hex } from "viem";

export interface XrplFinality {
  transactionId: Hex;
  transactionLedgerIndex: number;
  validatedLedgerIndex: number;
  confirmations: number;
}

export interface XrplFinalityOptions {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

function transactionId(value: Hex): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("INVALID_XRPL_TRANSACTION_ID");
  }
  return value.slice(2).toUpperCase();
}

function integer(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(code);
  }
  return value;
}

async function rpc(
  url: string,
  method: string,
  params: Readonly<Record<string, unknown>>,
  options: XrplFinalityOptions,
): Promise<Record<string, unknown>> {
  const response = await (options.fetchImplementation ?? fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, params: [params] }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  });
  if (!response.ok) throw new Error("XRPL_RPC_UNAVAILABLE");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 256 * 1024) {
    throw new Error("XRPL_RPC_RESPONSE_TOO_LARGE");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new Error("MALFORMED_XRPL_RPC_RESPONSE");
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("MALFORMED_XRPL_RPC_RESPONSE");
  }
  const result = (decoded as Record<string, unknown>).result;
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("MALFORMED_XRPL_RPC_RESPONSE");
  }
  const record = result as Record<string, unknown>;
  if (typeof record.error === "string") throw new Error("XRPL_TRANSACTION_UNAVAILABLE");
  return record;
}

export async function inspectXrplFinality(
  rpcUrl: string,
  id: Hex,
  options: XrplFinalityOptions = {},
): Promise<XrplFinality> {
  const tx = await rpc(rpcUrl, "tx", { transaction: transactionId(id), binary: false }, options);
  if (tx.validated !== true) throw new Error("XRPL_TRANSACTION_NOT_VALIDATED");
  const transactionLedgerIndex = integer(tx.ledger_index, "MALFORMED_XRPL_TRANSACTION");
  const ledger = await rpc(rpcUrl, "ledger", { ledger_index: "validated" }, options);
  const validatedLedgerIndex = integer(
    ledger.ledger_index ??
      (ledger.ledger !== null && typeof ledger.ledger === "object"
        ? (ledger.ledger as Record<string, unknown>).ledger_index
        : undefined),
    "MALFORMED_XRPL_LEDGER",
  );
  if (validatedLedgerIndex < transactionLedgerIndex) {
    throw new Error("MALFORMED_XRPL_LEDGER");
  }
  return {
    transactionId: id,
    transactionLedgerIndex,
    validatedLedgerIndex,
    confirmations: validatedLedgerIndex - transactionLedgerIndex + 1,
  };
}

export async function waitForXrplFinality(input: {
  rpcUrl: string;
  transactionId: Hex;
  minimumConfirmations: number;
  attempts: number;
  pollIntervalMs: number;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<XrplFinality> {
  if (
    !Number.isSafeInteger(input.minimumConfirmations) ||
    input.minimumConfirmations < 1 ||
    !Number.isSafeInteger(input.attempts) ||
    input.attempts < 1
  ) {
    throw new Error("INVALID_XRPL_FINALITY_POLICY");
  }
  const sleep = input.sleep ?? ((milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < input.attempts; attempt += 1) {
    try {
      const finality = await inspectXrplFinality(input.rpcUrl, input.transactionId, {
        fetchImplementation: input.fetchImplementation,
      });
      if (finality.confirmations >= input.minimumConfirmations) return finality;
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (
        code !== "XRPL_TRANSACTION_UNAVAILABLE" &&
        code !== "XRPL_TRANSACTION_NOT_VALIDATED"
      ) {
        throw error;
      }
    }
    if (attempt + 1 < input.attempts) await sleep(input.pollIntervalMs);
  }
  throw new Error("XRPL_FINALITY_TIMEOUT");
}
