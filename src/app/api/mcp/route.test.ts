import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseMcpToken } = vi.hoisted(() => ({
  parseMcpToken: vi.fn(),
}));

vi.mock("@/lib/mcp-token", () => ({ parseMcpToken }));

import { POST } from "./route";

function req(body: unknown, opts: { auth?: string } = {}) {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  });
  if (opts.auth) headers.set("authorization", opts.auth);
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/mcp", () => {
  it("returns 401 JSON-RPC error when no Authorization header", async () => {
    const res = await POST(req({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(-32001);
  });

  it("returns 401 JSON-RPC error when token invalid", async () => {
    parseMcpToken.mockReturnValueOnce(null);
    const res = await POST(
      req({ jsonrpc: "2.0", id: 1, method: "initialize" }, { auth: "Bearer bad" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(-32002);
  });

  it("dispatches to MCP server when token is valid", async () => {
    parseMcpToken.mockReturnValueOnce({ v: 1, uid: "octocat", iat: Date.now() });
    const initBody = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.1" },
      },
    };
    const res = await POST(req(initBody, { auth: "Bearer good" }));
    expect(res.status).toBe(200);
    expect(parseMcpToken).toHaveBeenCalledWith("good");
  });
});
