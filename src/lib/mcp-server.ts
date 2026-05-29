import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getAudit,
  getFinding,
  listAudits,
  runAudit,
} from "./audit-store";

export function createMcpServer(_ctx: { uid: string }): McpServer {
  const server = new McpServer({
    name: "seokun",
    version: "0.1.0",
  });

  server.registerTool(
    "list_audits",
    {
      description: "List the user's recent audits",
      inputSchema: {
        limit: z.number().int().positive().max(100).optional(),
        cursor: z.string().optional(),
      },
    },
    async (input) => {
      const result = await listAudits(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  server.registerTool(
    "get_audit",
    {
      description: "Get details for one audit by id",
      inputSchema: { auditId: z.string().min(1) },
    },
    async (input) => {
      const result = await getAudit(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  server.registerTool(
    "get_finding",
    {
      description: "Get one finding with source mapping + diff",
      inputSchema: { findingId: z.string().min(1) },
    },
    async (input) => {
      const result = await getFinding(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  server.registerTool(
    "run_audit",
    {
      description: "Queue a new audit for a URL",
      inputSchema: { url: z.string().url() },
    },
    async (input) => {
      const result = await runAudit(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  return server;
}
