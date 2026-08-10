import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createFlareOperatorMcpServer,
  FlarePublicOperatorService,
} from "../dist/index.js";

const market = "0x1000000000000000000000000000000000000001";
const hash = `0x${"11".repeat(32)}`;

function service() {
  return new FlarePublicOperatorService({
    async snapshot() {
      return {
        chainId: 114,
        tenders: [],
        indexedBlock: 100n,
        finalizedBlock: 100n,
        latestBlock: 112n,
        deploymentStatus: "planned",
      };
    },
    async protocolBinding() {
      return {
        chainId: 114,
        marketAddress: market,
        deploymentStatus: "planned",
        deploymentBlock: 80n,
        finalizedBlock: 100n,
        runtimeCodeHash: hash,
        runtimeCodeSize: 18_536,
        paymentToken: market,
        teeManager: market,
        ftso: market,
        teeExtensionRegistry: market,
        awardReceipt: market,
        tenderCount: 0n,
        teeCount: 3n,
        bidReceiptThreshold: 3,
        resultThreshold: 2,
      };
    },
  });
}

test("Flare MCP exposes exactly four read-only Coston2 tools", async (context) => {
  const server = createFlareOperatorMcpServer(service());
  const client = new Client({ name: "flare-quorum-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  context.after(async () => {
    await client.close();
    await server.close();
  });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
    "get_flare_tender",
    "inspect_flare_protocol_binding",
    "inspect_flare_selection",
    "list_flare_tenders",
  ]);
  assert.equal(listed.tools.some((tool) => /write|decrypt|sign/i.test(tool.name)), false);

  const called = await client.callTool({
    name: "inspect_flare_protocol_binding",
    arguments: {},
  });
  const text = called.content[0].text;
  assert.equal(text.includes('"chainId":114'), true);
  assert.doesNotMatch(text, /signature|ciphertext|private/i);
});

test("Flare MCP rejects a non-positive tender identifier", async (context) => {
  const server = createFlareOperatorMcpServer(service());
  const client = new Client({ name: "flare-quorum-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  context.after(async () => {
    await client.close();
    await server.close();
  });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const called = await client.callTool({
    name: "get_flare_tender",
    arguments: { tenderId: "0" },
  });
  assert.equal(called.isError, true);
});
