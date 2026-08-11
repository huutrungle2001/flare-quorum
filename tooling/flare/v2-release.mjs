import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const addressPattern = /^0x[0-9a-f]{40}$/i;
const hashPattern = /^0x[0-9a-f]{64}$/i;

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !value.startsWith("/") && !value.split("/").includes("..");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readV2ReleasePlan(repositoryRoot) {
  const plan = readJson(resolve(
    repositoryRoot,
    "tooling/flare/coston2-v2-release-plan.json",
  ));
  validateV2ReleasePlan(plan);
  return plan;
}

export function validateV2ReleasePlan(plan) {
  if (
    plan?.schemaVersion !== 1 ||
    plan.kind !== "flarequorum-v2-release-plan" ||
    plan.network !== "flare-coston2" ||
    plan.chainId !== 114 ||
    plan.status !== "LOCAL_CANDIDATE" ||
    plan.contracts?.market?.name !== "FlareQuorumMarketV2" ||
    plan.contracts?.awardReceipt?.name !== "FlareQuorumAwardReceiptV2"
  ) throw new Error("FLARE_V2_RELEASE_PLAN_INVALID");
  const paths = [
    ...Object.values(plan.artifacts ?? {}),
    plan.contracts.market.source,
    plan.contracts.market.artifact,
    plan.contracts.awardReceipt.source,
    plan.contracts.awardReceipt.artifact,
  ];
  if (!paths.every(safeRelativePath) || new Set(paths).size !== paths.length) {
    throw new Error("FLARE_V2_RELEASE_PATH_INVALID");
  }
  const requiredEnvironmentNames = Object.values(plan.runtimeEnvironment ?? {});
  if (
    requiredEnvironmentNames.length !== 6 ||
    !requiredEnvironmentNames.every((name) => /^[A-Z][A-Z0-9_]*$/.test(name)) ||
    new Set(requiredEnvironmentNames).size !== requiredEnvironmentNames.length
  ) throw new Error("FLARE_V2_RELEASE_ENVIRONMENT_INVALID");
  if (!Object.values(plan.promotionRequirements ?? {}).every((value) => value === true)) {
    throw new Error("FLARE_V2_PROMOTION_REQUIREMENTS_INVALID");
  }
  return true;
}

export function artifactAbiDigest(abi) {
  return createHash("sha256").update(JSON.stringify(abi)).digest("hex");
}

export function inspectV2LocalReadiness(repositoryRoot) {
  const plan = readV2ReleasePlan(repositoryRoot);
  const marketSource = readFileSync(resolve(repositoryRoot, plan.contracts.market.source), "utf8");
  const receiptSource = readFileSync(resolve(repositoryRoot, plan.contracts.awardReceipt.source), "utf8");
  const marketArtifact = readJson(resolve(repositoryRoot, plan.contracts.market.artifact));
  const receiptArtifact = readJson(resolve(repositoryRoot, plan.contracts.awardReceipt.artifact));
  const v1Release = readJson(resolve(
    repositoryRoot,
    "packages/flare-contracts/deployments/coston2.release.json",
  ));
  const marketAbi = marketArtifact.abi;
  const receiptAbi = receiptArtifact.abi;
  const runtime = marketArtifact.deployedBytecode?.object;
  const functionNames = new Set(
    marketAbi.filter(({ type }) => type === "function").map(({ name }) => name),
  );
  const refundEvent = marketAbi.find(
    ({ type, name }) => type === "event" && name === "TenderRefunded",
  );
  const v2ReleasePath = resolve(repositoryRoot, plan.artifacts.releaseManifest);
  const v2CandidatePath = resolve(repositoryRoot, plan.artifacts.candidateManifest);
  const v2Release = existsSync(v2ReleasePath) ? readJson(v2ReleasePath) : undefined;
  const v2Candidate = existsSync(v2CandidatePath) ? readJson(v2CandidatePath) : undefined;
  const assertions = {
    verifiedV1ReleasePreserved:
      v1Release.verified === true &&
      v1Release.contracts?.VeilBidFlareMarket?.address?.length > 0,
    v2MarketArtifactPresent:
      Array.isArray(marketAbi) && marketAbi.length > 0 &&
      typeof marketArtifact.bytecode?.object === "string",
    v2AwardReceiptArtifactPresent:
      Array.isArray(receiptAbi) && receiptAbi.length > 0,
    boundedUndispatchedRefundPresent:
      functionNames.has("refundUndispatchedTender") &&
      functionNames.has("CLOSED_REFUND_GRACE") &&
      marketSource.includes("RefundReason.UndispatchedTimeout"),
    explicitRefundReasonInAbi:
      refundEvent?.inputs?.some(({ name }) => name === "reason") === true,
    sideBySideContractNames:
      marketSource.includes("contract FlareQuorumMarketV2") &&
      receiptSource.includes("contract FlareQuorumAwardReceiptV2"),
    runtimeFitsEip170:
      typeof runtime === "string" && runtime.startsWith("0x") &&
      (runtime.length - 2) / 2 <= 24_576,
    v2ArtifactsCannotClaimReleaseWithoutPromotion:
      (!v2Candidate || v2Candidate.verified === false) &&
      (!v2Release || (v2Release.kind === "flarequorum-v2-release" && v2Release.verified === true)),
  };
  return {
    plan,
    status: Object.values(assertions).every(Boolean) ? "PASSED" : "FAILED",
    assertions,
    publicFacts: {
      marketContract: plan.contracts.market.name,
      awardReceiptContract: plan.contracts.awardReceipt.name,
      marketAbiSha256: artifactAbiDigest(marketAbi),
      awardReceiptAbiSha256: artifactAbiDigest(receiptAbi),
      runtimeSizeBytes: typeof runtime === "string" ? (runtime.length - 2) / 2 : 0,
      candidateManifestPresent: Boolean(v2Candidate),
      promotedReleasePresent: Boolean(v2Release),
    },
  };
}

