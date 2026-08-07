import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateGovernancePreflight,
  evaluateGovernanceVerification,
  governanceConfiguration,
} from "../flare/fcc-governance.mjs";

const owner = "0xE412d04DA2A211F7ADC80311CC0FF9F03440B64E";
const zeroHash = `0x${"00".repeat(32)}`;

test("matches the official tee-node governance hash encoding", () => {
  const governance = governanceConfiguration({ fallbackSigner: owner });
  assert.equal(governance.threshold, 1n);
  assert.deepEqual(governance.signers, [owner]);
  assert.equal(governance.hash, "0xa3ff9bd94c8e0f9512e1e3ecc81caa16c94946e366974182da86dba03a5f9832");
});

test("rejects duplicate signers and invalid thresholds", () => {
  assert.throws(() => governanceConfiguration({
    rawSigners: `${owner},${owner.toLowerCase()}`,
    fallbackSigner: owner,
    rawThreshold: "1",
  }), /FCC_GOVERNANCE_DUPLICATE_SIGNER/);
  assert.throws(() => governanceConfiguration({
    rawSigners: owner,
    fallbackSigner: owner,
    rawThreshold: "2",
  }), /FCC_GOVERNANCE_THRESHOLD_INVALID/);
});

test("initializes only an unset or exactly matching governance policy", () => {
  const desired = governanceConfiguration({ fallbackSigner: owner });
  const base = {
    account: owner,
    extensionOwner: owner,
    desired,
    onchainHash: zeroHash,
    onchainSigners: [],
    onchainThreshold: 0n,
    onchainSafe: "0x0000000000000000000000000000000000000000",
    machineHashes: [desired.hash, desired.hash, desired.hash],
  };
  assert.equal(evaluateGovernancePreflight(base).status, "READY");
  assert.equal(evaluateGovernancePreflight({
    ...base,
    onchainHash: desired.hash,
    onchainSigners: desired.signers,
    onchainThreshold: desired.threshold,
  }).status, "ALREADY_SET");
  assert.equal(evaluateGovernancePreflight({
    ...base,
    onchainHash: `0x${"11".repeat(32)}`,
  }).status, "BLOCKED");
  assert.equal(evaluateGovernancePreflight({
    ...base,
    machineHashes: [desired.hash, desired.hash, `0x${"22".repeat(32)}`],
  }).status, "BLOCKED");
});

test("requires the complete on-chain governance binding after execution", () => {
  const desired = governanceConfiguration({ fallbackSigner: owner });
  const result = evaluateGovernanceVerification({
    desired,
    onchainHash: desired.hash,
    onchainSigners: desired.signers,
    onchainThreshold: desired.threshold,
    onchainSafe: "0x0000000000000000000000000000000000000000",
    hashIsValid: true,
    signerChecks: [true],
  });
  assert.equal(result.status, "PASSED");
  assert.ok(Object.values(result.assertions).every(Boolean));
});
