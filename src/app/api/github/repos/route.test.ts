import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getSession, clearSession, listForAuthenticatedUser } = vi.hoisted(() => ({
  getSession: vi.fn(),
  clearSession: vi.fn(),
  listForAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession, clearSession }));
vi.mock("@/lib/github", () => ({
  octokitForSession: () => ({
    rest: { repos: { listForAuthenticatedUser } },
  }),
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/github/repos", () => {
  it("returns 401 with no session", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns mapped repos when authenticated", async () => {
    getSession.mockResolvedValueOnce({ githubToken: "t", login: "u", avatarUrl: "", connectedAt: 0 });
    listForAuthenticatedUser.mockResolvedValueOnce({
      data: [
        {
          name: "lume-app",
          owner: { login: "acme" },
          language: "TypeScript",
          pushed_at: new Date().toISOString(),
          private: true,
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.repos[0]).toMatchObject({
      owner: "acme",
      name: "lume-app",
      lang: "TypeScript",
      private: true,
    });
  });

  it("returns 401 + clears session when GitHub returns 401", async () => {
    getSession.mockResolvedValueOnce({ githubToken: "t", login: "u", avatarUrl: "", connectedAt: 0 });
    listForAuthenticatedUser.mockRejectedValueOnce(Object.assign(new Error("unauth"), { status: 401 }));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when GitHub returns 403 rate limit", async () => {
    getSession.mockResolvedValueOnce({ githubToken: "t", login: "u", avatarUrl: "", connectedAt: 0 });
    listForAuthenticatedUser.mockRejectedValueOnce(
      Object.assign(new Error("rate"), {
        status: 403,
        response: { headers: { "x-ratelimit-reset": "1700000000" } },
      }),
    );
    const res = await GET();
    expect(res.status).toBe(429);
  });
});
