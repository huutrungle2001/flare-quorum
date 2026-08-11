import { isAddress, keccak256, stringToHex, type Address, type Hex } from "viem";

export const flarePublicBuyerBriefCategories = [
  "software",
  "design",
  "marketing",
  "operations",
  "research",
] as const;

export type FlarePublicBuyerBriefCategory = typeof flarePublicBuyerBriefCategories[number];

export interface FlarePublicBuyerBriefInput {
  title: string;
  category: FlarePublicBuyerBriefCategory;
  objective: string;
  acceptanceCriteria: string;
  vendorQuestions: string;
  bidDeadline: bigint | string;
  approvedVendors: readonly Address[];
}

export interface FlarePublicBuyerBrief {
  schemaVersion: 1;
  title: string;
  category: FlarePublicBuyerBriefCategory;
  objective: string;
  acceptanceCriteria: string;
  vendorQuestions: string;
  asset: "FTestXRP";
  bidDeadline: string;
  approvedVendors: readonly Address[];
}

const categorySet = new Set<string>(flarePublicBuyerBriefCategories);
const allowedKeys = new Set([
  "schemaVersion",
  "title",
  "category",
  "objective",
  "acceptanceCriteria",
  "vendorQuestions",
  "asset",
  "bidDeadline",
  "approvedVendors",
]);

function normalizedText(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

function normalizedDeadline(value: bigint | string): string {
  const deadline = typeof value === "bigint" ? value.toString() : value.trim();
  if (!/^[1-9][0-9]*$/.test(deadline)) throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  return deadline;
}

function normalizedVendors(values: readonly Address[]): readonly Address[] {
  if (values.length < 1 || values.length > 8) throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  const vendors = values.map((vendor) => {
    if (!isAddress(vendor)) throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
    return vendor.toLowerCase() as Address;
  });
  if (new Set(vendors).size !== vendors.length) throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  return vendors;
}

export function canonicalFlarePublicBuyerBrief(input: FlarePublicBuyerBriefInput): FlarePublicBuyerBrief {
  const title = normalizedText(input.title);
  const objective = normalizedText(input.objective);
  const acceptanceCriteria = normalizedText(input.acceptanceCriteria);
  const vendorQuestions = normalizedText(input.vendorQuestions);
  if (title.length < 3 || title.length > 160) throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  if (!categorySet.has(input.category)) throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  if (objective.length < 20 || objective.length > 1_200) throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  if (acceptanceCriteria.length < 10 || acceptanceCriteria.length > 1_200) {
    throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  }
  if (vendorQuestions.length > 1_200) throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  return {
    schemaVersion: 1,
    title,
    category: input.category,
    objective,
    acceptanceCriteria,
    vendorQuestions,
    asset: "FTestXRP",
    bidDeadline: normalizedDeadline(input.bidDeadline),
    approvedVendors: normalizedVendors(input.approvedVendors),
  };
}

export function parseFlarePublicBuyerBrief(value: unknown): FlarePublicBuyerBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  }
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) {
    throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  }
  if (
    candidate.schemaVersion !== 1 || candidate.asset !== "FTestXRP" ||
    typeof candidate.title !== "string" || typeof candidate.category !== "string" ||
    !categorySet.has(candidate.category) || typeof candidate.objective !== "string" ||
    typeof candidate.acceptanceCriteria !== "string" || typeof candidate.vendorQuestions !== "string" ||
    typeof candidate.bidDeadline !== "string" || !Array.isArray(candidate.approvedVendors) ||
    !candidate.approvedVendors.every((vendor) => typeof vendor === "string" && isAddress(vendor))
  ) throw new Error("INVALID_FLARE_PUBLIC_BRIEF");
  return canonicalFlarePublicBuyerBrief({
    title: candidate.title,
    category: candidate.category as FlarePublicBuyerBriefCategory,
    objective: candidate.objective,
    acceptanceCriteria: candidate.acceptanceCriteria,
    vendorQuestions: candidate.vendorQuestions,
    bidDeadline: candidate.bidDeadline,
    approvedVendors: candidate.approvedVendors as Address[],
  });
}

export function serializeFlarePublicBuyerBrief(brief: FlarePublicBuyerBrief): string {
  return JSON.stringify(parseFlarePublicBuyerBrief(brief));
}

export function hashFlarePublicBuyerBrief(input: FlarePublicBuyerBriefInput | FlarePublicBuyerBrief): Hex {
  const brief = "schemaVersion" in input
    ? parseFlarePublicBuyerBrief(input)
    : canonicalFlarePublicBuyerBrief(input);
  return keccak256(stringToHex(JSON.stringify(brief)));
}
