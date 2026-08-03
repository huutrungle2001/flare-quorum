import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, zeroAddress } from "viem";

describe("VeilBidSafeUnwrapPreparation", async () => {
  const { viem } = await network.create();
  const [deployer, other] = await viem.getWalletClients();

  it("binds one deployed confidential wrapper", async () => {
    const wrapper = await viem.deployContract(
      "SafeUnwrapPreparationHarness",
    );
    const preparation = await viem.deployContract(
      "VeilBidSafeUnwrapPreparation",
      [wrapper.address],
    );

    assert.equal(
      getAddress(await preparation.read.wrapper()),
      getAddress(wrapper.address),
    );
  });

  it("rejects zero and EOA wrapper targets", async () => {
    await assert.rejects(
      viem.deployContract("VeilBidSafeUnwrapPreparation", [zeroAddress]),
    );
    await assert.rejects(
      viem.deployContract("VeilBidSafeUnwrapPreparation", [
        other.account.address,
      ]),
    );
  });

  it("rejects direct EOA preparation before accepting an input proof", async () => {
    const wrapper = await viem.deployContract(
      "SafeUnwrapPreparationHarness",
    );
    const preparation = await viem.deployContract(
      "VeilBidSafeUnwrapPreparation",
      [wrapper.address],
    );

    await assert.rejects(
      preparation.write.preparePartialUnwrap([
        `0x${"11".repeat(32)}`,
        "0x",
        deployer.account.address,
        `0x${"22".repeat(32)}`,
        1n,
      ]),
    );
  });
});
