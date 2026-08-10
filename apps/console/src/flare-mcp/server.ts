import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  flareTenderStatuses,
  FlareOperatorQueryError,
  type FlarePublicOperatorService,
} from "../flare-service.js";

const positiveId = z.string().regex(/^[1-9][0-9]*$/);

function result(output: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}

function failure(error: unknown) {
  return {
    isError: true,
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: error instanceof FlareOperatorQueryError
          ? error.code
          : "coston2-public-query-failed",
      }),
    }],
  };
}

export function createFlareOperatorMcpServer(service: FlarePublicOperatorService) {
  const server = new McpServer({
    name: "flare-quorum-operator-console",
    version: "0.0.0",
  });

  server.registerTool(
    "list_flare_tenders",
    {
      title: "List Coston2 FlareQuorum tenders",
      description: "List finalized public Coston2 tender facts without bid payloads or signatures.",
      inputSchema: {
        status: z.enum(flareTenderStatuses).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (input) => {
      try {
        return result(await service.listTenders(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_flare_tender",
    {
      title: "Get one Coston2 FlareQuorum tender",
      description: "Inspect one finalized public tender and its frozen FCC/FTSO bindings.",
      inputSchema: { tenderId: positiveId },
    },
    async ({ tenderId }) => {
      try {
        return result(await service.getTender(tenderId));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "inspect_flare_selection",
    {
      title: "Inspect a Coston2 FCC selection",
      description: "Inspect public root, quorum, FTSO snapshot, request, retry, and award facts without raw FCC responses.",
      inputSchema: { tenderId: positiveId },
    },
    async ({ tenderId }) => {
      try {
        return result(await service.inspectSelection(tenderId));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "inspect_flare_protocol_binding",
    {
      title: "Inspect Coston2 protocol bindings",
      description: "Inspect finalized market bytecode hash, immutable Flare dependencies, and threshold constants.",
      inputSchema: {},
    },
    async () => {
      try {
        return result(await service.inspectProtocolBinding());
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
