const storageKey = "flarequorum:funding-checkpoint:v1";
const legacyStorageKey = "veilbid:flare-funding-checkpoint:v1";
const xrplAddressPattern = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const transactionPattern = /^0x[0-9a-f]{64}$/i;

export interface PublicFlareFundingCheckpoint {
  schemaVersion: 1;
  xrplOwner: string;
  xrplTransactionId: `0x${string}`;
  walletId: string;
  executorFeeUBA: string;
}

function checkpointStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function parseCheckpoint(value: unknown): PublicFlareFundingCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set(["schemaVersion", "xrplOwner", "xrplTransactionId", "walletId", "executorFeeUBA"]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return null;
  if (
    record.schemaVersion !== 1 ||
    typeof record.xrplOwner !== "string" || !xrplAddressPattern.test(record.xrplOwner) ||
    typeof record.xrplTransactionId !== "string" || !transactionPattern.test(record.xrplTransactionId) ||
    typeof record.walletId !== "string" || !/^\d+$/.test(record.walletId) ||
    typeof record.executorFeeUBA !== "string" ||
    (record.executorFeeUBA !== "" && !/^\d+$/.test(record.executorFeeUBA))
  ) return null;
  return {
    schemaVersion: 1,
    xrplOwner: record.xrplOwner,
    xrplTransactionId: record.xrplTransactionId.toLowerCase() as `0x${string}`,
    walletId: record.walletId,
    executorFeeUBA: record.executorFeeUBA,
  };
}

export function readPublicFlareFundingCheckpoint(storage?: Storage): PublicFlareFundingCheckpoint | null {
  const target = checkpointStorage(storage);
  if (!target) return null;
  try {
    const current = parseCheckpoint(JSON.parse(target.getItem(storageKey) ?? "null"));
    if (current) return current;
    return parseCheckpoint(JSON.parse(target.getItem(legacyStorageKey) ?? "null"));
  } catch {
    return null;
  }
}

export function savePublicFlareFundingCheckpoint(
  checkpoint: Omit<PublicFlareFundingCheckpoint, "schemaVersion">,
  storage?: Storage,
): void {
  const target = checkpointStorage(storage);
  if (!target) return;
  const parsed = parseCheckpoint({ schemaVersion: 1, ...checkpoint });
  if (!parsed) throw new Error("FLARE_FUNDING_CHECKPOINT_INVALID");
  try {
    target.setItem(storageKey, JSON.stringify(parsed));
  } catch {
    // Persistence is optional; the live funding boundary remains usable when
    // the browser denies storage access.
  }
}

export function clearPublicFlareFundingCheckpoint(storage?: Storage): void {
  const target = checkpointStorage(storage);
  if (!target) return;
  try {
    target.removeItem(storageKey);
    target.removeItem(legacyStorageKey);
  } catch {
    // Ignore cleanup failures; no chain state or secret is affected.
  }
}
