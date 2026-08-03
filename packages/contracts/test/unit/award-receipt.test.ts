import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, getContract } from "viem";

describe("VeilBidAwardReceipt", async () => {
  const { viem } = await network.create();
  const [caller, buyer, winner, other] = await viem.getWalletClients();

  async function fixture() {
    const harness = await viem.deployContract("AwardReceiptHarness");
    const receiptAddress = await harness.read.receipt();
    const receipt = getContract({
      address: receiptAddress,
      abi: (
        await import(
          "../../artifacts/contracts/receipt/VeilBidAwardReceipt.sol/VeilBidAwardReceipt.json",
          { with: { type: "json" } }
        )
      ).default.abi,
      client: {
        public: await viem.getPublicClient(),
        wallet: caller,
      },
    });
    return { harness, receipt };
  }

  it("mints one non-callback receipt with immutable award facts", async () => {
    const { harness, receipt } = await fixture();
    const tenderId = 1n;

    await harness.write.mint([
      tenderId,
      buyer.account.address,
      winner.account.address,
      other.account.address,
    ]);

    assert.equal(
      getAddress(await receipt.read.ownerOf([tenderId])),
      getAddress(winner.account.address),
    );
    assert.equal(await receipt.read.balanceOf([winner.account.address]), 1n);
    const award = await receipt.read.getAward([tenderId]);
    assert.equal(award.tenderId, tenderId);
    assert.equal(getAddress(award.buyer), getAddress(buyer.account.address));
    assert.equal(getAddress(award.winner), getAddress(winner.account.address));
    assert.equal(
      getAddress(award.paymentToken),
      getAddress(other.account.address),
    );
    assert.ok(award.finalizedAt > 0n);
    assert.ok(award.finalizedBlock > 0n);

    await assert.rejects(
      harness.write.mint([
        tenderId,
        buyer.account.address,
        winner.account.address,
        other.account.address,
      ]),
    );
  });

  it("rejects minting outside the market and every approval/transfer path", async () => {
    const { harness, receipt } = await fixture();
    const tenderId = 2n;
    await harness.write.mint([
      tenderId,
      buyer.account.address,
      winner.account.address,
      other.account.address,
    ]);

    await assert.rejects(
      receipt.write.mint([
        3n,
        buyer.account.address,
        winner.account.address,
        other.account.address,
      ]),
    );
    await assert.rejects(receipt.write.approve([other.account.address, tenderId]));
    await assert.rejects(
      receipt.write.setApprovalForAll([other.account.address, true]),
    );
    await assert.rejects(
      receipt.write.transferFrom([
        winner.account.address,
        other.account.address,
        tenderId,
      ]),
    );
    await assert.rejects(
      receipt.write.safeTransferFrom([
        winner.account.address,
        other.account.address,
        tenderId,
        "0x",
      ]),
    );
  });
});
