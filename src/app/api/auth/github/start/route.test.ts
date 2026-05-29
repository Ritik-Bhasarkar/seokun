import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { setOAuthState, getWebFlowAuthorizationUrl } = vi.hoisted(() => ({
  setOAuthState: vi.fn(),
  getWebFlowAuthorizationUrl: vi.fn(({ state }: { state: string }) => ({
    url: `https://github.com/login/oauth/authorize?state=${state}&scope=repo`,
  })),
}));

vi.mock("@/lib/session", () => ({
  setOAuthState,
}));

vi.mock("@/lib/github", () => ({
  oauthApp: { getWebFlowAuthorizationUrl },
  callbackUrl: () => "http://localhost:3000/api/auth/github/callback",
}));

import { GET } from "./route";

describe("GET /api/auth/github/start", () => {
  it("stores a state cookie and redirects to GitHub with matching state", async () => {
    const res = await GET();
    expect(res.status).toBe(302);

    const location = res.headers.get("location") ?? "";
    const stateInUrl = new URL(location).searchParams.get("state");
    expect(stateInUrl).toBeTruthy();
    expect(setOAuthState).toHaveBeenCalledWith(stateInUrl);
    expect(location).toContain("github.com/login/oauth/authorize");
  });
});
