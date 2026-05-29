import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp-server";

let client: Client;

beforeEach(async () => {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ uid: "octocat" });
  await server.connect(serverTransport);
  client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
});

describe("MCP server tool surface", () => {
  it("lists the 4 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_audit", "get_finding", "list_audits", "run_audit"]);
  });

  it("list_audits returns empty list", async () => {
    const res = await client.callTool({ name: "list_audits", arguments: {} });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ audits: [], nextCursor: null });
  });

  it("get_audit returns not_found", async () => {
    const res = await client.callTool({ name: "get_audit", arguments: { auditId: "x" } });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ error: "not_found" });
  });

  it("get_finding returns not_found", async () => {
    const res = await client.callTool({ name: "get_finding", arguments: { findingId: "x" } });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ error: "not_found" });
  });

  it("run_audit returns stub auditId + _note", async () => {
    const res = await client.callTool({
      name: "run_audit",
      arguments: { url: "https://example.com" },
    });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("queued");
    expect(parsed.auditId).toMatch(/^stub-/);
    expect(parsed._note).toBe("audit engine not yet implemented");
  });
});
