import assert from "node:assert/strict";
import test from "node:test";
import {
  iAssetManagerAbi,
  iDirectMintingAbi,
  iDirectMintingSettingsAbi,
  iFdcHubAbi,
  iFdcRequestFeeConfigurationsAbi,
  iFdcVerificationAbi,
  iFlareContractRegistryAbi,
  iFlareSystemsManagerAbi,
  iMemoInstructionsFacetAbi,
  iRelayAbi,
} from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import {
  assetManagerFAssetsAbi,
  fdcHubAbi,
  fdcRequestFeeConfigurationsAbi,
  fdcVerificationProtocolAbi,
  flareContractRegistryAbi,
  flareSystemsManagerAbi,
  memoInstructionsEventsAbi,
  relayFinalizationAbi,
} from "../dist/fassets.js";

type AbiLike = readonly Record<string, unknown>[];

function item(abi: AbiLike, type: string, name: string): Record<string, unknown> {
  const found = abi.find((entry) => entry.type === type && entry.name === name);
  assert.ok(found, `missing ${type} ${name}`);
  return found;
}

function withoutInternalTypes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutInternalTypes);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "internalType")
        .map(([key, nested]) => [key, withoutInternalTypes(nested)]),
    );
  }
  return value;
}

function assertParity(
  localAbi: AbiLike,
  officialAbi: AbiLike,
  type: "function" | "event",
  name: string,
): void {
  assert.deepEqual(
    withoutInternalTypes(item(localAbi, type, name)),
    withoutInternalTypes(item(officialAbi, type, name)),
  );
}

test("minimal FDC/FAssets ABIs match pinned Flare periphery 3.6.0", () => {
  assertParity(flareContractRegistryAbi, iFlareContractRegistryAbi, "function", "getContractAddressByName");
  assertParity(fdcHubAbi, iFdcHubAbi, "function", "fdcRequestFeeConfigurations");
  assertParity(fdcHubAbi, iFdcHubAbi, "function", "requestAttestation");
  assertParity(fdcRequestFeeConfigurationsAbi, iFdcRequestFeeConfigurationsAbi, "function", "getRequestFee");
  assertParity(flareSystemsManagerAbi, iFlareSystemsManagerAbi, "function", "firstVotingRoundStartTs");
  assertParity(flareSystemsManagerAbi, iFlareSystemsManagerAbi, "function", "votingEpochDurationSeconds");
  assertParity(fdcVerificationProtocolAbi, iFdcVerificationAbi, "function", "fdcProtocolId");
  assertParity(relayFinalizationAbi, iRelayAbi, "function", "isFinalized");
  assertParity(assetManagerFAssetsAbi, iAssetManagerAbi, "function", "fAsset");
  assertParity(assetManagerFAssetsAbi, iDirectMintingAbi, "function", "directMintingPaymentAddress");
  assertParity(assetManagerFAssetsAbi, iDirectMintingSettingsAbi, "function", "getDirectMintingFeeBIPS");
  assertParity(assetManagerFAssetsAbi, iDirectMintingSettingsAbi, "function", "getDirectMintingMinimumFeeUBA");
  assertParity(assetManagerFAssetsAbi, iDirectMintingAbi, "function", "executeDirectMintingWithData");
  assertParity(assetManagerFAssetsAbi, iDirectMintingAbi, "event", "DirectMintingDelayed");
  assertParity(assetManagerFAssetsAbi, iDirectMintingAbi, "event", "DirectMintingExecutedToSmartAccount");
  assertParity(memoInstructionsEventsAbi, iMemoInstructionsFacetAbi, "event", "UserOperationExecuted");
});
