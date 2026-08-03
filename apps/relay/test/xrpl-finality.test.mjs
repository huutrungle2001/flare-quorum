import assert from "node:assert/strict";
import test from "node:test";
import { inspectXrplFinality, waitForXrplFinality } from "../dist/xrpl-finality.js";

const transactionId = `0x${"11".repeat(32)}`;

function responder(ledgerIndexes) {
  let ledgerCall = 0;
  return async (_url, init) => {
    const request = JSON.parse(init.body);
    if (request.method === "tx") {
      assert.equal(request.params[0].transaction, "11".repeat(32).toUpperCase());
      return Response.json({ result: { validated: true, ledger_index: 100 } });
    }
    const ledgerIndex = ledgerIndexes[Math.min(ledgerCall, ledgerIndexes.length - 1)];
    ledgerCall += 1;
    return Response.json({ result: { ledger_index: ledgerIndex } });
  };
}

test("counts XRPL confirmations from validated ledgers", async () => {
  const finality = await inspectXrplFinality(
    "https://xrpl.example.invalid",
    transactionId,
    { fetchImplementation: responder([102]) },
  );
  assert.equal(finality.confirmations, 3);
});

test("polls until three confirmations and fails closed on unvalidated transactions", async () => {
  const finality = await waitForXrplFinality({
    rpcUrl: "https://xrpl.example.invalid",
    transactionId,
    minimumConfirmations: 3,
    attempts: 3,
    pollIntervalMs: 1,
    fetchImplementation: responder([100, 101, 102]),
    sleep: async () => {},
  });
  assert.equal(finality.validatedLedgerIndex, 102);
  await assert.rejects(
    inspectXrplFinality("https://xrpl.example.invalid", transactionId, {
      fetchImplementation: async () => Response.json({
        result: { validated: false, ledger_index: 100 },
      }),
    }),
    /XRPL_TRANSACTION_NOT_VALIDATED/,
  );
});
