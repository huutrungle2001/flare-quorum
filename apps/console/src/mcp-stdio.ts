#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LivePublicOperatorSource } from "./live.js";
import { createOperatorMcpServer } from "./mcp/server.js";
import { PublicOperatorService } from "./service.js";

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
  if (!rpcUrl) throw new Error("missing-sepolia-rpc-url");
  const source = new LivePublicOperatorSource(rpcUrl);
  const server = createOperatorMcpServer(new PublicOperatorService(source));
  await server.connect(new StdioServerTransport());
}

main().catch(() => {
  process.stderr.write("VeilBid MCP failed to start.\n");
  process.exitCode = 1;
});
