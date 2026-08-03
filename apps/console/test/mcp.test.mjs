import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createOperatorMcpServer,
  PublicOperatorService,
} from "../dist/index.js";

const buyer = "0x1111111111111111111111111111111111111111";
const hash = `0x${"44".repeat(32)}`;

function service() {
  return new PublicOperatorService({
    async snapshot() {
      return {
        index: {
          tenders: [
            {
              tenderId: 1n,
              buyer,
              reviewViewer: buyer,
              paymentToken: buyer,
              metadataHash: hash,
              publicCeiling: 1n,
              bidDeadline: 100n,
              closeBlock: null,
              approvedVendorCount: 2,
              bidCount: 0,
              status: "Open",
              winnerBidId: null,
              winner: null,
              viewerGrantCount: 0,
              createdBlock: 1n,
              updatedBlock: 1n,
              createdTransaction: hash,
              updatedTransaction: hash,
            },
          ],
          bids: [],
          checkpoint: null,
        },
        chainTimestamp: 50n,
        latestBlock: 20n,
        finalizedBlock: 8n,
        deploymentKind: "test-e2e",
        deploymentVerified: false,
      };
    },
    async settlementFlags() {
      return {
        winnerIdPubliclyDecryptable: false,
        canFinalize: false,
        refundRequiresZeroWinnerProof: true,
      };
    },
    async awardEvidence() {
      return null;
    },
    async bidViewableBy() {
      return false;
    },
  });
}

test("MCP exposes exactly five read-only public tools", async (context) => {
  const server = createOperatorMcpServer(service());
  const client = new Client({ name: "veilbid-test", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  context.after(async () => {
    await client.close();
    await server.close();
  });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    [
      "explain_tender_readiness",
      "get_tender",
      "inspect_bid_viewer",
      "inspect_settlement_evidence",
      "list_tenders",
    ],
  );
  assert.equal(
    listed.tools.some((tool) =>
      /write|decrypt|sign/i.test(tool.name),
    ),
    false,
  );
  const called = await client.callTool({
    name: "get_tender",
    arguments: { tenderId: "1" },
  });
  const text = called.content[0].text;
  assert.equal(text.includes('"status":"Open"'), true);
  assert.equal(/handle|proof|private/i.test(text), false);
});

test("MCP schema rejects a non-positive tender identifier", async (context) => {
  const server = createOperatorMcpServer(service());
  const client = new Client({ name: "veilbid-test", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  context.after(async () => {
    await client.close();
    await server.close();
  });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const called = await client.callTool({
    name: "get_tender",
    arguments: { tenderId: "0" },
  });
  assert.equal(called.isError, true);
});
