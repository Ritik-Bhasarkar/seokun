import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getSession, mintMcpToken } = vi.hoisted(() => ({
  getSession: vi.fn(),
  mintMcpToken: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession }));
vi.mock("@/lib/mcp-token", () => ({ mintMcpToken }));
vi.mock("@/lib/env", () => ({
  env: {
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "sec",
    SESSION_SECRET: "x".repeat(32),
    APP_URL: "http://localhost:3000",
    MCP_TOKEN_SECRET: "y".repeat(32),
  },
}));

import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/mcp/token", () => {
  it("returns 401 when no session", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "session_required" });
  });

  it("returns 200 with token + mcpUrl when authenticated", async () => {
    getSession.mockResolvedValueOnce({
      githubToken: "t",
      login: "octocat",
      avatarUrl: "",
      connectedAt: 0,
    });
    mintMcpToken.mockReturnValueOnce("seokun_mcp.payload.sig");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      token: "seokun_mcp.payload.sig",
      mcpUrl: "http://localhost:3000/api/mcp",
    });
    expect(mintMcpToken).toHaveBeenCalledWith({ uid: "octocat" });
  });
});
