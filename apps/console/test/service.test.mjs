import assert from "node:assert/strict";
import test from "node:test";
import { PublicOperatorService } from "../dist/index.js";

const buyer = "0x1111111111111111111111111111111111111111";
const vendor = "0x2222222222222222222222222222222222222222";
const hash = `0x${"33".repeat(32)}`;

const publicTender = {
  tenderId: 1n,
  buyer,
  reviewViewer: buyer,
  paymentToken: buyer,
  metadataHash: hash,
  publicCeiling: 1_000_000n,
  bidDeadline: 100n,
  closeBlock: 12n,
  approvedVendorCount: 1,
  bidCount: 1,
  status: "Awarded",
  winnerBidId: 1n,
  winner: vendor,
  viewerGrantCount: 1,
  createdBlock: 1n,
  updatedBlock: 13n,
  createdTransaction: hash,
  updatedTransaction: hash,
};

function source() {
  return {
    async snapshot() {
      return {
        index: {
          tenders: [publicTender],
          bids: [
            {
              tenderId: 1n,
              bidId: 1n,
              vendor,
              submittedBlock: 9n,
              submittedTransaction: hash,
            },
          ],
          checkpoint: { blockNumber: 13n, eventCount: 4 },
        },
        chainTimestamp: 200n,
        latestBlock: 30n,
        finalizedBlock: 18n,
        deploymentKind: "test-e2e",
        deploymentVerified: false,
      };
    },
    async settlementFlags() {
      return {
        winnerIdPubliclyDecryptable: true,
        canFinalize: false,
        refundRequiresZeroWinnerProof: true,
      };
    },
    async awardEvidence() {
      return {
        tenderId: 1n,
        buyer,
        winner: vendor,
        paymentToken: buyer,
        finalizedAt: 201n,
        finalizedBlock: 13n,
      };
    },
    async bidViewableBy() {
      return true;
    },
  };
}

test("service returns public tender and bid coordination fields only", async () => {
  const service = new PublicOperatorService(source());
  const result = await service.getTender("1");
  assert.equal(result.tender.status, "Awarded");
  assert.equal(result.bids[0].vendor, vendor);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("Handle"), false);
  assert.equal(serialized.includes("proof"), false);
});

test("service explains readiness from chain time", async () => {
  const service = new PublicOperatorService(source());
  assert.deepEqual(await service.explainReadiness("1"), {
    tenderId: "1",
    status: "Awarded",
    chainTimestamp: "200",
    needsFundingProof: false,
    allVendorsSubmitted: true,
    canClose: false,
    needsWinnerProof: false,
    canBuyerCancel: false,
    terminal: true,
  });
});

test("service returns receipt and ACL evidence without decryption", async () => {
  const service = new PublicOperatorService(source());
  const settlement = await service.inspectSettlement("1");
  assert.equal(settlement.award.winner, vendor);
  assert.equal(settlement.refundRequiresZeroWinnerProof, true);
  assert.equal("canRefund" in settlement, false);
  const acl = await service.inspectBidViewer({
    tenderId: "1",
    bidId: "1",
    account: vendor,
  });
  assert.equal(acl.viewable, true);
  assert.equal(acl.scope, "single-stored-bid");
});

test("service rejects malformed identifiers before reading chain state", async () => {
  const service = new PublicOperatorService(source());
  await assert.rejects(() => service.getTender("0"), {
    code: "invalid-tender-id",
  });
});
