import {
  getAddress,
  isAddress,
  type Address,
} from "viem";

const storageKey = "veilbid.owner-safes.v1";
const maximumStoredSafes = 20;

export interface RememberedOwnerSafe {
  owner: Address;
  safe: Address;
  lastUsedAt: string;
}

function isRememberedOwnerSafe(
  value: unknown,
): value is RememberedOwnerSafe {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RememberedOwnerSafe>;
  return (
    typeof candidate.owner === "string" &&
    isAddress(candidate.owner) &&
    typeof candidate.safe === "string" &&
    isAddress(candidate.safe) &&
    typeof candidate.lastUsedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.lastUsedAt))
  );
}

function loadAll(
  storage: Pick<Storage, "getItem">,
): RememberedOwnerSafe[] {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRememberedOwnerSafe)
      .map((entry) => ({
        owner: getAddress(entry.owner),
        safe: getAddress(entry.safe),
        lastUsedAt: entry.lastUsedAt,
      }))
      .slice(0, maximumStoredSafes);
  } catch {
    return [];
  }
}

export function loadRememberedOwnerSafes(
  owner: Address,
  storage: Pick<Storage, "getItem"> = localStorage,
): Address[] {
  return loadAll(storage)
    .filter(
      (entry) => entry.owner.toLowerCase() === owner.toLowerCase(),
    )
    .map((entry) => entry.safe);
}

export function rememberOwnerSafe(
  owner: Address,
  safe: Address,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
) {
  const retained = loadAll(storage).filter(
    (entry) =>
      !(
        entry.owner.toLowerCase() === owner.toLowerCase() &&
        entry.safe.toLowerCase() === safe.toLowerCase()
      ),
  );
  const next: RememberedOwnerSafe = {
    owner: getAddress(owner),
    safe: getAddress(safe),
    lastUsedAt: new Date().toISOString(),
  };
  storage.setItem(
    storageKey,
    JSON.stringify([next, ...retained].slice(0, maximumStoredSafes)),
  );
}
