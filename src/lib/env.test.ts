import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseEnv } from "./env";

describe("parseEnv", () => {
  const good = {
    GITHUB_CLIENT_ID: "client",
    GITHUB_CLIENT_SECRET: "secret",
    SESSION_SECRET: "x".repeat(32),
    APP_URL: "http://localhost:3000",
  };

  it("parses a valid env", () => {
    expect(parseEnv(good)).toEqual(good);
  });

  it("throws when GITHUB_CLIENT_ID is missing", () => {
    expect(() => parseEnv({ ...good, GITHUB_CLIENT_ID: "" })).toThrow();
  });

  it("throws when SESSION_SECRET is too short", () => {
    expect(() => parseEnv({ ...good, SESSION_SECRET: "short" })).toThrow();
  });

  it("throws when APP_URL is not a valid URL", () => {
    expect(() => parseEnv({ ...good, APP_URL: "not-a-url" })).toThrow();
  });
});
