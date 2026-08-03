import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

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

const violations = [];
for (const file of jsonFiles(evidenceRoot)) {
  const source = readFileSync(file, "utf8");
  for (const pattern of secretPatterns) {
    if (pattern.test(source)) {
      violations.push(`${file}: secret-like content`);
    }
  }
  inspect(JSON.parse(source), file, violations);
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${jsonFiles(evidenceRoot).length} evidence files.`);
}
