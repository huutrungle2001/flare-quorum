import {
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import {
  assertFlareScoringPolicy,
  type FlareCredentialRequirement,
  type FlareScoringPolicy,
  type FlareTenderTerms,
} from "@veilbid/flare-bindings";

export interface FlareFundingJob {
  version: 1;
  xrplTransactionId: Hex;
  personalAccount: Address;
  nonce: bigint;
  walletId: number;
  executorFeeUBA: bigint;
  terms: FlareTenderTerms;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  code: string,
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) throw new Error(code);
}

function bigintString(value: unknown, code: string): bigint {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw new Error(code);
  return BigInt(value);
}

function uint16Number(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new Error(code);
  }
  return value;
}

function boolean(value: unknown, code: string): boolean {
  if (typeof value !== "boolean") throw new Error(code);
  return value;
}

function address(value: unknown, code: string): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new Error(code);
  return getAddress(value);
}

function fixedHex(value: unknown, bytes: number, code: string): Hex {
  if (
    typeof value !== "string" ||
    !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(code);
  }
  return value.toLowerCase() as Hex;
}

function addressArray(value: unknown, code: string): readonly Address[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw new Error(code);
  }
  const parsed = value.map((item) => address(item, code));
  if (new Set(parsed.map((item) => item.toLowerCase())).size !== parsed.length) {
    throw new Error(code);
  }
  return parsed;
}

function triple<T>(value: unknown, parse: (item: unknown) => T, code: string): readonly [T, T, T] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(code);
  const parsed = value.map(parse);
  return [parsed[0]!, parsed[1]!, parsed[2]!];
}

function credentialRequirements(value: unknown): readonly FlareCredentialRequirement[] {
  if (!Array.isArray(value) || value.length > 4) {
    throw new Error("INVALID_REQUIRED_CREDENTIALS");
  }
  return value.map((item) => {
    const parsed = object(item, "INVALID_REQUIRED_CREDENTIALS");
    exactKeys(parsed, ["credentialType", "issuer"], "UNKNOWN_CREDENTIAL_REQUIREMENT_FIELD");
    return {
      credentialType: fixedHex(parsed.credentialType, 32, "INVALID_CREDENTIAL_TYPE"),
      issuer: address(parsed.issuer, "INVALID_CREDENTIAL_ISSUER"),
    };
  });
}

function scoringPolicy(value: unknown): FlareScoringPolicy {
  const parsed = object(value, "INVALID_FLARE_SCORING_POLICY");
  exactKeys(parsed, [
    "schemaVersion",
    "ceilingXrpMicros",
    "bidDeadline",
    "allowXrp",
    "allowUsd",
    "ftsoFeedId",
    "maxDeliveryDays",
    "minWarrantyDays",
    "maxWarrantyDays",
    "priceWeightBps",
    "deliveryWeightBps",
    "warrantyWeightBps",
    "requiredCredentials",
  ], "UNKNOWN_FLARE_SCORING_POLICY_FIELD");
  const policy: FlareScoringPolicy = {
    schemaVersion: uint16Number(parsed.schemaVersion, "INVALID_SCORING_SCHEMA_VERSION"),
    ceilingXrpMicros: bigintString(parsed.ceilingXrpMicros, "INVALID_PUBLIC_CEILING_XRP"),
    bidDeadline: bigintString(parsed.bidDeadline, "INVALID_BID_DEADLINE"),
    allowXrp: boolean(parsed.allowXrp, "INVALID_ALLOW_XRP"),
    allowUsd: boolean(parsed.allowUsd, "INVALID_ALLOW_USD"),
    ftsoFeedId: fixedHex(parsed.ftsoFeedId, 21, "INVALID_FTSO_FEED_ID"),
    maxDeliveryDays: uint16Number(parsed.maxDeliveryDays, "INVALID_MAX_DELIVERY_DAYS"),
    minWarrantyDays: uint16Number(parsed.minWarrantyDays, "INVALID_MIN_WARRANTY_DAYS"),
    maxWarrantyDays: uint16Number(parsed.maxWarrantyDays, "INVALID_MAX_WARRANTY_DAYS"),
    priceWeightBps: uint16Number(parsed.priceWeightBps, "INVALID_PRICE_WEIGHT_BPS"),
    deliveryWeightBps: uint16Number(parsed.deliveryWeightBps, "INVALID_DELIVERY_WEIGHT_BPS"),
    warrantyWeightBps: uint16Number(parsed.warrantyWeightBps, "INVALID_WARRANTY_WEIGHT_BPS"),
    requiredCredentials: credentialRequirements(parsed.requiredCredentials),
  };
  assertFlareScoringPolicy(policy);
  return policy;
}

