#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  FlareLivePublicOperatorSource,
  resolveFlareOperatorConfig,
} from "./flare-live.js";
import { createFlareOperatorMcpServer } from "./flare-mcp/server.js";
import { FlarePublicOperatorService } from "./flare-service.js";

async function main() {
  const source = new FlareLivePublicOperatorSource(resolveFlareOperatorConfig());
  const server = createFlareOperatorMcpServer(new FlarePublicOperatorService(source));
  await server.connect(new StdioServerTransport());
}

main().catch(() => {
  process.stderr.write("VeilBid Coston2 MCP failed to start.\n");
  process.exitCode = 1;
});
