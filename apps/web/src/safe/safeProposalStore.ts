import {
  getAddress,
  isAddress,
  isHex,
  type Address,
  type Hex,
} from "viem";
import type { SafeActionKind } from "./safePreparation";

const storageKey = "flarequorum.safe-proposals.v1";
const maximumStoredProposals = 20;

export interface StoredSafeProposal {
  kind: SafeActionKind;
  safe: Address;
  safeTxHash: Hex;
  createdAt: string;
}

function isStoredProposal(value: unknown): value is StoredSafeProposal {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredSafeProposal>;
  return (
    (candidate.kind === "setup" ||
      candidate.kind === "fund" ||
      candidate.kind === "tender" ||
      candidate.kind === "view-balance" ||
      candidate.kind === "withdraw-eth" ||
      candidate.kind === "withdraw-usdc" ||
      candidate.kind === "unwrap") &&
    typeof candidate.safe === "string" &&
    isAddress(candidate.safe) &&
    typeof candidate.safeTxHash === "string" &&
    isHex(candidate.safeTxHash, { strict: true }) &&
    candidate.safeTxHash.length === 66 &&
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt))
  );
}

export function loadSafeProposals(
  storage: Pick<Storage, "getItem"> = localStorage,
): StoredSafeProposal[] {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isStoredProposal)
      .map((proposal) => ({
        ...proposal,
        safe: getAddress(proposal.safe),
      }))
      .slice(0, maximumStoredProposals);
  } catch {
    return [];
  }
}

export function rememberSafeProposal(
  proposal: StoredSafeProposal,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
) {
  const retained = loadSafeProposals(storage).filter(
    ({ safeTxHash }) =>
      safeTxHash.toLowerCase() !== proposal.safeTxHash.toLowerCase(),
  );
  storage.setItem(
    storageKey,
    JSON.stringify([proposal, ...retained].slice(0, maximumStoredProposals)),
  );
}
