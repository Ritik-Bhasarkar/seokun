import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getSession, mintMcpToken, setGithubToken, clearGithubToken } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    mintMcpToken: vi.fn(),
    setGithubToken: vi.fn(),
    clearGithubToken: vi.fn(),
  }));

vi.mock("@/lib/session", () => ({ getSession }));
vi.mock("@/lib/mcp-token", () => ({ mintMcpToken }));
vi.mock("@/lib/gh-token-store", () => ({ setGithubToken, clearGithubToken }));
vi.mock("@/lib/env", () => ({
  env: {
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "sec",
    SESSION_SECRET: "x".repeat(32),
    APP_URL: "http://localhost:3000",
    MCP_TOKEN_SECRET: "y".repeat(32),
  },
}));

import { DELETE, POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/mcp/token", () => {
  it("returns 401 when no session", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "session_required" });
    expect(setGithubToken).not.toHaveBeenCalled();
  });

  it("returns 200, mints a token, and snapshots the GitHub token under the session uid", async () => {
    getSession.mockResolvedValueOnce({
      githubToken: "ghp_real",
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
    expect(setGithubToken).toHaveBeenCalledWith("octocat", "ghp_real");
  });
});

describe("DELETE /api/mcp/token", () => {
  it("returns 204 and clears the snapshotted token when a session exists", async () => {
    getSession.mockResolvedValueOnce({
      githubToken: "ghp_real",
      login: "octocat",
      avatarUrl: "",
      connectedAt: 0,
    });
    const res = await DELETE();
    expect(res.status).toBe(204);
    expect(clearGithubToken).toHaveBeenCalledWith("octocat");
  });

  it("returns 204 even without a session and does not call clearGithubToken", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await DELETE();
    expect(res.status).toBe(204);
    expect(clearGithubToken).not.toHaveBeenCalled();
  });
});
