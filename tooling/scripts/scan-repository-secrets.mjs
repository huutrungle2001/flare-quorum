import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const outputPath = resolve(
  repositoryRoot,
  "evidence/local/secret-scan.json",
);

const patterns = [
  {
    code: "PRIVATE_KEY_ASSIGNMENT",
    expression:
      /\b(?:SEPOLIA_(?:VENDOR_)?PRIVATE_KEY|FLARE_DEPLOYMENT_PRIVATE_KEY|FINALIZER_PRIVATE_KEY|PRIVATE_KEY)\s*[:=]\s*["']?(?:0x)?[0-9a-fA-F]{64}\b/,
  },
  {
    code: "SEED_ASSIGNMENT",
    expression:
      /\b(?:MNEMONIC|SEED_PHRASE)\s*[:=]\s*["']?(?!your_|optional_|test_)[^\s"']+(?:\s+[^\s"']+){5,}/i,
  },
  {
    code: "PEM_PRIVATE_KEY",
    expression: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    code: "GITHUB_TOKEN",
    expression: /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/,
  },
  {
    code: "SERVICE_TOKEN",
    expression:
      /\b(?:sk_(?:live|prod)_|sk-proj-|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/,
  },
  {
    code: "CREDENTIAL_IN_URL",
    expression: /\bhttps?:\/\/[^/\s:@]+:[^@\s/]+@/i,
  },
];

const evidence = {
  schemaVersion: 1,
  suite: "repository-secret-scan",
  recordedAt: new Date().toISOString(),
  publicIdentifiers: {
    sourceCommit: null,
    trackedFilesInspected: 0,
    historicalBlobsInspected: 0,
  },
  assertions: {
    localEnvironmentUntracked: false,
    repositoryHistoryClean: false,
    noPrivateKeyAssignments: false,
    noSeedOrPemMaterial: false,
    noProviderTokens: false,
    noCredentialUrls: false,
  },
  violations: [],
  notes: [
    "Git-tracked text files and historical Git blobs are inspected; ignored local environment files are checked for accidental tracking by path.",
    "Violation output contains rule codes and paths only, never matched secret-like values.",
  ],
};

function git(args, input) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function inspectSource(source, path, scope, seen) {
  if (source.includes("\0")) return;
  for (const pattern of patterns) {
    if (pattern.expression.test(source)) {
      const key = `${scope}:${pattern.code}:${path}`;
      if (!seen.has(key)) {
        seen.add(key);
        evidence.violations.push({
          code: pattern.code,
          path: `${scope}:${path}`,
        });
      }
    }
  }
}

function saveEvidence() {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
}

try {
  evidence.publicIdentifiers.sourceCommit = git([
    "rev-parse",
    "HEAD",
  ]).trim();
  const trackedFiles = git(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean);
  evidence.publicIdentifiers.trackedFilesInspected =
    trackedFiles.length;
  evidence.assertions.localEnvironmentUntracked =
    !trackedFiles.includes(".env.local");

  const seen = new Set();
  for (const relativePath of trackedFiles) {
    let source;
    try {
      source = readFileSync(
        resolve(repositoryRoot, relativePath),
        "utf8",
      );
    } catch {
      continue;
    }
    inspectSource(source, relativePath, "current", seen);
  }

  const historicalObjects = git(["rev-list", "--objects", "--all"])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(" ");
      return {
        object: separator === -1 ? line : line.slice(0, separator),
        path: separator === -1 ? "(unknown)" : line.slice(separator + 1),
      };
    });
  const historicalEnvironmentPath = historicalObjects.find(({ path }) =>
    /(?:^|\/)\.env(?:\.local|\.production|\.development)?$/.test(path),
  );
  if (historicalEnvironmentPath) {
    evidence.violations.push({
      code: "HISTORICAL_ENVIRONMENT_TRACKED",
      path: `history:${historicalEnvironmentPath.path}`,
    });
  }

  const objectPaths = new Map();
  for (const entry of historicalObjects) {
    if (!objectPaths.has(entry.object)) {
      objectPaths.set(entry.object, entry.path);
    }
  }
  const objectIds = [...objectPaths.keys()];
  const objectTypes = git(
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    `${objectIds.join("\n")}\n`,
  )
    .split("\n")
    .filter(Boolean);
  for (const line of objectTypes) {
    const [object, type, sizeText] = line.split(" ");
    if (type !== "blob" || Number(sizeText) > 2 * 1024 * 1024) continue;
    const source = git(["cat-file", "blob", object]);
    evidence.publicIdentifiers.historicalBlobsInspected += 1;
    inspectSource(
      source,
      objectPaths.get(object) ?? "(unknown)",
      "history",
      seen,
    );
  }

  const violationCodes = new Set(
    evidence.violations.map((violation) => violation.code),
  );
  evidence.assertions.repositoryHistoryClean =
    !evidence.violations.some(({ path }) => path?.startsWith("history:"));
  evidence.assertions.noPrivateKeyAssignments =
    !violationCodes.has("PRIVATE_KEY_ASSIGNMENT");
  evidence.assertions.noSeedOrPemMaterial =
    !violationCodes.has("SEED_ASSIGNMENT") &&
    !violationCodes.has("PEM_PRIVATE_KEY");
  evidence.assertions.noProviderTokens =
    !violationCodes.has("GITHUB_TOKEN") &&
    !violationCodes.has("SERVICE_TOKEN");
  evidence.assertions.noCredentialUrls =
    !violationCodes.has("CREDENTIAL_IN_URL");

  saveEvidence();
  if (
    !Object.values(evidence.assertions).every(Boolean) ||
    evidence.violations.length > 0
  ) {
    console.error(
      JSON.stringify({
        evidence: "evidence/local/secret-scan.json",
        violations: evidence.violations,
      }),
    );
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify({
        evidence: "evidence/local/secret-scan.json",
        assertions: evidence.assertions,
        trackedFilesInspected:
          evidence.publicIdentifiers.trackedFilesInspected,
      }),
    );
  }
} catch {
  evidence.violations.push({
    code: "SECRET_SCAN_FAILED",
    path: null,
  });
  saveEvidence();
  console.error(
    JSON.stringify({
      evidence: "evidence/local/secret-scan.json",
      violations: evidence.violations,
    }),
  );
  process.exitCode = 1;
}
