import type { PublicTender } from "@flarequorum/chain-bindings";

function dateFromTimestamp(timestamp: bigint) {
  return new Date(Number(timestamp) * 1_000);
}

export function formatLocalDeadline(
  timestamp: bigint,
  timeZone?: string,
) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(dateFromTimestamp(timestamp));
}

export function formatUtcDeadline(timestamp: bigint) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(dateFromTimestamp(timestamp));
}

export function remainingTimeLabel(
  deadline: bigint,
  nowMilliseconds = Date.now(),
) {
  const remainingSeconds = Number(deadline) - Math.floor(nowMilliseconds / 1_000);
  if (remainingSeconds <= 0) return "Expired";
  if (remainingSeconds < 60) return `${remainingSeconds}s left`;
  const minutes = Math.floor(remainingSeconds / 60);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;
  if (hours < 24) {
    return leftoverMinutes > 0
      ? `${hours}h ${leftoverMinutes}m left`
      : `${hours}h left`;
  }
  const days = Math.floor(hours / 24);
  const leftoverHours = hours % 24;
  return leftoverHours > 0 ? `${days}d ${leftoverHours}h left` : `${days}d left`;
}

export function isTenderAcceptingBids(
  tender: Pick<PublicTender, "status" | "bidDeadline">,
  nowMilliseconds = Date.now(),
) {
  return (
    tender.status === "Open" &&
    tender.bidDeadline > BigInt(Math.floor(nowMilliseconds / 1_000))
  );
}
