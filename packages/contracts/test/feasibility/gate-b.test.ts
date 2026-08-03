import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { nox } from "@iexec-nox/nox-hardhat-plugin";
import type { Handle } from "@iexec-nox/handle";

type ArgminCase = {
  ceiling: bigint;
  expectedBest: bigint;
  expectedWinnerBidId: bigint;
  prices: bigint[];
};

const cases: ArgminCase[] = [
  {
    ceiling: 100n,
    prices: [60n, 35n, 75n],
    expectedBest: 35n,
    expectedWinnerBidId: 2n,
  },
  {
    ceiling: 100n,
    prices: [0n, 101n, 40n],
    expectedBest: 40n,
    expectedWinnerBidId: 3n,
  },
  {
    ceiling: 100n,
    prices: [42n, 42n, 60n],
    expectedBest: 42n,
    expectedWinnerBidId: 1n,
  },
  {
    ceiling: 100n,
    prices: [0n, 101n],
    expectedBest: 101n,
    expectedWinnerBidId: 0n,
  },
  {
    ceiling: 100n,
    prices: [80n, 20n, 55n, 30n],
    expectedBest: 20n,
    expectedWinnerBidId: 2n,
  },
  {
    ceiling: 100n,
    prices: [30n, 55n, 20n, 80n],
    expectedBest: 20n,
    expectedWinnerBidId: 3n,
  },
];

describe("Gate B: encrypted argmin and winner ID", () => {
  for (const [index, testCase] of cases.entries()) {
    it(
      `selects the expected encrypted minimum for representative case ${index + 1}`,
      { timeout: 180_000 },
      async () => {
        const { viem } = await nox.connect();
        const [viewerClient] = await viem.getWalletClients();
        const spike = await viem.deployContract("EncryptedArgminSpike", [
          testCase.ceiling,
        ]);

        for (const price of testCase.prices) {
          const encrypted = await nox.encryptInput(
            price,
            "uint256",
            spike.address,
          );
          await spike.write.submitBid([
            encrypted.handle,
            encrypted.handleProof,
          ]);
        }

        await spike.write.sealAndAuthorizeResultViewer([
          viewerClient.account.address,
        ]);

        const best = await nox.decrypt(
          (await spike.read.encryptedBestPriceHandle()) as Handle<"uint256">,
        );
        const winner = await nox.decrypt(
          (await spike.read.encryptedWinnerBidIdHandle()) as Handle<"uint256">,
        );

        assert.equal(best.value, testCase.expectedBest);
        assert.equal(winner.value, testCase.expectedWinnerBidId);
      },
    );
  }
});
