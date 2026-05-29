import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  })),
}));

vi.mock("./env", () => ({
  env: {
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "secret",
    SESSION_SECRET: "x".repeat(32),
    APP_URL: "http://localhost:3000",
  },
}));

import {
  clearSession,
  getSession,
  setSession,
  consumeOAuthState,
  setOAuthState,
} from "./session";

beforeEach(() => {
  cookieStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("session helpers", () => {
  it("returns null when no session cookie is present", async () => {
    expect(await getSession()).toBeNull();
  });

  it("round-trips a session", async () => {
    await setSession({
      githubToken: "ghp_abc",
      login: "octocat",
      avatarUrl: "https://example.com/a.png",
      connectedAt: 1700000000000,
    });
    const s = await getSession();
    expect(s?.login).toBe("octocat");
    expect(s?.githubToken).toBe("ghp_abc");
  });

  it("clearSession removes the cookie", async () => {
    await setSession({
      githubToken: "t",
      login: "u",
      avatarUrl: "",
      connectedAt: 0,
    });
    await clearSession();
    expect(await getSession()).toBeNull();
  });
});

describe("oauth state helpers", () => {
  it("setOAuthState writes a value that consumeOAuthState returns and clears", async () => {
    await setOAuthState("abc123");
    expect(await consumeOAuthState()).toBe("abc123");
    expect(await consumeOAuthState()).toBeNull();
  });
});
