import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const packageRoot = resolve(root, "submission/flarequorum");
const requiredFiles = [
  "README.md",
  "PRIVACY-TRUST-TALK.md",
  "NEW-WORK-LEDGER.md",
];
const requiredText = [
  "https://flare-quorum.vercel.app",
  "https://github.com/huutrungle2001/flare-quorum",
  "evidence/coston2/market-v2-refresh-multi-vendor-success.json",
  "evidence/coston2/market-v2-refresh-one-result-outage.json",
  "evidence/coston2/fcc-market-v2-machines-refresh.json",
  "evidence/coston2/fassets-redemption.release.json",
  "evidence/coston2/website-acceptance.release.json",
  "RedemptionRequested",
  "0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC",
  "extension `66142`",
  "Confidential Compute Apps",
];
const submissionRequirementText = [
  "Project name",
  "Selected bounties",
  "Short description",
  "Target users",
  "Working demo",
  "GitHub repository",
  "Why the Flare integration is essential",
  "Existing project and Summer Signal work",
  "Verified deployment",
  "Roadmap",
  "Honest release boundary",
  "Interoperable Asset Products",
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
for (const text of submissionRequirementText) {
  if (!packageText.includes(text)) blockers.push(`JUDGE_PACKAGE_REQUIREMENT_MISSING_${text.slice(0, 20).replace(/[^A-Z0-9]+/gi, "_").toUpperCase()}`);
}
for (const pattern of forbiddenPatterns) {
  if (pattern.test(packageText)) blockers.push("JUDGE_PACKAGE_FORBIDDEN_SECRET_OR_HISTORICAL_LINK");
}

const release = readJson(resolve(root, "packages/flare-contracts/deployments/coston2.release.json"), "JUDGE_PACKAGE_RELEASE_INVALID");
const machines = readJson(resolve(root, "evidence/coston2/fcc-market-v2-machines-refresh.json"), "JUDGE_PACKAGE_V2_MACHINES_INVALID");
const success = readJson(resolve(root, "evidence/coston2/market-v2-refresh-multi-vendor-success.json"), "JUDGE_PACKAGE_V2_SUCCESS_INVALID");
const recovery = readJson(resolve(root, "evidence/coston2/market-v2-refresh-one-result-outage.json"), "JUDGE_PACKAGE_V2_RECOVERY_INVALID");
const credentialNegative = readJson(resolve(root, "evidence/coston2/market-v2-refresh-invalid-credential.json"), "JUDGE_PACKAGE_V2_CREDENTIAL_INVALID");
const undispatchedRefund = readJson(resolve(root, "evidence/coston2/market-v2-undispatched-refund.json"), "JUDGE_PACKAGE_V2_UNDISPATCHED_REFUND_INVALID");
const selectionRefund = readJson(resolve(root, "evidence/coston2/market-v2-selection-expired-refund.json"), "JUDGE_PACKAGE_V2_SELECTION_REFUND_INVALID");
const ingress = readJson(resolve(root, "evidence/coston2/flare-ingress-v2-production.json"), "JUDGE_PACKAGE_INGRESS_EVIDENCE_INVALID");
const web = readJson(resolve(root, "evidence/coston2/web-v2-production-smoke.json"), "JUDGE_PACKAGE_V2_WEB_INVALID");
const accessibility = readJson(resolve(root, "evidence/coston2/web-v2-keyboard-accessibility.json"), "JUDGE_PACKAGE_V2_ACCESSIBILITY_INVALID");
const xrpDraft = readJson(resolve(root, "evidence/coston2/web-v2-xrp-funding-draft.json"), "JUDGE_PACKAGE_V2_XRP_DRAFT_INVALID");
const xrpCheckpoint = readJson(resolve(root, "evidence/coston2/web-v2-xrp-funding-checkpoint.json"), "JUDGE_PACKAGE_V2_XRP_CHECKPOINT_INVALID");
const websiteAcceptance = readJson(resolve(root, "evidence/coston2/website-acceptance.release.json"), "JUDGE_PACKAGE_WEBSITE_ACCEPTANCE_INVALID");
const recoveryAssertions = recovery.assertions ?? {};
const normalizeSet = (values) => [...(values ?? [])].map((value) => String(value).toLowerCase()).sort();
const releaseTeeIds = normalizeSet(release.fcc?.teeIds);
const machineEvidenceTeeIds = normalizeSet(machines.publicIdentifiers?.machines?.map(({ teeId }) => teeId));
const successTeeIds = normalizeSet(success.publicIdentifiers?.teeIds);
const recoveryTeeIds = normalizeSet(recovery.publicIdentifiers?.teeIds);
const ingressTeeIds = normalizeSet(ingress.publicIdentifiers?.machineIds);
const assertions = {
  packageFilesPresent: requiredFiles.every((file) => existsSync(resolve(packageRoot, file))),
  currentV2LinksPresent: requiredText.every((text) => packageText.includes(text)),
  submissionRequirementsMapped: submissionRequirementText.every((text) => packageText.includes(text)),
  noForbiddenSecretOrHistoricalLink: forbiddenPatterns.every((pattern) => !pattern.test(packageText)),
  verifiedCoston2V2Release: release.chainId === 114
    && release.verified === true
    && release.consumerSelectable === true
    && release.kind === "flarequorum-v2-release",
  refreshedMachinesPassed: machines.status === "PASSED"
    && machines.gate === "FCC_MARKET_V2_MACHINES"
    && Object.values(machines.assertions ?? {}).every(Boolean),
  successLifecyclePassed: success.status === "PASSED"
    && success.gate === "FLARE_V2_SUCCESS_LIFECYCLE"
    && success.assertions?.selectionResultThresholdSatisfied === true,
  recoveryEvidencePassed: recovery.status === "PASSED" && recovery.gate === "FLARE_V2_SUCCESS_RECOVERY",
  recoveryThresholdProof: recoveryAssertions.oneSelectionResultUnavailableStillFinalized === true && recoveryAssertions.selectionResultSignedByTwoDistinctFrozenTees === true,
  credentialNegativePassed: credentialNegative.status === "PASSED"
    && Object.values(credentialNegative.assertions ?? {}).every(Boolean),
  refundLifecyclesPassed: undispatchedRefund.status === "PASSED"
    && selectionRefund.status === "PASSED"
    && Object.values(undispatchedRefund.assertions ?? {}).every(Boolean)
    && Object.values(selectionRefund.assertions ?? {}).every(Boolean),
  currentMachineSetConsistent: releaseTeeIds.length === 3
    && JSON.stringify(releaseTeeIds) === JSON.stringify(machineEvidenceTeeIds)
    && JSON.stringify(releaseTeeIds) === JSON.stringify(successTeeIds)
    && JSON.stringify(releaseTeeIds) === JSON.stringify(recoveryTeeIds)
    && JSON.stringify(releaseTeeIds) === JSON.stringify(ingressTeeIds),
  hostedIngressBoundToCurrentTender: ingress.assertions?.healthTenderBound === true
    && [success.publicIdentifiers?.tenderId, recovery.publicIdentifiers?.tenderId].includes(ingress.publicIdentifiers?.healthTenderId)
    && ingress.publicIdentifiers?.healthTenderStatus === "Awarded",
  hostedV2WebPassed: web.blockers?.length === 0
    && web.publicIdentifiers?.market === release.contracts?.FlareQuorumMarketV2?.address
    && Object.values(web.assertions ?? {}).every(Boolean),
  hostedAccessibilityPassed: accessibility.blockers?.length === 0
    && Object.values(accessibility.assertions ?? {}).every(Boolean),
  hostedXrpFundingUxPassed: xrpDraft.blockers?.length === 0
    && xrpCheckpoint.blockers?.length === 0
    && Object.values(xrpDraft.assertions ?? {}).every(Boolean)
    && Object.values(xrpCheckpoint.assertions ?? {}).every(Boolean),
  ownerOperatedWebsiteAcceptancePassed: websiteAcceptance.status === "PASSED"
    && websiteAcceptance.network?.chainId === 114
    && websiteAcceptance.publicIdentifiers?.canonicalUrl === "https://flare-quorum.vercel.app"
    && websiteAcceptance.publicIdentifiers?.testOperator === "project-owner"
    && Object.values(websiteAcceptance.assertions ?? {}).every(Boolean)
    && websiteAcceptance.blockers?.length === 0,
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
    market: release.contracts?.FlareQuorumMarketV2?.address ?? null,
    recoveryTenderId: recovery.publicIdentifiers?.tenderId ?? null,
    flagshipTenderId: success.publicIdentifiers?.tenderId ?? null,
  },
  assertions,
  blockers,
  notes: [
    "This check validates only public package files, release facts, and sanitized evidence references; it never reads .env.local.",
    "submission/flarequorum is the only current judge package; obsolete VeilBid submission media and guides are excluded.",
  ],
};
console.log(JSON.stringify(result, null, 2));
if (blockers.length > 0) process.exitCode = 1;
