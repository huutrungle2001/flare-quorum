import deployment from "@veilbid/chain-bindings/addresses/sepolia.release";
import type { Address } from "viem";

export const winnerNotificationChangedEvent =
  "veilbid:winner-notifications-changed";

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function winnerNotificationStorageKey(account: Address) {
  return [
    "veilbid:winner-notifications:v1",
    deployment.chainId.toString(),
    deployment.contracts.VeilBidMarket.address.toLowerCase(),
    account.toLowerCase(),
  ].join(":");
}

export function readWinnerNotificationIds(
  account: Address,
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
) {
  if (!storage) return new Set<string>();
  try {
    const decoded: unknown = JSON.parse(
      storage.getItem(winnerNotificationStorageKey(account)) ?? "[]",
    );
    if (!Array.isArray(decoded)) return new Set<string>();
    return new Set(
      decoded.filter(
        (value): value is string =>
          typeof value === "string" && /^[1-9]\d*$/.test(value),
      ),
    );
  } catch {
    return new Set<string>();
  }
}

export function markWinnerNotificationsRead(
  account: Address,
  tenderIds: readonly bigint[],
  storage: Pick<Storage, "getItem" | "setItem"> | null = browserStorage(),
) {
  if (!storage) return;
  try {
    const readIds = readWinnerNotificationIds(account, storage);
    for (const tenderId of tenderIds) {
      if (tenderId > 0n) readIds.add(tenderId.toString());
    }
    const sortedIds = [...readIds].sort((left, right) => {
      const leftId = BigInt(left);
      const rightId = BigInt(right);
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
    storage.setItem(
      winnerNotificationStorageKey(account),
      JSON.stringify(sortedIds),
    );
  } catch {
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(winnerNotificationChangedEvent));
  }
}
