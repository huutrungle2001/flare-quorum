import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  NOX_COMPUTE_ADDRESS,
  handleGatewayUrl,
  nox,
} from "@iexec-nox/nox-hardhat-plugin";
import {
  createViemHandleClient,
  type Handle,
  type HandleClient,
} from "@iexec-nox/handle";
import type { Address } from "viem";

const BUDGET = 100_000_000n;
const WINNING_PRICE = 37_000_000n;
const REMAINDER = BUDGET - WINNING_PRICE;
const MAX_UINT48 = (1n << 48n) - 1n;

const localHandleConfig = {
  smartContractAddress: NOX_COMPUTE_ADDRESS,
  gatewayUrl: handleGatewayUrl(),
  subgraphUrl: "https://example.com/subgraphs/id/none",
} as const;

async function waitUntilResolved(handles: Handle<"uint256">[]) {
  const url = `${handleGatewayUrl()}/v0/public/handles/status`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handles }),
    });
    if (response.ok) {
      const body = (await response.json()) as {
        payload: { statuses: { handle: string; resolved: boolean }[] };
      };
      if (body.payload.statuses.every(({ resolved }) => resolved)) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Confidential balance did not resolve within the test timeout");
}

async function decryptWith(
  client: HandleClient,
  handle: Handle<"uint256">,
) {
  await waitUntilResolved([handle]);
  return client.decrypt(handle);
}

async function deployTokenFixture(initialAmount = BUDGET) {
  const { viem } = await nox.connect();
  const [buyer, winner] = await viem.getWalletClients();
  const winnerHandleClient = await createViemHandleClient(
    winner,
    localHandleConfig,
  );
  const underlying = await viem.deployContract("TestUSDC");
  const wrapper = await viem.deployContract("TestConfidentialUSDC", [
    underlying.address,
  ]);

  await underlying.write.mint([buyer.account.address, initialAmount]);
  await underlying.write.approve([wrapper.address, initialAmount]);
  await wrapper.write.wrap([buyer.account.address, initialAmount]);

  const initialBalance =
    (await wrapper.read.confidentialBalanceOf([
      buyer.account.address,
    ])) as Handle<"uint256">;
  assert.equal((await nox.decrypt(initialBalance)).value, initialAmount);

  return {
    viem,
    buyer,
    winner,
    winnerHandleClient,
    wrapper,
  };
}

async function confirmExactFunding(
  settlement: Awaited<
    ReturnType<Awaited<ReturnType<typeof nox.connect>>["viem"]["deployContract"]>
  >,
) {
  const fundingCheck =
    (await settlement.read.fundingCheckHandle()) as Handle<"bool">;
  const publicResult = await nox.publicDecrypt(fundingCheck);
  assert.equal(publicResult.value, true);
  await settlement.write.confirmFunding([publicResult.decryptionProof]);
  assert.equal(await settlement.read.funded(), true);
}

async function assertBalances({
  wrapper,
  buyerAddress,
  winnerAddress,
  winnerHandleClient,
  expectedBuyer,
  expectedWinner,
}: {
  wrapper: Awaited<ReturnType<Awaited<ReturnType<typeof nox.connect>>["viem"]["deployContract"]>>;
  buyerAddress: Address;
  winnerAddress: Address;
  winnerHandleClient: HandleClient;
  expectedBuyer: bigint;
  expectedWinner: bigint;
}) {
  const buyerBalance =
    (await wrapper.read.confidentialBalanceOf([
      buyerAddress,
    ])) as Handle<"uint256">;
  const winnerBalance =
    (await wrapper.read.confidentialBalanceOf([
      winnerAddress,
    ])) as Handle<"uint256">;

  assert.equal((await nox.decrypt(buyerBalance)).value, expectedBuyer);
  assert.equal(
    (await decryptWith(winnerHandleClient, winnerBalance)).value,
    expectedWinner,
  );

  return { buyerBalance, winnerBalance };
}