function allAssertionsPass(record) {
  return record && typeof record === "object" &&
    record.assertions && typeof record.assertions === "object" &&
    Object.keys(record.assertions).length > 0 &&
    Object.values(record.assertions).every((value) => value === true) &&
    Array.isArray(record.blockers) && record.blockers.length === 0;
}

export function evaluateV2PromotionBundle({
  candidate,
  candidateDeployment,
  extension,
  governance,
  machines,
  success,
  recovery,
  invalidCredential,
  refund,
  v1Release,
}) {
  const market = candidate?.contracts?.FlareQuorumMarketV2?.address;
  const receipt = candidate?.contracts?.FlareQuorumAwardReceiptV2?.address;
  const extensionId = extension?.publicIdentifiers?.extensionId;
  const v1ExtensionId = String(v1Release?.fcc?.extensionId ?? "");
  const v1MachineIds = new Set(
    (v1Release?.fcc?.teeIds ?? []).map((value) => String(value).toLowerCase()),
  );
  const v2Machines = machines?.publicIdentifiers?.machines ?? [];
  const v2MachineIds = v2Machines.map(({ teeId }) => String(teeId).toLowerCase());
  const successVendors = success?.publicIdentifiers?.vendors ?? [];
  const recoveryTeeIds = (recovery?.publicIdentifiers?.teeIds ?? [])
    .map((teeId) => String(teeId).toLowerCase());
  const recoverySigners = (recovery?.publicIdentifiers?.selectionSignerIds ?? [])
    .map((teeId) => String(teeId).toLowerCase());
  const outageMachineIndex = Number(
    recovery?.publicIdentifiers?.selectionResultCollectionOutageMachineIndex,
  );
  const assertions = {
    candidateIsUnpromotedV2:
      candidate?.kind === "flarequorum-v2-candidate" &&
      candidate?.verified === false &&
      addressPattern.test(market ?? "") && addressPattern.test(receipt ?? ""),
    freshExtensionBoundToV2:
      /^\d+$/.test(String(extensionId ?? "")) &&
      String(extensionId) !== v1ExtensionId &&
      String(extension?.publicIdentifiers?.sender ?? "").toLowerCase() ===
        String(market ?? "").toLowerCase(),
    threeFreshMachines:
      v2MachineIds.length === 3 && new Set(v2MachineIds).size === 3 &&
      v2MachineIds.every((teeId) => addressPattern.test(teeId) && !v1MachineIds.has(teeId)),
    machineEvidencePassed:
      machines?.status === "PASSED" && allAssertionsPass(machines) &&
      machines.assertions?.exactActiveMachineSet === true,
    successLifecyclePassed:
      success?.status === "PASSED" && allAssertionsPass(success) &&
      success.assertions?.fccWinnerSelected === true &&
      success.assertions?.escrowConserved === true,
    threeVendorComparisonRecorded:
      success?.ingressBenchmarks?.vendorCount === 3 &&
      successVendors.length === 3 &&
      new Set(successVendors.map((vendor) => String(vendor).toLowerCase())).size === 3 &&
      success?.publicIdentifiers?.plaintextCommitments?.length === 3 &&
      success?.publicIdentifiers?.bidTransactions?.length === 3 &&
      success?.assertions?.threeEncryptedBidsAcceptedByDistinctTees === true,
    oneResultOutageRecoveryPassed:
      recovery?.gate === "FLARE_V2_SUCCESS_RECOVERY" &&
      recovery?.status === "PASSED" && allAssertionsPass(recovery) &&
      recovery?.ingressBenchmarks?.vendorCount === 3 &&
      recoveryTeeIds.length === 3 && new Set(recoveryTeeIds).size === 3 &&
      recoverySigners.length === 2 && new Set(recoverySigners).size === 2 &&
      Number.isInteger(outageMachineIndex) && outageMachineIndex >= 1 && outageMachineIndex <= 3 &&
      recoverySigners.every((teeId) => recoveryTeeIds.includes(teeId)) &&
      !recoverySigners.includes(recoveryTeeIds[outageMachineIndex - 1]) &&
      recovery?.assertions?.oneSelectionResultUnavailableStillFinalized === true,
    invalidCredentialRejectionPassed:
      invalidCredential?.gate === "FLARE_V2_INVALID_CREDENTIAL_REJECTION" &&
      invalidCredential?.status === "PASSED" && allAssertionsPass(invalidCredential) &&
      invalidCredential?.assertions?.wrongIssuerSignatureRejectedByAllThree === true &&
      invalidCredential?.assertions?.rejectedAttemptDidNotConsumeCanonicalSlot === true &&
      invalidCredential?.assertions?.correctedCredentialAcceptedByAllThree === true &&
      invalidCredential?.assertions?.noCredentialOrSignatureRecorded === true,
    undispatchedRefundLifecyclePassed:
      refund?.status === "PASSED" && allAssertionsPass(refund) &&
      refund.assertions?.selectionNeverDispatched === true &&
      refund.assertions?.fullEscrowReturned === true &&
      refund.assertions?.noAwardMinted === true &&
      refund.assertions?.refundReasonUndispatchedTimeout === true,
    candidateRuntimeRecorded:
      hashPattern.test(candidate?.contracts?.FlareQuorumMarketV2?.runtimeHash ?? ""),
    candidateDeploymentVerified:
      candidateDeployment?.status === "IN_PROGRESS" &&
      candidateDeployment?.assertions &&
      Object.values(candidateDeployment.assertions).every((value) => value === true),
    governanceVerified:
      governance?.status === "PASSED" && governance?.assertions &&
      Object.values(governance.assertions).every((value) => value === true),
  };
  return {
    status: Object.values(assertions).every(Boolean) ? "READY" : "BLOCKED",
    assertions,
  };
}

