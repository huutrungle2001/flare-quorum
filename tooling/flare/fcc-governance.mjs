import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  zeroAddress,
  zeroHash,
} from "viem";

function sameAddress(left, right) {
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}

function sameAddresses(left, right) {
  return left.length === right.length && left.every((address, index) =>
    sameAddress(address, right[index])
  );
}

export function governanceConfiguration({ rawSigners, fallbackSigner, rawThreshold }) {
  const signers = String(rawSigners ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(getAddress);
  if (signers.length === 0) signers.push(getAddress(fallbackSigner));
  if (new Set(signers.map((address) => address.toLowerCase())).size !== signers.length) {
    throw new Error("FCC_GOVERNANCE_DUPLICATE_SIGNER");
  }

  const thresholdText = String(rawThreshold ?? "").trim() || "1";
  if (!/^\d+$/.test(thresholdText)) throw new Error("FCC_GOVERNANCE_THRESHOLD_INVALID");
  const threshold = BigInt(thresholdText);
  if (threshold === 0n || threshold > BigInt(signers.length) || threshold > 0xffff_ffff_ffff_ffffn) {
    throw new Error("FCC_GOVERNANCE_THRESHOLD_INVALID");
  }

  const hash = keccak256(encodeAbiParameters(
    [{ type: "address[]" }, { type: "uint256" }],
    [signers, threshold],
  ));
  return { signers, threshold, hash };
}

export function evaluateGovernancePreflight({
  account,
  extensionOwner,
  desired,
  onchainHash,
  onchainSigners,
  onchainThreshold,
  onchainSafe,
  machineHashes,
}) {
  const onchainIsDesired = onchainHash.toLowerCase() === desired.hash.toLowerCase();
  const onchainIsUnset = onchainHash.toLowerCase() === zeroHash;
  const assertions = {
    extensionOwnerMatchesSigner: sameAddress(account, extensionOwner),
    threeMachineGovernanceHashesPresent: machineHashes.length === 3,
    machineGovernanceHashesMatchDesired:
      machineHashes.length === 3 && machineHashes.every((hash) =>
        hash.toLowerCase() === desired.hash.toLowerCase()
      ),
    onchainGovernanceCanBeInitialized: onchainIsUnset || onchainIsDesired,
    existingGovernanceDetailsMatch:
      !onchainIsDesired || (
        sameAddresses(onchainSigners, desired.signers) &&
        onchainThreshold === desired.threshold &&
        sameAddress(onchainSafe, zeroAddress)
      ),
  };
  return {
    status: Object.values(assertions).every(Boolean)
      ? onchainIsDesired ? "ALREADY_SET" : "READY"
      : "BLOCKED",
    assertions,
  };
}

export function evaluateGovernanceVerification({
  desired,
  onchainHash,
  onchainSigners,
  onchainThreshold,
  onchainSafe,
  hashIsValid,
  signerChecks,
}) {
  const assertions = {
    latestHashMatches: onchainHash.toLowerCase() === desired.hash.toLowerCase(),
    signerOrderMatches: sameAddresses(onchainSigners, desired.signers),
    thresholdMatches: onchainThreshold === desired.threshold,
    plainGovernanceHasNoSafe: sameAddress(onchainSafe, zeroAddress),
    governanceHashIsValid: hashIsValid === true,
    allGovernanceSignersRecognized:
      signerChecks.length === desired.signers.length && signerChecks.every(Boolean),
  };
  return {
    status: Object.values(assertions).every(Boolean) ? "PASSED" : "FAILED",
    assertions,
  };
}
