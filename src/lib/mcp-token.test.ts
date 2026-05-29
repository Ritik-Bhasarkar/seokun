import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./env", () => ({
  env: {
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "sec",
    SESSION_SECRET: "x".repeat(32),
    APP_URL: "http://localhost:3000",
    MCP_TOKEN_SECRET: "y".repeat(32),
  },
}));

import { mintMcpToken, parseMcpToken } from "./mcp-token";

describe("mcp-token", () => {
  it("round-trips uid through mint/parse", () => {
    const token = mintMcpToken({ uid: "octocat" });
    const payload = parseMcpToken(token);
    expect(payload).toMatchObject({ uid: "octocat", v: 1 });
    expect(typeof payload?.iat).toBe("number");
  });

  it("returns null on tampered signature", () => {
    const token = mintMcpToken({ uid: "octocat" });
    const tampered = token.slice(0, -2) + "xx";
    expect(parseMcpToken(tampered)).toBeNull();
  });

  it("returns null on malformed token", () => {
    expect(parseMcpToken("not-a-token")).toBeNull();
    expect(parseMcpToken("seokun_mcp.notbase64!.sig")).toBeNull();
    expect(parseMcpToken("")).toBeNull();
  });

  it("returns null on wrong version", async () => {
    const payload = { v: 999, uid: "u", iat: Date.now() };
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", "y".repeat(32)).update(b64).digest("base64url");
    expect(parseMcpToken(`seokun_mcp.${b64}.${sig}`)).toBeNull();
  });

  it("prefix is 'seokun_mcp'", () => {
    expect(mintMcpToken({ uid: "x" }).startsWith("seokun_mcp.")).toBe(true);
  });
});
