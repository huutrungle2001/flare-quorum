import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const evidenceRoot = resolve(root, "evidence");
const forbiddenKeys = new Set([
  "bidValue",
  "balanceValue",
  "decryptionProof",
  "encryptedHandle",
  "handle",
  "handleProof",
  "mnemonic",
  "paymentValue",
  "plaintext",
  "privateKey",
  "refundValue",
  "seed",
  "signature",
]);
const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/,
  /\b(?:PRIVATE_KEY|MNEMONIC|SEED_PHRASE)\s*=/,
];

function jsonFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? jsonFiles(path)
      : extname(path) === ".json"
        ? [path]
        : [];
  });
}

function inspect(value, path, violations) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      inspect(entry, `${path}[${index}]`, violations),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) {
        violations.push(`${path}.${key}: forbidden evidence field`);
      }
      inspect(entry, `${path}.${key}`, violations);
    }
  }
}

function inspectCoston2Foundation(value, file, violations) {
  const allowedTopLevel = new Set([
    "schemaVersion",
    "gate",
    "status",
    "recordedAt",
    "sourceCommit",
    "network",
    "publicIdentifiers",
    "assertions",
    "blockers",
    "notes",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedTopLevel.has(key)) {
      violations.push(`${file}.${key}: unexpected Gate 0 evidence field`);
    }
  }
  if (value.schemaVersion !== 1 || value.gate !== "0") {
    violations.push(`${file}: invalid Gate 0 schema identity`);
  }
  if (!["IN_PROGRESS", "PASSED"].includes(value.status)) {
    violations.push(`${file}: invalid Gate 0 status`);
  }
  if (
    value.network?.name !== "flare-coston2" ||
    value.network?.chainId !== 114 ||
    !/^\d+$/.test(value.network?.blockNumber ?? "")
  ) {
    violations.push(`${file}: invalid Coston2 network checkpoint`);
  }
  if (!/^[0-9a-f]{40}$/.test(value.sourceCommit ?? "")) {
    violations.push(`${file}: invalid source commit`);
  }
  if (
    !value.assertions ||
    Object.values(value.assertions).some((entry) => typeof entry !== "boolean")
  ) {
    violations.push(`${file}: assertions must be Boolean`);
  }
  if (
    !Array.isArray(value.blockers) ||
    value.blockers.some((entry) => !/^[A-Z0-9_]+$/.test(entry))
  ) {
    violations.push(`${file}: blockers must be allowlisted codes`);
  }
  if (
    value.status === "PASSED" &&
    (!Object.values(value.assertions ?? {}).every(Boolean) ||
      value.blockers.length !== 0)
  ) {
    violations.push(`${file}: a passed Gate 0 must have no failed assertion or blocker`);
  }
}

const violations = [];
for (const file of jsonFiles(evidenceRoot)) {
  const source = readFileSync(file, "utf8");
  for (const pattern of secretPatterns) {
    if (pattern.test(source)) {
      violations.push(`${file}: secret-like content`);
    }
  }
  const value = JSON.parse(source);
  inspect(value, file, violations);
  if (
    relative(evidenceRoot, file) ===
    "coston2/gate-0-foundations.json"
  ) {
    inspectCoston2Foundation(value, file, violations);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${jsonFiles(evidenceRoot).length} evidence files.`);
}
