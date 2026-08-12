import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function readFccOperationalBaseline(repositoryRoot) {
  const baseline = JSON.parse(readFileSync(
    resolve(repositoryRoot, "tooling/flare/coston2-operational-baseline.json"),
    "utf8",
  ));
  if (
    baseline?.schemaVersion !== 1 ||
    baseline?.delivery?.method !== "POST" ||
    baseline?.delivery?.path !== "/instruction" ||
    baseline?.delivery?.externalPort !== 6664 ||
    baseline?.availability?.maxCheckAgeSeconds !== 21_600 ||
    baseline?.machines?.oneActiveIdentityPerEndpoint !== true
  ) {
    throw new Error("FCC_OPERATIONAL_BASELINE_INVALID");
  }
  return baseline;
}

export function evaluateAvailabilityWindow({
  endTs,
  validityDurationSeconds,
  checkpointTimestamp,
  maxCheckAgeSeconds,
  lastSigningPolicyId,
}) {
  const end = BigInt(endTs);
  const duration = BigInt(validityDurationSeconds);
  const checkpoint = BigInt(checkpointTimestamp);
  const maxAge = BigInt(maxCheckAgeSeconds);
  const checkedAt = end - duration;
  const age = checkpoint - checkedAt;
  const assertions = {
    validityDurationConfigured: duration > 0n && duration <= maxAge,
    validityNotExpired: end > checkpoint,
    checkTimestampNotFuture: checkedAt <= checkpoint,
    checkFresh: age >= 0n && age < maxAge,
  };
  return {
    status: Object.values(assertions).every(Boolean) ? "PASSED" : "FAILED",
    endTimestamp: Number(end),
    checkedAtTimestamp: Number(checkedAt),
    ageSeconds: Number(age),
    validityDurationSeconds: Number(duration),
    lastSigningPolicyId: Number(lastSigningPolicyId),
    assertions,
  };
}

export function operationTypesRespectReservations(operationTypes, reservedPrefixes) {
  return operationTypes.every((operationType) =>
    reservedPrefixes.every((prefix) => !operationType.startsWith(prefix))
  );
}
