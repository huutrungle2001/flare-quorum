import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tenderStatuses } from "@flarequorum/chain-bindings";
import * as z from "zod/v4";
import {
  OperatorQueryError,
  type PublicOperatorService,
} from "../service.js";

const positiveId = z.string().regex(/^[1-9][0-9]*$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

function result(output: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}

function failure(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error:
            error instanceof OperatorQueryError
              ? error.code
              : "public-query-failed",
        }),
      },
    ],
  };
}

export function createOperatorMcpServer(service: PublicOperatorService) {
  const server = new McpServer({
    name: "flare-quorum-operator-console",
    version: "0.0.0",
  });

  server.registerTool(
    "list_tenders",
    {
      title: "List FlareQuorum tenders",
      description:
        "List finalized public FlareQuorum tender coordination data. Returns no encrypted handles or confidential values.",
      inputSchema: {
        status: z.enum(tenderStatuses).optional(),
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
    "get_tender",
    {
      title: "Get a FlareQuorum tender",
      description:
        "Get one finalized public tender and its public bid identities and transaction references.",
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
    "explain_tender_readiness",
    {
      title: "Explain tender readiness",
      description:
        "Explain close, winner-proof, cancellation, and terminal readiness from finalized public state and chain time.",
      inputSchema: { tenderId: positiveId },
    },
    async ({ tenderId }) => {
      try {
        return result(await service.explainReadiness(tenderId));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "inspect_settlement_evidence",
    {
      title: "Inspect public settlement evidence",
      description:
        "Inspect public proof readiness, terminal transaction references, and non-transferable award receipt facts without returning proof bytes.",
      inputSchema: { tenderId: positiveId },
    },
    async ({ tenderId }) => {
      try {
        return result(await service.inspectSettlement(tenderId));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "inspect_bid_viewer",
    {
      title: "Inspect bid viewer access",
      description:
        "Check whether one account can view one stored bid. Does not return or decrypt the encrypted bid handle.",
      inputSchema: {
        tenderId: positiveId,
        bidId: positiveId,
        account: address,
      },
    },
    async (input) => {
      try {
        return result(await service.inspectBidViewer(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
