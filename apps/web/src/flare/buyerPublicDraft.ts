import type { FlareBuyerBriefCategory } from "./FlareBuyerWorkspace";

export const buyerPublicDraftStorageKey = "flarequorum:buyer-public-draft:v1";

export interface BuyerPublicDraft {
  schemaVersion: 1;
  title: string;
  category: FlareBuyerBriefCategory;
  objective: string;
  acceptanceCriteria: string;
  vendorQuestions: string;
  ceiling: string;
  vendors: string[];
  deadlineMinutes: string;
  priceWeight: string;
  deliveryWeight: string;
  warrantyWeight: string;
}

type BuyerPublicDraftInput = Omit<BuyerPublicDraft, "schemaVersion" | "vendors"> & {
  vendors: readonly string[];
};

const categories = new Set<FlareBuyerBriefCategory>([
  "software",
  "design",
  "marketing",
  "operations",
  "research",
]);

const allowedKeys = new Set([
  "schemaVersion",
  "title",
  "category",
  "objective",
  "acceptanceCriteria",
  "vendorQuestions",
  "ceiling",
  "vendors",
  "deadlineMinutes",
  "priceWeight",
  "deliveryWeight",
  "warrantyWeight",
]);

function getSessionStorage(storage?: Storage) {
  if (storage) return storage;
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isBuyerPublicDraft(value: unknown): value is BuyerPublicDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return false;
  return candidate.schemaVersion === 1
    && typeof candidate.title === "string"
    && typeof candidate.category === "string"
    && categories.has(candidate.category as FlareBuyerBriefCategory)
    && typeof candidate.objective === "string"
    && typeof candidate.acceptanceCriteria === "string"
    && typeof candidate.vendorQuestions === "string"
    && typeof candidate.ceiling === "string"
    && Array.isArray(candidate.vendors)
    && candidate.vendors.length >= 1
    && candidate.vendors.length <= 8
    && candidate.vendors.every((vendor) => typeof vendor === "string")
    && typeof candidate.deadlineMinutes === "string"
    && typeof candidate.priceWeight === "string"
    && typeof candidate.deliveryWeight === "string"
    && typeof candidate.warrantyWeight === "string";
}

export function readBuyerPublicDraft(storage?: Storage): BuyerPublicDraft | null {
  const target = getSessionStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(buyerPublicDraftStorageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isBuyerPublicDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBuyerPublicDraft(input: BuyerPublicDraftInput, storage?: Storage) {
  const target = getSessionStorage(storage);
  if (!target) return;
  const publicDraft: BuyerPublicDraft = {
    schemaVersion: 1,
    title: input.title,
    category: input.category,
    objective: input.objective,
    acceptanceCriteria: input.acceptanceCriteria,
    vendorQuestions: input.vendorQuestions,
    ceiling: input.ceiling,
    vendors: [...input.vendors],
    deadlineMinutes: input.deadlineMinutes,
    priceWeight: input.priceWeight,
    deliveryWeight: input.deliveryWeight,
    warrantyWeight: input.warrantyWeight,
  };
  try {
    target.setItem(buyerPublicDraftStorageKey, JSON.stringify(publicDraft));
  } catch {
    // Session storage is optional; the form remains fully usable without it.
  }
}

export function clearBuyerPublicDraft(storage?: Storage) {
  try {
    getSessionStorage(storage)?.removeItem(buyerPublicDraftStorageKey);
  } catch {
    // Session storage is optional; clearing the visible form still succeeds.
  }
}
