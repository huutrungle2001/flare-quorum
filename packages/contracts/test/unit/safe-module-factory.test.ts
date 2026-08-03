import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, getContract, zeroAddress } from "viem";

describe("VeilBidSafeModuleFactory", async () => {
  const { viem } = await network.create();
  const [deployer, other] = await viem.getWalletClients();

  async function fixture() {
    const safeHarness = await viem.deployContract("AwardReceiptHarness");
    const factory = await viem.deployContract("VeilBidSafeModuleFactory", [
      deployer.account.address,
    ]);
    return { factory, safeHarness };
  }

  it("predicts and deploys one canonical module for a contract Safe", async () => {
    const { factory, safeHarness } = await fixture();
    const predicted = await factory.read.predictModule([safeHarness.address]);
    const publicClient = await viem.getPublicClient();

    await factory.write.deployModule([safeHarness.address]);

    const moduleAddress = await factory.read.moduleOf([safeHarness.address]);
    assert.equal(getAddress(moduleAddress), getAddress(predicted));
    assert.equal(
      await factory.read.isCanonicalModule([
        safeHarness.address,
        moduleAddress,
      ]),
      true,
    );
    assert.notEqual(
      await publicClient.getCode({ address: moduleAddress }),
      undefined,
    );

    const module = getContract({
      address: moduleAddress,
      abi: (
        await import(
          "../../artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json",
          { with: { type: "json" } }
        )
      ).default.abi,
      client: publicClient,
    });
    assert.equal(
      getAddress(await module.read.safe()),
      getAddress(safeHarness.address),
    );
    assert.equal(await module.read.market(), zeroAddress);
  });

  it("is idempotent and rejects zero, EOA, and zero-market targets", async () => {
    const { factory, safeHarness } = await fixture();
    await factory.write.deployModule([safeHarness.address]);
    const first = await factory.read.moduleOf([safeHarness.address]);

    await factory.write.deployModule([safeHarness.address]);
    assert.equal(await factory.read.moduleOf([safeHarness.address]), first);

    await assert.rejects(factory.write.deployModule([zeroAddress]));
    await assert.rejects(
      factory.write.deployModule([other.account.address]),
    );
    await assert.rejects(
      viem.deployContract("VeilBidSafeModuleFactory", [zeroAddress]),
    );
  });
});
