import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuditInputSchema } from "@/lib/audit/schema";
import {
  getAudit,
  getFinding,
  listAudits,
  runAudit,
} from "./audit-store";

export function createMcpServer(ctx: { uid: string }): McpServer {
  const server = new McpServer({ name: "seokun", version: "0.2.0" });

  server.registerTool(
    "list_audits",
    {
      description: "List the user's recent audits",
      inputSchema: {
        limit: z.number().int().positive().max(100).optional(),
        cursor: z.string().optional(),
      },
    },
    async (input) => textResult(listAudits(ctx.uid, input)),
  );

  server.registerTool(
    "get_audit",
    {
      description: "Get details for one audit by id",
      inputSchema: { auditId: z.string().min(1) },
    },
    async (input) => textResult(getAudit(ctx.uid, input)),
  );

  server.registerTool(
    "get_finding",
    {
      description: "Get one finding by id with source mapping",
      inputSchema: { findingId: z.string().min(1) },
    },
    async (input) => textResult(getFinding(ctx.uid, input)),
  );

  server.registerTool(
    "run_audit",
    {
      description:
        "Queue an audit (URL, repo, or both). Returns an auditId immediately; poll get_audit for status and findings.",
      inputSchema: {
        url: z.string().url().optional(),
        formFactor: z.enum(["mobile", "desktop"]).optional(),
        repo: z
          .object({ owner: z.string().min(1), name: z.string().min(1) })
          .optional(),
      },
    },
    async (input) => {
      const parsed = AuditInputSchema.safeParse(input);
      if (!parsed.success) {
        return textResult({
          error: "validation_error",
          issues: parsed.error.issues,
        });
      }
      return textResult(await runAudit(ctx.uid, parsed.data));
    },
  );

  return server;
}

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}
