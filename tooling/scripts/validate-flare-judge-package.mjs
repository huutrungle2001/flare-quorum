import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const packageRoot = resolve(root, "submission/flare");
const requiredFiles = [
  "README.md",
  "PRIVACY-TRUST-TALK.md",
  "NEW-WORK-LEDGER.md",
];
const requiredText = [
  "https://veilbid-flare.vercel.app",
  "https://github.com/huutrungle2001/veilbid-flare",
  "evidence/coston2/three-vendor-recovery.release.json",
  "0xFaEDc6793E72AFF05d29e6f0550d0FF8b90c4c05",
  "extension `66011`",
  "Confidential Compute Apps",
];
const forbiddenPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:PRIVATE_KEY|MNEMONIC|SEED_PHRASE|API_KEY|PASSWORD)\s*=/i,
  /\bprivateKey\s*[:=]\s*0x[0-9a-f]{64}\b/i,
  /github\.com\/huutrungle2001\/Veilbid(?:[/?#]|$)/,
];

function readJson(path, code) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(code);
  }
}

const blockers = [];
for (const file of requiredFiles) {
  if (!existsSync(resolve(packageRoot, file))) blockers.push(`JUDGE_PACKAGE_FILE_MISSING_${file.replace(/[^A-Z0-9]+/gi, "_").toUpperCase()}`);
}

const packageText = requiredFiles
  .filter((file) => existsSync(resolve(packageRoot, file)))
  .map((file) => readFileSync(resolve(packageRoot, file), "utf8"))
  .join("\n");
for (const text of requiredText) {
  if (!packageText.includes(text)) blockers.push(`JUDGE_PACKAGE_TEXT_MISSING_${text.slice(0, 20).replace(/[^A-Z0-9]+/gi, "_").toUpperCase()}`);
}
for (const pattern of forbiddenPatterns) {
  if (pattern.test(packageText)) blockers.push("JUDGE_PACKAGE_FORBIDDEN_SECRET_OR_HISTORICAL_LINK");
}

const release = readJson(resolve(root, "packages/flare-contracts/deployments/coston2.release.json"), "JUDGE_PACKAGE_RELEASE_INVALID");
const recovery = readJson(resolve(root, "evidence/coston2/three-vendor-recovery.release.json"), "JUDGE_PACKAGE_RECOVERY_EVIDENCE_INVALID");
const recoveryAssertions = recovery.assertions ?? {};
const assertions = {
  packageFilesPresent: requiredFiles.every((file) => existsSync(resolve(packageRoot, file))),
  currentV2LinksPresent: requiredText.every((text) => packageText.includes(text)),
  noForbiddenSecretOrHistoricalLink: forbiddenPatterns.every((pattern) => !pattern.test(packageText)),
  verifiedCoston2Release: release.chainId === 114 && release.verified === true,
  recoveryEvidencePassed: recovery.status === "PASSED" && recovery.gate === "C-E-F-RECOVERY",
  recoveryThresholdProof: recoveryAssertions.oneSelectionResultUnavailableStillFinalized === true && recoveryAssertions.selectionResultSignedByTwoDistinctFrozenTees === true,
};
for (const [name, passed] of Object.entries(assertions)) {
  if (!passed && !blockers.includes(`JUDGE_PACKAGE_${name.toUpperCase()}`)) blockers.push(`JUDGE_PACKAGE_${name.toUpperCase()}`);
}

const result = {
  schemaVersion: 1,
  suite: "flare-judge-package",
  status: blockers.length === 0 ? "PASSED" : "BLOCKED",
  publicIdentifiers: {
    network: "flare-coston2",
    chainId: 114,
    market: release.contracts?.VeilBidFlareMarket?.address ?? null,
    recoveryTenderId: recovery.publicIdentifiers?.tenderId ?? null,
  },
  assertions,
  blockers,
  notes: [
    "This check validates only public package files, release facts, and sanitized evidence references; it never reads .env.local.",
    "The parent submission pack remains historical Sepolia material and is intentionally excluded from this current Flare package.",
  ],
};
console.log(JSON.stringify(result, null, 2));
if (blockers.length > 0) process.exitCode = 1;
