import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getSession, clearSession, listBranches } = vi.hoisted(() => ({
  getSession: vi.fn(),
  clearSession: vi.fn(),
  listBranches: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession, clearSession }));
vi.mock("@/lib/github", () => ({
  octokitForSession: () => ({
    rest: { repos: { listBranches } },
  }),
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ owner: "acme", name: "lume-app" }) };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/github/repos/[owner]/[name]/branches", () => {
  it("returns 401 without a session", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns branch names when authenticated", async () => {
    getSession.mockResolvedValueOnce({ githubToken: "t", login: "u", avatarUrl: "", connectedAt: 0 });
    listBranches.mockResolvedValueOnce({
      data: [{ name: "main" }, { name: "develop" }],
    });
    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ branches: ["main", "develop"] });
    expect(listBranches).toHaveBeenCalledWith({
      owner: "acme",
      repo: "lume-app",
      per_page: 100,
    });
  });
});
