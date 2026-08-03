import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  NOX_COMPUTE_ADDRESS,
  handleGatewayUrl,
  nox,
} from "@iexec-nox/nox-hardhat-plugin";
import { createViemHandleClient } from "@iexec-nox/handle";
import type { Handle } from "@iexec-nox/handle";
import type { Address, Hex } from "viem";

const localHandleConfig = {
  smartContractAddress: NOX_COMPUTE_ADDRESS,
  gatewayUrl: handleGatewayUrl(),
  subgraphUrl: "https://example.com/subgraphs/id/none",
} as const;

function tamper(proof: Hex): Hex {
  const finalByte = proof.slice(-2);
  return `${proof.slice(0, -2)}${finalByte === "00" ? "01" : "00"}` as Hex;
}

describe("Gate C: public winner proof and recovery", () => {
  it(
    "resumes after close, derives the stored winner, and rejects replay",
    { timeout: 240_000 },
    async () => {
      const { viem } = await nox.connect();
      const publicClient = await viem.getPublicClient();
      const [vendorOne, vendorTwo] = await viem.getWalletClients();
      const vendorTwoHandleClient = await createViemHandleClient(
        vendorTwo,
        localHandleConfig,
      );
      const spike = await viem.deployContract("WinnerProofSpike", [1n, 100n]);
      const vendorTwoSpike = await viem.getContractAt(
        "WinnerProofSpike",
        spike.address,
        { client: { public: publicClient, wallet: vendorTwo } },
      );

      const first = await nox.encryptInput(70n, "uint256", spike.address);
      await spike.write.submitBid([first.handle, first.handleProof]);

      const second = await vendorTwoHandleClient.encryptInput(
        40n,
        "uint256",
        spike.address,
      );
      await vendorTwoSpike.write.submitBid([
        second.handle,
        second.handleProof,
      ]);

      await spike.write.close();
      assert.equal(await spike.read.winnerIdIsPubliclyDecryptable(), true);
      assert.equal(await spike.read.bestPriceIsPubliclyDecryptable(), false);

      const recovered = await viem.getContractAt(
        "WinnerProofSpike",
        spike.address,
      );
      const winnerIdHandle =
        (await recovered.read.encryptedWinnerBidIdHandle()) as Handle<"uint256">;
      const publicResult = await nox.publicDecrypt(winnerIdHandle);
      assert.equal(publicResult.value, 2n);

      await recovered.write.finalize([publicResult.decryptionProof]);
      assert.equal(await recovered.read.winnerBidId(), 2n);
      assert.equal(
        ((await recovered.read.winner()) as Address).toLowerCase(),
        vendorTwo.account.address.toLowerCase(),
      );
      assert.equal(await recovered.read.status(), 2);

      await assert.rejects(
        recovered.write.finalize([publicResult.decryptionProof]),
      );
    },
  );

  it(
    "rejects a tampered proof and a proof bound to another tender handle",
    { timeout: 240_000 },
    async () => {
      const { viem } = await nox.connect();
      const firstTender = await viem.deployContract("WinnerProofSpike", [
        11n,
        100n,
      ]);
      const secondTender = await viem.deployContract("WinnerProofSpike", [
        12n,
        100n,
      ]);

      for (const tender of [firstTender, secondTender]) {
        const encrypted = await nox.encryptInput(
          50n,
          "uint256",
          tender.address,
        );
        await tender.write.submitBid([
          encrypted.handle,
          encrypted.handleProof,
        ]);
        await tender.write.close();
      }

      const firstResult = await nox.publicDecrypt(
        (await firstTender.read.encryptedWinnerBidIdHandle()) as Handle<"uint256">,
      );

      await assert.rejects(
        firstTender.write.finalize([tamper(firstResult.decryptionProof)]),
      );
      await assert.rejects(
        secondTender.write.finalize([firstResult.decryptionProof]),
      );

      await firstTender.write.finalize([firstResult.decryptionProof]);
      assert.equal(await firstTender.read.status(), 2);
      assert.equal(await secondTender.read.status(), 1);
    },
  );
});