function terms(value: unknown): FlareTenderTerms {
  const parsed = object(value, "INVALID_FLARE_FUNDING_TERMS");
  exactKeys(parsed, [
    "metadataHash",
    "scoringPolicy",
    "approvedVendors",
    "extensionId",
    "codeVersion",
    "teeIds",
    "teeKeyFingerprints",
  ], "UNKNOWN_FLARE_FUNDING_TERM");
  const extensionId = bigintString(parsed.extensionId, "INVALID_EXTENSION_ID");
  if (extensionId < 65_536n) {
    throw new Error("INVALID_FLARE_FUNDING_TERMS");
  }
  const teeIds = triple(parsed.teeIds, (item) => address(item, "INVALID_TEE_IDS"), "INVALID_TEE_IDS");
  if (new Set(teeIds.map((item) => item.toLowerCase())).size !== 3) {
    throw new Error("INVALID_TEE_IDS");
  }
  const teeKeyFingerprints = triple(
    parsed.teeKeyFingerprints,
    (item) => fixedHex(item, 32, "INVALID_TEE_KEY_FINGERPRINTS"),
    "INVALID_TEE_KEY_FINGERPRINTS",
  );
  if (new Set(teeKeyFingerprints).size !== 3) {
    throw new Error("INVALID_TEE_KEY_FINGERPRINTS");
  }
  return {
    metadataHash: fixedHex(parsed.metadataHash, 32, "INVALID_METADATA_HASH"),
    scoringPolicy: scoringPolicy(parsed.scoringPolicy),
    approvedVendors: addressArray(parsed.approvedVendors, "INVALID_APPROVED_VENDORS"),
    extensionId,
    codeVersion: fixedHex(parsed.codeVersion, 32, "INVALID_CODE_VERSION"),
    teeIds,
    teeKeyFingerprints,
  };
}

/** Parse the public-safe job. Integer values must be decimal strings. */
export function parseFlareFundingJob(value: unknown): FlareFundingJob {
  const parsed = object(value, "INVALID_FLARE_FUNDING_JOB");
  exactKeys(parsed, [
    "version",
    "xrplTransactionId",
    "personalAccount",
    "nonce",
    "walletId",
    "executorFeeUBA",
    "terms",
  ], "UNKNOWN_FLARE_FUNDING_JOB_FIELD");
  if (parsed.version !== 1) throw new Error("UNSUPPORTED_FLARE_FUNDING_JOB_VERSION");
  if (
    typeof parsed.walletId !== "number" ||
    !Number.isInteger(parsed.walletId) ||
    parsed.walletId < 0 ||
    parsed.walletId > 255
  ) {
    throw new Error("INVALID_SMART_ACCOUNT_WALLET_ID");
  }
  const executorFeeUBA = bigintString(parsed.executorFeeUBA, "INVALID_EXECUTOR_FEE_UBA");
  if (executorFeeUBA > 0xffff_ffff_ffff_ffffn) {
    throw new Error("INVALID_EXECUTOR_FEE_UBA");
  }
  return {
    version: 1,
    xrplTransactionId: fixedHex(
      parsed.xrplTransactionId,
      32,
      "INVALID_XRPL_TRANSACTION_ID",
    ),
    personalAccount: address(parsed.personalAccount, "INVALID_PERSONAL_ACCOUNT"),
    nonce: bigintString(parsed.nonce, "INVALID_SMART_ACCOUNT_NONCE"),
    walletId: parsed.walletId,
    executorFeeUBA,
    terms: terms(parsed.terms),
  };
}
