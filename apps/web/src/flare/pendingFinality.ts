import type { Address, Hex } from "viem";
import { useEffect, useState } from "react";

const pendingTenderKey = "flarequorum:coston2:pending-tender:v1";
const pendingBidKey = "flarequorum:coston2:pending-bid:v1";
export const pendingTenderChangedEvent = "flarequorum:pending-tender-changed";

export interface PendingFlareTender {
  version: 1;
  tenderId: string | null;
  transactionHash: Hex;
  blockNumber: string | null;
  buyer: Address;
  recordedAt: string;
}

export interface PendingFlareBid {
  version: 1;
  tenderId: string;
  vendor: Address;
  transactionHash: Hex;
  blockNumber: string | null;
  commitment: Hex;
  submissionNonce: string;
  receiptExpiry: string;
}

function validPendingTender(value: unknown): value is PendingFlareTender {
  if (!value || typeof value !== "object") return false;
  const pending = value as Partial<PendingFlareTender>;
  return pending.version === 1
    && (pending.tenderId === null || typeof pending.tenderId === "string" && /^[1-9][0-9]*$/.test(pending.tenderId))
    && typeof pending.transactionHash === "string"
    && /^0x[0-9a-fA-F]{64}$/.test(pending.transactionHash)
    && (pending.blockNumber === null || typeof pending.blockNumber === "string" && /^[0-9]+$/.test(pending.blockNumber))
    && typeof pending.buyer === "string"
    && /^0x[0-9a-fA-F]{40}$/.test(pending.buyer)
    && typeof pending.recordedAt === "string";
}

export function readPendingFlareTender(): PendingFlareTender | null {
  try {
    const raw = window.sessionStorage.getItem(pendingTenderKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validPendingTender(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingFlareTender(pending: PendingFlareTender): void {
  window.sessionStorage.setItem(pendingTenderKey, JSON.stringify(pending));
  window.dispatchEvent(new Event(pendingTenderChangedEvent));
}

export function clearPendingFlareTender(tenderId?: string): void {
  const current = readPendingFlareTender();
  if (tenderId && current?.tenderId !== tenderId) return;
  window.sessionStorage.removeItem(pendingTenderKey);
  window.dispatchEvent(new Event(pendingTenderChangedEvent));
}

export function usePendingFlareTender(
  canonicalTenderIds: readonly string[] = [],
): PendingFlareTender | null {
  const [pending, setPending] = useState(readPendingFlareTender);
  useEffect(() => {
    const sync = () => setPending(readPendingFlareTender());
    window.addEventListener(pendingTenderChangedEvent, sync);
    return () => window.removeEventListener(pendingTenderChangedEvent, sync);
  }, []);
  useEffect(() => {
    if (pending?.tenderId && canonicalTenderIds.includes(pending.tenderId)) {
      clearPendingFlareTender(pending.tenderId);
    }
  }, [canonicalTenderIds, pending]);
  return pending?.tenderId && canonicalTenderIds.includes(pending.tenderId) ? null : pending;
}

function validPendingBid(value: unknown): value is PendingFlareBid {
  if (!value || typeof value !== "object") return false;
  const pending = value as Partial<PendingFlareBid>;
  return pending.version === 1
    && typeof pending.tenderId === "string"
    && /^[1-9][0-9]*$/.test(pending.tenderId)
    && typeof pending.vendor === "string"
    && /^0x[0-9a-fA-F]{40}$/.test(pending.vendor)
    && typeof pending.transactionHash === "string"
    && /^0x[0-9a-fA-F]{64}$/.test(pending.transactionHash)
    && (pending.blockNumber === null || typeof pending.blockNumber === "string" && /^[0-9]+$/.test(pending.blockNumber))
    && typeof pending.commitment === "string"
    && /^0x[0-9a-fA-F]{64}$/.test(pending.commitment)
    && typeof pending.submissionNonce === "string"
    && /^[0-9]+$/.test(pending.submissionNonce)
    && typeof pending.receiptExpiry === "string"
    && /^[0-9]+$/.test(pending.receiptExpiry);
}

export function readPendingFlareBid(): PendingFlareBid | null {
  try {
    const raw = window.sessionStorage.getItem(pendingBidKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validPendingBid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingFlareBid(pending: PendingFlareBid): void {
  window.sessionStorage.setItem(pendingBidKey, JSON.stringify(pending));
}

export function clearPendingFlareBid(commitment?: Hex): void {
  const current = readPendingFlareBid();
  if (commitment && current?.commitment.toLowerCase() !== commitment.toLowerCase()) return;
  window.sessionStorage.removeItem(pendingBidKey);
}