describe("Gate D: confidential escrow settlement", () => {
  it(
    "settles exact winner/remainder amounts with single-contract custody and rejects replay",
    { timeout: 300_000 },
    async () => {
      const fixture = await deployTokenFixture();
      const { buyer, winner, wrapper } = fixture;
      const market = await fixture.viem.deployContract(
        "SingleEscrowSettlementSpike",
        [wrapper.address, buyer.account.address, BUDGET],
      );

      await wrapper.write.setOperator([market.address, MAX_UINT48]);
      await market.write.fund();
      await confirmExactFunding(market);

      const encryptedPrice = await nox.encryptInput(
        WINNING_PRICE,
        "uint256",
        market.address,
      );
      await market.write.setWinningPrice([
        encryptedPrice.handle,
        encryptedPrice.handleProof,
      ]);
      await market.write.settleWinner([winner.account.address]);

      const beforeReplay = await assertBalances({
        ...fixture,
        buyerAddress: buyer.account.address,
        winnerAddress: winner.account.address,
        expectedBuyer: REMAINDER,
        expectedWinner: WINNING_PRICE,
      });
      await assert.rejects(
        market.write.settleWinner([winner.account.address]),
      );
      const afterReplay = await assertBalances({
        ...fixture,
        buyerAddress: buyer.account.address,
        winnerAddress: winner.account.address,
        expectedBuyer: REMAINDER,
        expectedWinner: WINNING_PRICE,
      });
      assert.deepEqual(afterReplay, beforeReplay);
    },
  );

  it(
    "returns the full single-contract escrow when there is no winner",
    { timeout: 300_000 },
    async () => {
      const fixture = await deployTokenFixture();
      const { buyer, wrapper } = fixture;
      const market = await fixture.viem.deployContract(
        "SingleEscrowSettlementSpike",
        [wrapper.address, buyer.account.address, BUDGET],
      );

      await wrapper.write.setOperator([market.address, MAX_UINT48]);
      await market.write.fund();
      await confirmExactFunding(market);
      await market.write.refundNoWinner();

      const buyerBalance =
        (await wrapper.read.confidentialBalanceOf([
          buyer.account.address,
        ])) as Handle<"uint256">;
      assert.equal((await nox.decrypt(buyerBalance)).value, BUDGET);
      await assert.rejects(market.write.refundNoWinner());
    },
  );

  it(
    "requires transient cross-contract ACL and settles exact split-custody amounts",
    { timeout: 300_000 },
    async () => {
      const fixture = await deployTokenFixture();
      const { buyer, winner, wrapper } = fixture;
      const escrow = await fixture.viem.deployContract("SplitEscrowSpike", [
        wrapper.address,
        buyer.account.address,
        BUDGET,
      ]);
      const market = await fixture.viem.deployContract(
        "SplitMarketSettlementSpike",
        [buyer.account.address, escrow.address],
      );

      await escrow.write.configureMarket([market.address]);
      await wrapper.write.setOperator([escrow.address, MAX_UINT48]);
      await escrow.write.fund();
      await confirmExactFunding(escrow);

      const encryptedPrice = await nox.encryptInput(
        WINNING_PRICE,
        "uint256",
        market.address,
      );
      await market.write.setWinningPrice([
        encryptedPrice.handle,
        encryptedPrice.handleProof,
      ]);

      await assert.rejects(
        market.write.settleWithoutTransientAccessForTest([
          winner.account.address,
        ]),
      );
      await market.write.settleWinner([winner.account.address]);

      await assertBalances({
        ...fixture,
        buyerAddress: buyer.account.address,
        winnerAddress: winner.account.address,
        expectedBuyer: REMAINDER,
        expectedWinner: WINNING_PRICE,
      });
      await assert.rejects(
        market.write.settleWinner([winner.account.address]),
      );
    },
  );

  it(
    "returns the full split-custody escrow when there is no winner",
    { timeout: 300_000 },
    async () => {
      const fixture = await deployTokenFixture();
      const { buyer, wrapper } = fixture;
      const escrow = await fixture.viem.deployContract("SplitEscrowSpike", [
        wrapper.address,
        buyer.account.address,
        BUDGET,
      ]);
      const market = await fixture.viem.deployContract(
        "SplitMarketSettlementSpike",
        [buyer.account.address, escrow.address],
      );

      await escrow.write.configureMarket([market.address]);
      await wrapper.write.setOperator([escrow.address, MAX_UINT48]);
      await escrow.write.fund();
      await confirmExactFunding(escrow);
      await market.write.refundNoWinner();

      const buyerBalance =
        (await wrapper.read.confidentialBalanceOf([
          buyer.account.address,
        ])) as Handle<"uint256">;
      assert.equal((await nox.decrypt(buyerBalance)).value, BUDGET);
      await assert.rejects(market.write.refundNoWinner());
    },
  );

  it(
    "does not expose an underfunded transfer attempt as a funded escrow",
    { timeout: 300_000 },
    async () => {
      const fixture = await deployTokenFixture(BUDGET - 1n);
      const { buyer, winner, wrapper } = fixture;
      const market = await fixture.viem.deployContract(
        "SingleEscrowSettlementSpike",
        [wrapper.address, buyer.account.address, BUDGET],
      );

      await wrapper.write.setOperator([market.address, MAX_UINT48]);
      await market.write.fund();

      const fundingCheck =
        (await market.read.fundingCheckHandle()) as Handle<"bool">;
      const publicResult = await nox.publicDecrypt(fundingCheck);
      assert.equal(publicResult.value, false);
      await assert.rejects(
        market.write.confirmFunding([publicResult.decryptionProof]),
      );
      assert.equal(await market.read.funded(), false);
      await assert.rejects(
        market.write.settleWinner([winner.account.address]),
      );
      await assert.rejects(market.write.refundNoWinner());
    },
  );
});