export function v2ProgressBlockers(assertions) {
  const requirements = [
    [
      ["candidateIsUnpromotedV2", "candidateRuntimeRecorded", "candidateDeploymentVerified"],
      "V2_CANDIDATE_NOT_DEPLOYED_OR_VERIFIED",
    ],
    [["freshExtensionBoundToV2"], "V2_EXTENSION_NOT_REGISTERED"],
    [["governanceVerified"], "V2_GOVERNANCE_NOT_VERIFIED"],
    [
      ["threeFreshMachines", "machineEvidencePassed"],
      "V2_THREE_FRESH_TEE_MACHINES_NOT_VERIFIED",
    ],
    [
      ["successLifecyclePassed", "threeVendorComparisonRecorded"],
      "V2_SUCCESS_LIFECYCLE_NOT_VERIFIED",
    ],
    [["oneResultOutageRecoveryPassed"], "V2_ONE_RESULT_OUTAGE_RECOVERY_NOT_VERIFIED"],
    [["invalidCredentialRejectionPassed"], "V2_INVALID_CREDENTIAL_REJECTION_NOT_VERIFIED"],
    [["undispatchedRefundLifecyclePassed"], "V2_REFUND_LIFECYCLE_NOT_VERIFIED"],
  ];
  return requirements
    .filter(([names]) => names.some((name) => assertions?.[name] !== true))
    .map(([, blocker]) => blocker);
}
