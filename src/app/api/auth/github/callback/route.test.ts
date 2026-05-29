import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost:3000" },
}));

const { consumeOAuthState, setSession, createToken, getAuthenticatedUser } = vi.hoisted(() => ({
  consumeOAuthState: vi.fn(),
  setSession: vi.fn(),
  createToken: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ consumeOAuthState, setSession }));

vi.mock("@/lib/github", () => ({
  oauthApp: { createToken },
  octokitForSession: () => ({
    rest: { users: { getAuthenticated: getAuthenticatedUser } },
  }),
}));

import { GET } from "./route";

function req(qs: string) {
  return new Request(`http://localhost:3000/api/auth/github/callback?${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth/github/callback", () => {
  it("redirects with reason=denied when GitHub sends error=access_denied", async () => {
    const res = await GET(req("error=access_denied"));
    expect(res.headers.get("location")).toContain("/?gh=error&reason=denied");
    expect(createToken).not.toHaveBeenCalled();
  });

  it("redirects with reason=state when state cookie is missing", async () => {
    consumeOAuthState.mockResolvedValueOnce(null);
    const res = await GET(req("code=abc&state=xyz"));
    expect(res.headers.get("location")).toContain("reason=state");
  });

  it("redirects with reason=state when state does not match", async () => {
    consumeOAuthState.mockResolvedValueOnce("stored-state");
    const res = await GET(req("code=abc&state=other"));
    expect(res.headers.get("location")).toContain("reason=state");
  });

  it("redirects with reason=exchange when createToken throws", async () => {
    consumeOAuthState.mockResolvedValueOnce("good");
    createToken.mockRejectedValueOnce(new Error("nope"));
    const res = await GET(req("code=abc&state=good"));
    expect(res.headers.get("location")).toContain("reason=exchange");
  });

  it("redirects with reason=scope when granted scopes are insufficient", async () => {
    consumeOAuthState.mockResolvedValueOnce("good");
    createToken.mockResolvedValueOnce({
      authentication: { token: "t", scopes: ["public_repo"] },
    });
    const res = await GET(req("code=abc&state=good"));
    expect(res.headers.get("location")).toContain("reason=scope");
    expect(setSession).not.toHaveBeenCalled();
  });

  it("saves session and redirects to /?gh=connected on happy path", async () => {
    consumeOAuthState.mockResolvedValueOnce("good");
    createToken.mockResolvedValueOnce({
      authentication: { token: "ghp_real", scopes: ["repo"] },
    });
    getAuthenticatedUser.mockResolvedValueOnce({
      data: { login: "octocat", avatar_url: "https://example.com/a.png" },
    });

    const res = await GET(req("code=abc&state=good"));
    expect(setSession).toHaveBeenCalledWith({
      githubToken: "ghp_real",
      login: "octocat",
      avatarUrl: "https://example.com/a.png",
      connectedAt: expect.any(Number),
    });
    expect(res.headers.get("location")).toContain("/?gh=connected");
  });
});
