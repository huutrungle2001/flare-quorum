import assert from "node:assert/strict";
import test from "node:test";
import { zeroAddress } from "viem";

import {
  evaluateFoundationRegistration,
  evmKeyType,
} from "../flare/fcc-foundation-registration.mjs";

const deployer = "0xE412d04DA2A211F7ADC80311CC0FF9F03440B64E";
const manager = "0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE";
const sender = "0x1000000000000000000000000000000000000001";

function fixture() {
  return {
    chainId: 114,
    declaredDeployer: deployer,
    deployer,
    manager,
    sender,
    runtimeComparison: { sizeMatches: true, logicMatches: true },
    deploymentReceipt: { status: "success", contractAddress: sender },
    registrationReceipt: { status: "success" },
    extensionId: 65_999n,
    nextPublicExtensionId: 66_000n,
    registeredOwner: deployer,
    registeredSender: sender,
    registeredStateVerifier: zeroAddress,
    senderChainId: 114n,
    senderVersion: 2,
    senderOwner: deployer,
    senderRegistry: manager,
    senderMachineRegistry: manager,
    senderExtensionId: 65_999n,
    machineOwnerAllowed: true,
    walletProjectOwnerAllowed: true,
    evmKeyTypeSupported: true,
  };
}

test("uses the tee-node bytes32 EVM key type", () => {
  assert.equal(evmKeyType, `0x45564d${"00".repeat(29)}`);
});

test("requires the complete registered and explicitly bound foundation state", () => {
  const passed = evaluateFoundationRegistration(fixture());
  assert.equal(passed.status, "PASSED");
  assert.ok(Object.values(passed.assertions).every(Boolean));

  const mismatched = evaluateFoundationRegistration({
    ...fixture(),
    registeredSender: "0x2000000000000000000000000000000000000002",
  });
  assert.equal(mismatched.status, "FAILED");
  assert.equal(mismatched.assertions.registrationSenderMatches, false);
});
