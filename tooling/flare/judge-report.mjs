const statusValues = new Set(["PASSED", "BLOCKED"]);
const blockerPattern = /^[A-Z][A-Z0-9_]+$/;
const digestPattern = /^[0-9a-f]{64}$/;
const forbiddenKeys = new Set([
  "apiKey",
  "bidPayload",
  "body",
  "ciphertext",
  "credential",
  "mnemonic",
  "plaintext",
  "privateKey",
  "responseBody",
  "seed",
  "signature",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inspectForbiddenKeys(value, path, violations) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectForbiddenKeys(entry, `${path}[${index}]`, violations));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) violations.push(`${path}.${key}: forbidden report field`);
    inspectForbiddenKeys(entry, `${path}.${key}`, violations);
  }
}

function validateBlockers(value, path, violations) {
  if (!Array.isArray(value) || value.some((entry) =>
    typeof entry !== "string" || !blockerPattern.test(entry))) {
    violations.push(`${path}: invalid blockers`);
    return;
  }
  if (new Set(value).size !== value.length) violations.push(`${path}: duplicate blockers`);
}

function validateStatus(value, blockers, path, violations) {
  if (!statusValues.has(value)) violations.push(`${path}.status: invalid status`);
  if (value === "PASSED" && blockers?.length !== 0) {
    violations.push(`${path}: passed report has blockers`);
  }
  if (value === "BLOCKED" && blockers?.length === 0) {
    violations.push(`${path}: blocked report has no blocker`);
  }
}

function validateOffline(value, violations) {
  if (!isObject(value) || value.schemaVersion !== 1 || value.suite !== "flarequorum-judge-offline") {
    violations.push("$.offline: invalid identity");
    return;
  }
  validateBlockers(value.blockers, "$.offline.blockers", violations);
  validateStatus(value.status, value.blockers, "$.offline", violations);
  if (!Array.isArray(value.checks) || value.checks.length === 0) {
    violations.push("$.offline.checks: missing checks");
    return;
  }
  const names = new Set();
  for (const [index, check] of value.checks.entries()) {
    const path = `$.offline.checks[${index}]`;
    if (!isObject(check) || !/^[a-z][a-z0-9-]+$/.test(check.name ?? "")) {
      violations.push(`${path}: invalid check identity`);
      continue;
    }
    if (names.has(check.name)) violations.push(`${path}: duplicate check name`);
    names.add(check.name);
    if (!new Set(["PASSED", "FAILED"]).has(check.status)) violations.push(`${path}: invalid status`);
    if (check.exitCode !== null && !Number.isInteger(check.exitCode)) violations.push(`${path}: invalid exit code`);
    if (!Number.isInteger(check.durationMs) || check.durationMs < 0) violations.push(`${path}: invalid duration`);
    if (!digestPattern.test(check.outputSha256 ?? "")) violations.push(`${path}: invalid output digest`);
  }
}

function validateLive(value, violations) {
  if (!isObject(value) || value.schemaVersion !== 1 || value.suite !== "flarequorum-judge-live-read-only") {
    violations.push("$.live: invalid identity");
    return;
  }
  validateBlockers(value.blockers, "$.live.blockers", violations);
  validateStatus(value.status, value.blockers, "$.live", violations);
  const assertions = Object.values(value.assertions ?? {});
  if (assertions.length === 0 || assertions.some((entry) => typeof entry !== "boolean")) {
    violations.push("$.live.assertions: invalid assertions");
  }
  if (value.status === "PASSED" && assertions.some((entry) => !entry)) {
    violations.push("$.live: passed report has failed assertion");
  }
  const machineAvailability = Array.isArray(value.machineAvailability)
    ? value.machineAvailability
    : [];
  if (!Array.isArray(value.machineAvailability) || machineAvailability.length > 3) {
    violations.push("$.live.machineAvailability: invalid machine set");
  }
  if (value.assertions?.threeReleaseMachinesChecked === true && machineAvailability.length !== 3) {
    violations.push("$.live.machineAvailability: incomplete machine set");
  }
}

export function validateJudgeReport(report) {
  const violations = [];
  if (!isObject(report) || report.schemaVersion !== 1 || report.suite !== "flarequorum-judge-verification") {
    violations.push("$: invalid report identity");
    return { valid: false, violations };
  }
  validateBlockers(report.blockers, "$.blockers", violations);
  validateStatus(report.status, report.blockers, "$", violations);
  if (report.offline === null && report.live === null) violations.push("$: no verification profile");
  if (report.offline !== null) validateOffline(report.offline, violations);
  if (report.live !== null) validateLive(report.live, violations);
  inspectForbiddenKeys(report, "$", violations);
  return { valid: violations.length === 0, violations };
}
