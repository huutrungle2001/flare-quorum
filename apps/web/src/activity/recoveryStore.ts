import { isHash, type Hex } from "viem";
import { sepolia } from "viem/chains";

export const recoveryStorageKey = "flarequorum:activity-recovery:v1";
export const recoveryChangedEvent = "flarequorum:activity-recovery-changed";

export type RecoveryKind = "funding" | "winner";

export interface RecoveryRecord {
  version: 1;
  chainId: typeof sepolia.id;
  kind: RecoveryKind;
  tenderId: string;
  triggerTransactionHash: Hex;
  createdAt: string;
  updatedAt: string;
}

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  );
}

function parseRecord(value: unknown): RecoveryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<RecoveryRecord>;
  if (
    candidate.version !== 1 ||
    candidate.chainId !== sepolia.id ||
    (candidate.kind !== "funding" && candidate.kind !== "winner") ||
    typeof candidate.tenderId !== "string" ||
    !/^[1-9]\d*$/.test(candidate.tenderId) ||
    typeof candidate.triggerTransactionHash !== "string" ||
    !isHash(candidate.triggerTransactionHash) ||
    !isTimestamp(candidate.createdAt) ||
    !isTimestamp(candidate.updatedAt)
  ) {
    return null;
  }
  return candidate as RecoveryRecord;
}

export function readRecoveryRecords(
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): RecoveryRecord[] {
  if (!storage) return [];
  try {
    const decoded: unknown = JSON.parse(
      storage.getItem(recoveryStorageKey) ?? "[]",
    );
    if (!Array.isArray(decoded)) return [];
    const deduplicated = new Map<string, RecoveryRecord>();
    for (const value of decoded) {
      const record = parseRecord(value);
      if (!record) continue;
      const key = `${record.kind}:${record.tenderId}`;
      const previous = deduplicated.get(key);
      if (!previous || record.updatedAt > previous.updatedAt) {
        deduplicated.set(key, record);
      }
    }
    return [...deduplicated.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  } catch {
    return [];
  }
}

function writeRecords(
  records: readonly RecoveryRecord[],
  storage: Pick<Storage, "setItem">,
) {
  storage.setItem(recoveryStorageKey, JSON.stringify(records));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(recoveryChangedEvent));
  }
}

export function saveRecoveryRecord(
  input: {
    kind: RecoveryKind;
    tenderId: bigint;
    triggerTransactionHash: Hex;
  },
  storage: Pick<Storage, "getItem" | "setItem"> | null = browserStorage(),
  now = new Date(),
) {
  if (!storage || input.tenderId <= 0n || !isHash(input.triggerTransactionHash)) {
    throw new Error("Recovery record contains invalid public identifiers.");
  }
  const timestamp = now.toISOString();
  const records = readRecoveryRecords(storage);
  const key = `${input.kind}:${input.tenderId.toString()}`;
  const existing = records.find(
    (record) => `${record.kind}:${record.tenderId}` === key,
  );
  const record: RecoveryRecord = {
    version: 1,
    chainId: sepolia.id,
    kind: input.kind,
    tenderId: input.tenderId.toString(),
    triggerTransactionHash: input.triggerTransactionHash,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  writeRecords(
    [record, ...records.filter(
      (candidate) => `${candidate.kind}:${candidate.tenderId}` !== key,
    )],
    storage,
  );
  return record;
}

export function removeRecoveryRecord(
  kind: RecoveryKind,
  tenderId: bigint,
  storage: Pick<Storage, "getItem" | "setItem"> | null = browserStorage(),
) {
  if (!storage) return;
  writeRecords(
    readRecoveryRecords(storage).filter(
      (record) =>
        record.kind !== kind || record.tenderId !== tenderId.toString(),
    ),
    storage,
  );
}
