import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auditMock, getGithubToken } = vi.hoisted(() => ({
  auditMock: vi.fn(),
  getGithubToken: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: auditMock }));
vi.mock("./gh-token-store", () => ({ getGithubToken }));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp-server";
import { _resetForTests, recordAudit } from "./audit-store";
import type { AuditReport } from "./audit/schema";

function fakeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    id: "report-id",
    url: "https://example.com",
    auditedAt: new Date().toISOString(),
    formFactor: "mobile",
    scores: { seo: 90, performance: 80, accessibility: 95, bestPractices: 85 },
    metrics: [],
    findings: [
      {
        id: "f-1",
        severity: "warning",
        category: "perf",
        title: "Heavy import",
        recommendation: "Use dynamic import",
      },
    ],
    ...overrides,
  };
}

let client: Client;

async function connectAs(uid: string): Promise<void> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ uid });
  await server.connect(serverTransport);
  client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
}

function textPayload(res: unknown): unknown {
  const arr = (res as { content: Array<{ type: string; text: string }> }).content;
  return JSON.parse(arr[0].text);
}

beforeEach(async () => {
  _resetForTests();
  vi.clearAllMocks();
  await connectAs("octocat");
});

afterEach(() => {
  _resetForTests();
});

describe("MCP server tool surface", () => {
  it("lists the 4 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_audit", "get_finding", "list_audits", "run_audit"]);
  });
});

describe("list_audits", () => {
  it("returns an empty list when the uid has no audits", async () => {
    const res = await client.callTool({ name: "list_audits", arguments: {} });
    expect(textPayload(res)).toEqual({ audits: [], nextCursor: null });
  });

  it("returns the uid's audits with full record shape", async () => {
    recordAudit("octocat", { url: "https://example.com" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({ name: "list_audits", arguments: {} });
    const payload = textPayload(res) as { audits: Array<{ id: string; status: string }> };
    expect(payload.audits).toHaveLength(1);
    expect(payload.audits[0].id).toBe("r1");
    expect(payload.audits[0].status).toBe("complete");
  });

  it("does not leak another uid's audits", async () => {
    recordAudit("someone-else", { url: "https://x.test" }, fakeReport({ id: "other" }));
    const res = await client.callTool({ name: "list_audits", arguments: {} });
    expect(textPayload(res)).toEqual({ audits: [], nextCursor: null });
  });
});

describe("get_audit", () => {
  it("returns the audit when owned by this uid", async () => {
    recordAudit("octocat", { url: "https://example.com" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({
      name: "get_audit",
      arguments: { auditId: "r1" },
    });
    const payload = textPayload(res) as { id: string; status: string };
    expect(payload.id).toBe("r1");
  });

  it("returns not_found for another uid's audit", async () => {
    recordAudit("someone-else", { url: "https://x.test" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({
      name: "get_audit",
      arguments: { auditId: "r1" },
    });
    expect(textPayload(res)).toEqual({ error: "not_found" });
  });
});

describe("get_finding", () => {
  it("returns the finding when owned by this uid", async () => {
    recordAudit("octocat", { url: "https://example.com" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({
      name: "get_finding",
      arguments: { findingId: "f-1" },
    });
    const payload = textPayload(res) as { auditId: string; finding: { id: string } };
    expect(payload.auditId).toBe("r1");
    expect(payload.finding.id).toBe("f-1");
  });

  it("returns not_found across uids", async () => {
    recordAudit("someone-else", { url: "https://x.test" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({
      name: "get_finding",
      arguments: { findingId: "f-1" },
    });
    expect(textPayload(res)).toEqual({ error: "not_found" });
  });
});

describe("run_audit", () => {
  it("queues a URL audit and reports queued status", async () => {
    auditMock.mockResolvedValueOnce(fakeReport({ id: "queued-1" }));
    const res = await client.callTool({
      name: "run_audit",
      arguments: { url: "https://example.com" },
    });
    const payload = textPayload(res) as { status: string; auditId: string };
    expect(payload.status).toBe("queued");
    expect(payload.auditId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("returns validation_error when neither url nor repo is set", async () => {
    const res = await client.callTool({ name: "run_audit", arguments: {} });
    const payload = textPayload(res) as { error?: string };
    expect(payload.error).toBe("validation_error");
  });
});
