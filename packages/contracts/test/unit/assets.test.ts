import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress } from "viem";

describe("VeilBid demo assets", async () => {
  const { viem } = await network.create();
  const [account] = await viem.getWalletClients();

  it("mints a fixed six-decimal faucet amount", async () => {
    const token = await viem.deployContract("VeilBidTestUSDC");

    await token.write.faucet();

    assert.equal(await token.read.decimals(), 6);
    assert.equal(
      await token.read.balanceOf([account.account.address]),
      await token.read.FAUCET_AMOUNT(),
    );
  });

  it("configures the official ERC-7984 wrapper for the faucet asset", async () => {
    const token = await viem.deployContract("VeilBidTestUSDC");
    const wrapper = await viem.deployContract("VeilBidConfidentialUSDC", [
      token.address,
    ]);

    assert.equal(
      getAddress(await wrapper.read.underlying()),
      getAddress(token.address),
    );
    assert.equal(await wrapper.read.decimals(), 6);
    assert.equal(await wrapper.read.name(), "VeilBid Confidential USDC");
    assert.equal(await wrapper.read.symbol(), "vcUSDC");
  });
});
