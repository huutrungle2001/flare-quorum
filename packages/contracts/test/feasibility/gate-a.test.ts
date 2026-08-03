import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { nox } from "@iexec-nox/nox-hardhat-plugin";
import type { Handle } from "@iexec-nox/handle";

describe("Gate A: persistent encrypted bid state", () => {
  it(
    "reuses an imported bid in a later block and preserves contract/vendor ACL",
    { timeout: 180_000 },
    async () => {
      const { viem } = await nox.connect();
      const publicClient = await viem.getPublicClient();
      const [vendorClient] = await viem.getWalletClients();
      const spike = await viem.deployContract("PersistentHandleSpike");

      const privateBid = 37n;
      const publicThreshold = 50n;
      const { handle, handleProof } = await nox.encryptInput(
        privateBid,
        "uint256",
        spike.address,
      );

      const submitHash = await spike.write.submitBid([handle, handleProof]);
      const submitReceipt = await publicClient.waitForTransactionReceipt({
        hash: submitHash,
      });

      const storedHandle =
        (await spike.read.storedBidHandle()) as Handle<"uint256">;
      assert.notEqual(
        storedHandle,
        `0x${"0".repeat(64)}`,
        "stored bid handle must be initialized",
      );
      assert.equal(
        await spike.read.storedBidAllowedFor([spike.address]),
        true,
        "contract must retain persistent compute access",
      );
      assert.equal(
        await spike.read.storedBidViewableBy([vendorClient.account.address]),
        true,
        "vendor must retain viewer access",
      );

      const decrypted = await nox.decrypt(storedHandle);
      assert.equal(decrypted.value, privateBid);

      const comparisonHash = await spike.write.compareStoredBid([
        publicThreshold,
      ]);
      const comparisonReceipt = await publicClient.waitForTransactionReceipt({
        hash: comparisonHash,
      });
      assert.ok(
        comparisonReceipt.blockNumber > submitReceipt.blockNumber,
        "reuse transaction must be mined in a later block",
      );
      assert.equal(
        await spike.read.storedBidAllowedFor([spike.address]),
        true,
        "contract ACL must survive the later transaction",
      );
      assert.equal(
        await spike.read.storedBidViewableBy([vendorClient.account.address]),
        true,
        "vendor viewer ACL must survive the later transaction",
      );

      const comparisonHandle =
        (await spike.read.comparisonResultHandle()) as Handle<"uint256">;
      const comparison = await nox.publicDecrypt(comparisonHandle);
      assert.equal(comparison.value, 1n);
    },
  );
});
