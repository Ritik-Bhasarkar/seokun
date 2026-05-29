# Claude MCP Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real MCP server at `/api/mcp` exposing 4 stub audit tools, gated by per-user bearer tokens; plus a "Connect Claude" modal that mints the token and shows Claude Desktop/Code config snippets.

**Architecture:** Backend = `@modelcontextprotocol/sdk` McpServer with Streamable HTTP transport, stateless mode. Tokens are signed HMAC tokens (no DB). Frontend = a modal mirroring the GithubModal pattern. Two-phase implementation: backend (Tasks 1–9) commits first and is testable independently; frontend + docs (Tasks 10–13) follows.

**Tech Stack:** Next.js 16 App Router, `@modelcontextprotocol/sdk`, `iron-session` (existing), `zod` (existing), Vitest, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-05-27-claude-mcp-design.md`

---

## Important Next.js 16 notes

- `cookies()` from `next/headers` is **async** — `await cookies()`.
- Route handlers receive `(request: NextRequest, ctx: { params: Promise<...> })`. `params` is a Promise.
- Use `NextResponse.json(...)` for JSON responses; `new Response(null, { status: 204 })` for empty.

## Important MCP SDK notes

- The package is `@modelcontextprotocol/sdk` — imports use sub-paths like `@modelcontextprotocol/sdk/server/mcp.js`.
- `StreamableHTTPServerTransport` in **stateless mode** (`sessionIdGenerator: undefined`) is the right choice for Next.js — each request is independent.
- The SDK's `InMemoryTransport.createLinkedPair()` is the test-time helper for connecting a `Client` to a `McpServer` in-process.
- The transport's `handleRequest(req, res, body)` expects **Node.js-style** req/res. In Next.js Web-standard route handlers, we adapt by parsing the body once and calling the SDK's `handleMessage` directly (see Task 8 for the exact adapter).

---

## File map

```
Create:
  src/lib/mcp-token.ts                                          + .test.ts
  src/lib/audit-store.ts                                        + .test.ts
  src/lib/mcp-server.ts                                         + .test.ts
  src/app/api/mcp/token/route.ts                                + .test.ts
  src/app/api/mcp/route.ts                                      + .test.ts
  src/components/claude-modal/claude-modal.tsx
  src/components/claude-modal/claude-modal.module.scss
  docs/claude-connect.md

Modify:
  src/lib/env.ts                                                add MCP_TOKEN_SECRET to schema
  src/lib/types.ts                                              add Audit, Finding, ClaudeConnection
  src/components/home-screen/home-screen.tsx                    wire onConnectClaude → open ClaudeModal
  .env.local                                                    add MCP_TOKEN_SECRET
```

---

# Phase A — Backend

### Task 1: Install MCP SDK + add `MCP_TOKEN_SECRET` to env schema

**Files:**
- Modify: `package.json`, `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.local`

- [ ] **Step 1: Install `@modelcontextprotocol/sdk`**

```bash
npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Add `MCP_TOKEN_SECRET` to the env schema in `src/lib/env.ts`**

Locate the existing `Schema` declaration and add the new field:

```ts
const Schema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.string().url(),
  MCP_TOKEN_SECRET: z.string().min(32),
});
```

- [ ] **Step 3: Extend `src/lib/env.test.ts` `good` fixture and add one new test**

In the test file, add `MCP_TOKEN_SECRET` to the `good` fixture:

```ts
const good = {
  GITHUB_CLIENT_ID: "client",
  GITHUB_CLIENT_SECRET: "secret",
  SESSION_SECRET: "x".repeat(32),
  APP_URL: "http://localhost:3000",
  MCP_TOKEN_SECRET: "y".repeat(32),
};
```

Add one new test inside the `describe("parseEnv")` block:

```ts
it("throws when MCP_TOKEN_SECRET is too short", () => {
  expect(() => parseEnv({ ...good, MCP_TOKEN_SECRET: "short" })).toThrow();
});
```

- [ ] **Step 4: Append `MCP_TOKEN_SECRET` to `.env.local`**

Generate a secret:
```bash
openssl rand -hex 32
```

Append to `.env.local`:
```
MCP_TOKEN_SECRET=<output of openssl above>
```

- [ ] **Step 5: Run env tests**

Run: `npm test -- src/lib/env.test.ts`
Expected: PASS (5 tests now, was 4).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/env.ts src/lib/env.test.ts
git commit -m "chore: add MCP SDK + MCP_TOKEN_SECRET env"
```

(`.env.local` is gitignored and not committed.)

---

### Task 2: MCP token helpers (`src/lib/mcp-token.ts`) — TDD

**Files:**
- Create: `src/lib/mcp-token.ts`
- Test: `src/lib/mcp-token.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/mcp-token.test.ts`:

```ts
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

  it("returns null on wrong version", () => {
    const payload = { v: 999, uid: "u", iat: Date.now() };
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    // Construct with a valid signature but wrong version
    const tokenWithoutSig = `seokun_mcp.${b64}.`;
    // Use the real signer to sign the wrong-version payload, so signature passes but version check fails
    const { createHmac } = require("node:crypto");
    const sig = createHmac("sha256", "y".repeat(32)).update(b64).digest("base64url");
    expect(parseMcpToken(`seokun_mcp.${b64}.${sig}`)).toBeNull();
  });

  it("prefix is 'seokun_mcp'", () => {
    expect(mintMcpToken({ uid: "x" }).startsWith("seokun_mcp.")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect failure** — module not found.

Run: `npm test -- src/lib/mcp-token.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/mcp-token.ts`**

```ts
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export type TokenPayload = {
  v: 1;
  uid: string;
  iat: number;
};

const PREFIX = "seokun_mcp";

function sign(payloadB64: string): string {
  return createHmac("sha256", env.MCP_TOKEN_SECRET)
    .update(payloadB64)
    .digest("base64url");
}

export function mintMcpToken(input: { uid: string }): string {
  const payload: TokenPayload = { v: 1, uid: input.uid, iat: Date.now() };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(b64);
  return `${PREFIX}.${b64}.${sig}`;
}

export function parseMcpToken(token: string): TokenPayload | null {
  if (!token.startsWith(`${PREFIX}.`)) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, payloadB64, sig] = parts;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as TokenPayload).v !== 1 ||
    typeof (payload as TokenPayload).uid !== "string" ||
    typeof (payload as TokenPayload).iat !== "number"
  ) {
    return null;
  }
  return payload as TokenPayload;
}
```

- [ ] **Step 4: Run test, expect pass** — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-token.ts src/lib/mcp-token.test.ts
git commit -m "feat(mcp): add signed bearer token helpers"
```

---

### Task 3: Audit store stub (`src/lib/audit-store.ts`) — TDD

**Files:**
- Create: `src/lib/audit-store.ts`
- Test: `src/lib/audit-store.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/audit-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { listAudits, getAudit, getFinding, runAudit } from "./audit-store";

describe("audit-store (stub)", () => {
  it("listAudits returns empty list", async () => {
    const result = await listAudits({});
    expect(result).toEqual({ audits: [], nextCursor: null });
  });

  it("listAudits accepts limit and cursor without crashing", async () => {
    const result = await listAudits({ limit: 5, cursor: "abc" });
    expect(result).toEqual({ audits: [], nextCursor: null });
  });

  it("getAudit returns not_found for any id", async () => {
    expect(await getAudit({ auditId: "stub-1" })).toEqual({ error: "not_found" });
  });

  it("getFinding returns not_found for any id", async () => {
    expect(await getFinding({ findingId: "f-1" })).toEqual({ error: "not_found" });
  });

  it("runAudit returns stub auditId with _note", async () => {
    const result = await runAudit({ url: "https://example.com" });
    expect(result.status).toBe("queued");
    expect(result.auditId).toMatch(/^stub-/);
    expect(result._note).toBe("audit engine not yet implemented");
  });
});
```

- [ ] **Step 2: Run test, expect failure** — module not found.

- [ ] **Step 3: Implement `src/lib/audit-store.ts`**

```ts
import { randomUUID } from "node:crypto";
import type { Audit, Finding } from "./types";

type NotFound = { error: "not_found" };

export async function listAudits(
  _input: { limit?: number; cursor?: string },
): Promise<{ audits: Audit[]; nextCursor: string | null }> {
  return { audits: [], nextCursor: null };
}

export async function getAudit(
  _input: { auditId: string },
): Promise<Audit | NotFound> {
  return { error: "not_found" };
}

export async function getFinding(
  _input: { findingId: string },
): Promise<Finding | NotFound> {
  return { error: "not_found" };
}

export async function runAudit(
  _input: { url: string },
): Promise<{ auditId: string; status: "queued"; _note: string }> {
  return {
    auditId: `stub-${randomUUID()}`,
    status: "queued",
    _note: "audit engine not yet implemented",
  };
}
```

> Note: This file references `Audit` and `Finding` from `./types` — Task 4 adds those types. The file is still importable (TypeScript erases types at runtime), but tsc will fail until Task 4 lands. Run tests for Task 3 with `npm test --` (Vitest skips type-checking), then run `npx tsc --noEmit` only after Task 4.

- [ ] **Step 4: Run test, expect pass** — 5 tests.

Run: `npm test -- src/lib/audit-store.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit-store.ts src/lib/audit-store.test.ts
git commit -m "feat(audit): stub audit store for MCP tools"
```

---

### Task 4: Add `Audit`, `Finding`, `ClaudeConnection` types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Append the three types to `src/lib/types.ts`**

Open `src/lib/types.ts` and add after the existing exports:

```ts
export type Audit = {
	id: string;
	url: string;
	status: "queued" | "running" | "complete" | "failed";
	score: number | null;
	startedAt: string;
	completedAt: string | null;
	findingCount: number;
};

export type Finding = {
	id: string;
	auditId: string;
	category: "performance" | "a11y" | "seo" | "best-practices";
	severity: "high" | "medium" | "low";
	title: string;
	description: string;
	source: {
		file: string;
		line: number;
		snippet: string;
	} | null;
	diff: string | null;
};

export type ClaudeConnection = {
	token: string;
	mcpUrl: string;
	createdAt: number;
};
```

(Indentation: TABS — matches existing file style.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors related to types. `src/lib/audit-store.ts` (from Task 3) now type-checks.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add Audit, Finding, ClaudeConnection"
```

---

### Task 5: MCP server + tools (`src/lib/mcp-server.ts`) — TDD

**Files:**
- Create: `src/lib/mcp-server.ts`
- Test: `src/lib/mcp-server.test.ts`

- [ ] **Step 1: Write the failing test using `InMemoryTransport`**

`src/lib/mcp-server.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp-server";

let client: Client;

beforeEach(async () => {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ uid: "octocat" });
  await server.connect(serverTransport);
  client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
});

describe("MCP server tool surface", () => {
  it("lists the 4 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_audit", "get_finding", "list_audits", "run_audit"]);
  });

  it("list_audits returns empty list", async () => {
    const res = await client.callTool({ name: "list_audits", arguments: {} });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ audits: [], nextCursor: null });
  });

  it("get_audit returns not_found", async () => {
    const res = await client.callTool({ name: "get_audit", arguments: { auditId: "x" } });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ error: "not_found" });
  });

  it("get_finding returns not_found", async () => {
    const res = await client.callTool({ name: "get_finding", arguments: { findingId: "x" } });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ error: "not_found" });
  });

  it("run_audit returns stub auditId + _note", async () => {
    const res = await client.callTool({
      name: "run_audit",
      arguments: { url: "https://example.com" },
    });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("queued");
    expect(parsed.auditId).toMatch(/^stub-/);
    expect(parsed._note).toBe("audit engine not yet implemented");
  });

  it("run_audit rejects missing url", async () => {
    await expect(
      client.callTool({ name: "run_audit", arguments: {} }),
    ).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, expect failure** — module not found or import error.

Run: `npm test -- src/lib/mcp-server.test.ts`

- [ ] **Step 3: Implement `src/lib/mcp-server.ts`**

```ts
import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getAudit,
  getFinding,
  listAudits,
  runAudit,
} from "./audit-store";

export function createMcpServer(_ctx: { uid: string }): McpServer {
  const server = new McpServer({
    name: "seokun",
    version: "0.1.0",
  });

  server.tool(
    "list_audits",
    {
      limit: z.number().int().positive().max(100).optional(),
      cursor: z.string().optional(),
    },
    async (input) => {
      const result = await listAudits(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  server.tool(
    "get_audit",
    { auditId: z.string().min(1) },
    async (input) => {
      const result = await getAudit(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  server.tool(
    "get_finding",
    { findingId: z.string().min(1) },
    async (input) => {
      const result = await getFinding(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  server.tool(
    "run_audit",
    { url: z.string().url() },
    async (input) => {
      const result = await runAudit(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  return server;
}
```

> Note on the `_ctx` parameter: `uid` is currently unused but is accepted so future tools can scope data per-user without changing the function signature.

> **Verify SDK API at implementation time:** the exact import paths and `server.tool()` signature have shifted between SDK minor versions. If the test fails with import errors, check `node_modules/@modelcontextprotocol/sdk/package.json` `exports` field and adjust the imports in BOTH `mcp-server.ts` and `mcp-server.test.ts`. The `McpServer`, `Client`, and `InMemoryTransport` symbols are stable across recent versions; the path to them may differ.

- [ ] **Step 4: Run test, expect pass** — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-server.ts src/lib/mcp-server.test.ts
git commit -m "feat(mcp): add McpServer factory with 4 stub tools"
```

---

### Task 6: `POST /api/mcp/token` — mint endpoint — TDD

**Files:**
- Create: `src/app/api/mcp/token/route.ts`
- Test: `src/app/api/mcp/token/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/mcp/token/route.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test, expect failure** — module not found.

- [ ] **Step 3: Implement `src/app/api/mcp/token/route.ts`**

```ts
import { env } from "@/lib/env";
import { mintMcpToken } from "@/lib/mcp-token";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "session_required" }, { status: 401 });
  }
  const token = mintMcpToken({ uid: session.login });
  const mcpUrl = new URL("/api/mcp", env.APP_URL).toString();
  return Response.json({ token, mcpUrl });
}
```

- [ ] **Step 4: Run test, expect pass** — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mcp/token/route.ts src/app/api/mcp/token/route.test.ts
git commit -m "feat(mcp): add POST /api/mcp/token mint endpoint"
```

---

### Task 7: `DELETE /api/mcp/token` — revoke endpoint — TDD

**Files:**
- Modify: `src/app/api/mcp/token/route.ts` (add DELETE export)
- Modify: `src/app/api/mcp/token/route.test.ts` (add 1 test)

- [ ] **Step 1: Add the failing test**

Append to `src/app/api/mcp/token/route.test.ts`:

```ts
import { DELETE } from "./route";

describe("DELETE /api/mcp/token", () => {
  it("returns 204 unconditionally", async () => {
    const res = await DELETE();
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test, expect failure** — `DELETE` not exported.

- [ ] **Step 3: Add `DELETE` to `src/app/api/mcp/token/route.ts`**

Append to the existing file:

```ts
export async function DELETE() {
  // v1: tokens are stateless, so revocation is UI-only. The token remains
  // valid until MCP_TOKEN_SECRET rotates. This is documented in the modal.
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Run test, expect pass** — 3 tests total now.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mcp/token/route.ts src/app/api/mcp/token/route.test.ts
git commit -m "feat(mcp): add DELETE /api/mcp/token (UI-only revoke)"
```

---

### Task 8: `POST /api/mcp` — MCP server route — TDD

**Files:**
- Create: `src/app/api/mcp/route.ts`
- Test: `src/app/api/mcp/route.test.ts`

This route adapts Next.js `Request` to the MCP SDK's transport. The simplest adapter: parse the JSON-RPC request body, instantiate the SDK's transport, dispatch through an in-memory pipe, and return the response. The plan code below uses a direct dispatch pattern that avoids needing Node-style req/res.

- [ ] **Step 1: Write the failing test**

`src/app/api/mcp/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseMcpToken, createMcpServer } = vi.hoisted(() => ({
  parseMcpToken: vi.fn(),
  createMcpServer: vi.fn(),
}));

vi.mock("@/lib/mcp-token", () => ({ parseMcpToken }));
vi.mock("@/lib/mcp-server", () => ({ createMcpServer }));

import { POST } from "./route";

function req(body: unknown, opts: { auth?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
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
    // Mock the server with a stub that returns a known response when handleMessage is called
    const handleMessage = vi.fn().mockResolvedValue({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "stub" },
    });
    createMcpServer.mockReturnValueOnce({ server: { handleMessage } });
    const res = await POST(
      req({ jsonrpc: "2.0", id: 1, method: "initialize" }, { auth: "Bearer good" }),
    );
    expect(res.status).toBe(200);
    expect(createMcpServer).toHaveBeenCalledWith({ uid: "octocat" });
  });
});
```

> Note: The third test stubs `createMcpServer` to return an object with a `server.handleMessage` method. This matches the implementation pattern below — the route bypasses `StreamableHTTPServerTransport` and dispatches directly to the underlying server. The verification step in Step 3 includes the option to use the transport instead; if the implementer chooses that route, the test for "dispatches" needs to be adjusted accordingly.

- [ ] **Step 2: Run test, expect failure** — module not found.

- [ ] **Step 3: Implement `src/app/api/mcp/route.ts`**

```ts
import { createMcpServer } from "@/lib/mcp-server";
import { parseMcpToken } from "@/lib/mcp-token";

type JsonRpcError = {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string };
};

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  httpStatus: number,
): Response {
  const body: JsonRpcError = { jsonrpc: "2.0", id, error: { code, message } };
  return Response.json(body, { status: httpStatus });
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  let body: { id?: string | number | null } & Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error", 400);
  }
  const reqId = body?.id ?? null;

  if (!auth || !auth.startsWith("Bearer ")) {
    return jsonRpcError(reqId, -32001, "missing_token", 401);
  }
  const token = auth.slice("Bearer ".length);
  const payload = parseMcpToken(token);
  if (!payload) {
    return jsonRpcError(reqId, -32002, "invalid_token", 401);
  }

  const wrapper = createMcpServer({ uid: payload.uid });
  // McpServer exposes its underlying server via `.server` (Server from @mcp/sdk).
  // The Server has a `handleMessage` method that takes a JSON-RPC message and
  // returns a JSON-RPC response. This bypasses StreamableHTTPServerTransport,
  // which expects Node-style req/res. For our stateless single-request model,
  // direct dispatch is simpler.
  // If the SDK version changes the API, verify by running the test and adjust.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = (wrapper as any).server;
  const response = await server.handleMessage(body);
  return Response.json(response);
}
```

> **Verify SDK API at implementation time:** The line `const server = (wrapper as any).server` reaches into the McpServer's private internals. If the SDK exposes a public `handleMessage` on `McpServer` directly (check `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts`), use that instead. If neither works, the fallback is to use `StreamableHTTPServerTransport` with a Node req/res adapter (e.g. `node:http`'s `IncomingMessage` / `ServerResponse` synthesized from the Web `Request`). The test stub matches this direct-dispatch pattern; if you switch to the transport, update the test accordingly.

- [ ] **Step 4: Run test, expect pass** — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mcp/route.ts src/app/api/mcp/route.test.ts
git commit -m "feat(mcp): add POST /api/mcp route with bearer auth"
```

---

### Task 9: Phase A verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass (existing OAuth tests + 17 new MCP tests).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: zero errors. If the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` in Task 8 triggers a different rule, adjust the comment.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds. The new routes appear in the route list:
- `/api/mcp`
- `/api/mcp/token`

- [ ] **Step 5: Manual smoke (without modal yet)**

```bash
npm run dev
```

In a separate terminal, with the dev server running and after manually connecting GitHub via the existing UI to get a session cookie:

```bash
# Get a token (replace COOKIE with the seokun_session cookie value from your browser)
curl -i -X POST http://localhost:3000/api/mcp/token \
  -H "Cookie: seokun_session=COOKIE"

# Expected: 200 with { "token": "seokun_mcp...", "mcpUrl": "..." }

# Call MCP server
TOKEN=<paste token from above>
curl -i -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Expected: 200 with a tools list containing list_audits, get_audit, get_finding, run_audit
```

If both curl calls succeed, Phase A is done. If you cannot easily get a `seokun_session` cookie value, skip the smoke test — the unit/integration tests already cover the same paths.

- [ ] **Step 6: No additional commit** — verification only.

---

# Phase B — Frontend + Docs

### Task 10: Claude modal component

**Files:**
- Create: `src/components/claude-modal/claude-modal.tsx`
- Create: `src/components/claude-modal/claude-modal.module.scss`

No unit tests for this component — relies on manual smoke (Task 13). The pattern mirrors `github-modal.tsx`.

- [ ] **Step 1: Create `src/components/claude-modal/claude-modal.module.scss`**

```scss
.claude-modal__overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.55);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 100;
}

.claude-modal {
	width: min(560px, 92vw);
	background: var(--bg-elev, #14161b);
	border: 1px solid var(--border, #2a2d36);
	border-radius: 14px;
	overflow: hidden;
	font-family: var(--font-sans);
	color: var(--fg, #e6e8ee);
}

.claude-modal__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 18px;
	border-bottom: 1px solid var(--border, #2a2d36);
}

.claude-modal__head-l {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
}

.claude-modal__close {
	background: transparent;
	border: 0;
	color: var(--fg-dim, #7a8094);
	cursor: pointer;
	padding: 4px;
}

.claude-modal__body {
	padding: 20px 22px 22px;
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.claude-modal__title {
	font-size: 17px;
	font-weight: 600;
	margin: 0;
}

.claude-modal__p {
	color: var(--fg-dim, #98a0b3);
	font-size: 13px;
	line-height: 1.55;
	margin: 0;
}

.claude-modal__error {
	color: #ff6b6b;
	font-size: 12px;
}

.claude-modal__token-row {
	display: flex;
	align-items: center;
	gap: 8px;
	background: var(--bg, #0b0d11);
	border: 1px solid var(--border, #2a2d36);
	border-radius: 8px;
	padding: 8px 10px;
	font-family: var(--font-mono);
	font-size: 12px;
}

.claude-modal__token-value {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.claude-modal__tabs {
	display: flex;
	gap: 4px;
	border-bottom: 1px solid var(--border, #2a2d36);
}

.claude-modal__tab {
	background: transparent;
	border: 0;
	color: var(--fg-dim, #98a0b3);
	padding: 8px 12px;
	font-size: 12px;
	cursor: pointer;
	border-bottom: 2px solid transparent;
}

.claude-modal__tab--active {
	color: var(--fg, #e6e8ee);
	border-bottom-color: var(--accent, #4f8cff);
}

.claude-modal__snippet {
	background: var(--bg, #0b0d11);
	border: 1px solid var(--border, #2a2d36);
	border-radius: 8px;
	padding: 12px;
	font-family: var(--font-mono);
	font-size: 11.5px;
	line-height: 1.55;
	overflow-x: auto;
	white-space: pre;
}

.claude-modal__foot {
	display: flex;
	justify-content: space-between;
	margin-top: 8px;
}

.claude-modal__btn-mini {
	background: transparent;
	border: 1px solid var(--border, #2a2d36);
	color: var(--fg-dim, #98a0b3);
	border-radius: 6px;
	font-size: 11px;
	padding: 4px 8px;
	cursor: pointer;
}
```

- [ ] **Step 2: Create `src/components/claude-modal/claude-modal.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "../button/button";
import { IconClaude, IconCheck, IconX } from "../icons/icons";
import type { ClaudeConnection } from "@/lib/types";
import styles from "./claude-modal.module.scss";

type Step = "auth" | "connected";
type Tab = "desktop" | "code";

type Props = {
	open: boolean;
	connection: ClaudeConnection | null;
	hasGithubSession: boolean;
	onClose: () => void;
	onConnect: (conn: ClaudeConnection) => void;
	onDisconnect: () => void;
	onGoConnectGithub: () => void;
};

export function ClaudeModal({
	open,
	connection,
	hasGithubSession,
	onClose,
	onConnect,
	onDisconnect,
	onGoConnectGithub,
}: Props) {
	const [step, setStep] = useState<Step>(connection ? "connected" : "auth");
	const [tab, setTab] = useState<Tab>("desktop");
	const [tokenVisible, setTokenVisible] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setStep(connection ? "connected" : "auth");
		setTokenVisible(false);
		setGenerating(false);
		setError(null);
		setTab("desktop");
	}, [open, connection]);

	if (!open) return null;

	const generate = async () => {
		setError(null);
		setGenerating(true);
		try {
			const res = await fetch("/api/mcp/token", { method: "POST" });
			if (res.status === 401) {
				setError("Connect GitHub first.");
				setGenerating(false);
				return;
			}
			if (!res.ok) {
				setError("Couldn't generate token. Try again.");
				setGenerating(false);
				return;
			}
			const json = (await res.json()) as { token: string; mcpUrl: string };
			onConnect({
				token: json.token,
				mcpUrl: json.mcpUrl,
				createdAt: Date.now(),
			});
		} catch {
			setError("Network error.");
		} finally {
			setGenerating(false);
		}
	};

	const disconnect = async () => {
		await fetch("/api/mcp/token", { method: "DELETE" });
		onDisconnect();
	};

	const copy = (text: string) => {
		void navigator.clipboard?.writeText(text);
	};

	const desktopSnippet = (token: string, mcpUrl: string) =>
		`{
  "mcpServers": {
    "seokun": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer ${token}" }
    }
  }
}`;

	const codeSnippet = (token: string, mcpUrl: string) =>
		`claude mcp add seokun ${mcpUrl} --header "Authorization: Bearer ${token}"`;

	return (
		<div
			className={styles["claude-modal__overlay"]}
			onClick={onClose}
			role="presentation"
		>
			<div
				className={styles["claude-modal"]}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Connect Claude"
			>
				<div className={styles["claude-modal__head"]}>
					<div className={styles["claude-modal__head-l"]}>
						<IconClaude size={16} />
						<span>{step === "connected" ? "Claude connected" : "Connect Claude"}</span>
					</div>
					<button
						type="button"
						className={styles["claude-modal__close"]}
						onClick={onClose}
						aria-label="Close"
					>
						<IconX size={14} stroke={2} />
					</button>
				</div>

				{step === "auth" && (
					<div className={styles["claude-modal__body"]}>
						<h2 className={styles["claude-modal__title"]}>
							Expose your audits to Claude
						</h2>
						<p className={styles["claude-modal__p"]}>
							seokun runs an MCP server. Generate a token and paste the
							snippet into your Claude config — Claude can then list your audits,
							inspect findings, and (later) trigger new ones from the chat.
						</p>
						{!hasGithubSession ? (
							<>
								<p className={styles["claude-modal__p"]}>
									Connect your GitHub account first so the token is tied to your repo.
								</p>
								<Button variant="primary" onClick={onGoConnectGithub}>
									Connect GitHub
								</Button>
							</>
						) : (
							<Button
								variant="primary"
								onClick={generate}
								disabled={generating}
								leftIcon={<IconClaude size={14} />}
							>
								{generating ? "Generating…" : "Generate connection token"}
							</Button>
						)}
						{error && <div className={styles["claude-modal__error"]}>{error}</div>}
					</div>
				)}

				{step === "connected" && connection && (
					<div className={styles["claude-modal__body"]}>
						<h2 className={styles["claude-modal__title"]}>Your connection token</h2>
						<div className={styles["claude-modal__token-row"]}>
							<span className={styles["claude-modal__token-value"]}>
								{tokenVisible ? connection.token : "•".repeat(36)}
							</span>
							<button
								type="button"
								className={styles["claude-modal__btn-mini"]}
								onClick={() => setTokenVisible((v) => !v)}
							>
								{tokenVisible ? "Hide" : "Show"}
							</button>
							<button
								type="button"
								className={styles["claude-modal__btn-mini"]}
								onClick={() => copy(connection.token)}
							>
								Copy
							</button>
						</div>

						<div className={styles["claude-modal__tabs"]}>
							<button
								type="button"
								className={[
									styles["claude-modal__tab"],
									tab === "desktop" ? styles["claude-modal__tab--active"] : "",
								]
									.filter(Boolean)
									.join(" ")}
								onClick={() => setTab("desktop")}
							>
								Claude Desktop
							</button>
							<button
								type="button"
								className={[
									styles["claude-modal__tab"],
									tab === "code" ? styles["claude-modal__tab--active"] : "",
								]
									.filter(Boolean)
									.join(" ")}
								onClick={() => setTab("code")}
							>
								Claude Code
							</button>
						</div>

						{tab === "desktop" && (
							<>
								<p className={styles["claude-modal__p"]}>
									Add to <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>,
									then restart Claude Desktop.
								</p>
								<pre className={styles["claude-modal__snippet"]}>
									{desktopSnippet(connection.token, connection.mcpUrl)}
								</pre>
								<button
									type="button"
									className={styles["claude-modal__btn-mini"]}
									onClick={() => copy(desktopSnippet(connection.token, connection.mcpUrl))}
								>
									Copy snippet
								</button>
							</>
						)}

						{tab === "code" && (
							<>
								<p className={styles["claude-modal__p"]}>
									Run in any terminal where Claude Code is installed:
								</p>
								<pre className={styles["claude-modal__snippet"]}>
									{codeSnippet(connection.token, connection.mcpUrl)}
								</pre>
								<button
									type="button"
									className={styles["claude-modal__btn-mini"]}
									onClick={() => copy(codeSnippet(connection.token, connection.mcpUrl))}
								>
									Copy command
								</button>
							</>
						)}

						<p className={styles["claude-modal__p"]} style={{ fontSize: 11 }}>
							Disconnecting removes the token from this UI only. To force-revoke
							server-side, ask the team to rotate <code>MCP_TOKEN_SECRET</code>.
						</p>

						<div className={styles["claude-modal__foot"]}>
							<Button variant="ghost" size="sm" onClick={disconnect}>
								Disconnect
							</Button>
							<Button size="sm" onClick={onClose} leftIcon={<IconCheck size={13} stroke={2.4} />}>
								Done
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
```

> Note: This component uses the existing `Button` and `Icon*` components from the project. If `IconClaude` doesn't already accept `size`, check `src/components/icons/icons.tsx` and adjust the prop shape — but it should, since `TopNav` already calls `<IconClaude size={14} />`.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: zero errors. The `react-hooks/set-state-in-effect` rule may fire on the open-reset effect — the inline disable comment in the code above handles it.

- [ ] **Step 4: Commit**

```bash
git add src/components/claude-modal
git commit -m "feat(modal): add ClaudeModal component"
```

---

### Task 11: Home-screen integration

**Files:**
- Modify: `src/components/home-screen/home-screen.tsx`

- [ ] **Step 1: Add ClaudeModal state + storage key**

In `src/components/home-screen/home-screen.tsx`, near the existing `REPO_STORAGE_KEY`:

```ts
const CLAUDE_STORAGE_KEY = "seokun:claude";
```

Add to the component's state declarations (near `ghOpen`):

```ts
const [claudeOpen, setClaudeOpen] = useState(false);
const [claudeConn, setClaudeConn] = useState<ClaudeConnection | null>(null);
```

Add the import at the top:

```ts
import { ClaudeModal } from "../claude-modal/claude-modal";
import type { ClaudeConnection, Repo } from "@/lib/types";
```

(Replace the existing `import type { Repo } from "@/lib/types";` with the line above.)

- [ ] **Step 2: Add localStorage rehydration + persistence effects**

Below the existing localStorage rehydrate effect:

```ts
useEffect(() => {
	try {
		const raw = window.localStorage.getItem(CLAUDE_STORAGE_KEY);
		// Rehydrating persisted Claude connection from localStorage.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		if (raw) setClaudeConn(JSON.parse(raw) as ClaudeConnection);
	} catch {
		// ignore — invalid stored claude state
	}
}, []);

useEffect(() => {
	try {
		if (claudeConn) {
			window.localStorage.setItem(
				CLAUDE_STORAGE_KEY,
				JSON.stringify(claudeConn),
			);
		} else {
			window.localStorage.removeItem(CLAUDE_STORAGE_KEY);
		}
	} catch {
		// ignore — storage may be unavailable
	}
}, [claudeConn]);
```

- [ ] **Step 3: Wire `onConnectClaude`**

Update the existing `<TopNav onConnectClaude={...}>` prop to actually open the modal:

```tsx
<TopNav
	repo={repo}
	onConnectRepo={() => setGhOpen(true)}
	onConnectClaude={() => setClaudeOpen(true)}
/>
```

- [ ] **Step 4: Render `<ClaudeModal />`**

Add immediately after the existing `<GithubModal ... />` block:

```tsx
<ClaudeModal
	open={claudeOpen}
	connection={claudeConn}
	hasGithubSession={repo !== null}
	onClose={() => setClaudeOpen(false)}
	onConnect={(conn) => {
		setClaudeConn(conn);
	}}
	onDisconnect={() => setClaudeConn(null)}
	onGoConnectGithub={() => {
		setClaudeOpen(false);
		setGhOpen(true);
	}}
/>
```

> Note: `hasGithubSession={repo !== null}` is a proxy — we treat "has a connected repo" as "has a logged-in GitHub session," since the modal's only consequence of a missing session is the token endpoint returning 401. If `repo` is null but the user has a session cookie, the token mint still works; the modal's preflight is just a UX hint.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/home-screen/home-screen.tsx
git commit -m "feat(home): wire Connect Claude button to ClaudeModal"
```

---

### Task 12: User-facing docs (`docs/claude-connect.md`)

**Files:**
- Create: `docs/claude-connect.md`

- [ ] **Step 1: Create the docs file**

```markdown
# Connecting Claude to seokun

seokun runs an [MCP](https://modelcontextprotocol.io) server. Once connected,
Claude (Desktop or Code) can list your audits, inspect findings, and request
new audits — all from the chat.

## Prerequisites

- A seokun account with a connected GitHub repo.
- Claude Desktop **or** Claude Code installed.

## Steps

### 1. Generate a connection token

In seokun, click **Connect Claude** in the top nav. If you haven't connected
GitHub yet, you'll be prompted to do that first.

Click **Generate connection token**. A token starting with `seokun_mcp.` will
appear, alongside config snippets for Claude Desktop and Claude Code.

> The token is tied to your account. Anyone with the token can read your
> audits via MCP — treat it like a password.

### 2. Add seokun to your Claude client

#### Claude Desktop

1. Open `~/Library/Application Support/Claude/claude_desktop_config.json`
   (macOS) or the equivalent on your platform.
2. Paste the snippet shown in the modal under the `mcpServers` key:

   ```jsonc
   {
     "mcpServers": {
       "seokun": {
         "url": "https://your-seokun-instance/api/mcp",
         "headers": { "Authorization": "Bearer seokun_mcp.<TOKEN>" }
       }
     }
   }
   ```

3. Restart Claude Desktop.
4. In a new chat, type "What tools do you have from seokun?" — Claude should
   list 4 tools.

#### Claude Code

Run the command shown in the modal:

```bash
claude mcp add seokun https://your-seokun-instance/api/mcp \
  --header "Authorization: Bearer seokun_mcp.<TOKEN>"
```

Verify with `claude mcp list`.

## Available tools

| Tool | Purpose | Status |
|---|---|---|
| `list_audits` | List your recent audits | Stub (returns empty list) |
| `get_audit` | Get details for one audit | Stub (returns not_found) |
| `get_finding` | Get one finding with source mapping + diff | Stub (returns not_found) |
| `run_audit` | Queue a new audit for a URL | Stub (no engine yet) |

> All tools are currently backed by an in-memory stub — they respond with
> empty or `not_found` results. The audit engine ships in a separate release;
> the wire protocol won't change.

## Troubleshooting

**Claude says "no tools available"** — Check that the URL in your config
points to a reachable seokun instance and the `Authorization` header is
present.

**MCP requests return 401** — Your token is invalid or the seokun server
rotated its `MCP_TOKEN_SECRET`. Generate a new token from the **Connect
Claude** modal and update your config.

**Tool returns empty / not_found** — Expected for now. The audit engine
is the next milestone.

## Revoking access

Click **Disconnect** in the Connect Claude modal. This removes the token
from the seokun UI, but the token remains valid on the server until
`MCP_TOKEN_SECRET` is rotated. To force-revoke immediately, contact the team.
```

- [ ] **Step 2: Commit**

```bash
git add docs/claude-connect.md
git commit -m "docs: add Connect Claude user guide"
```

---

### Task 13: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds with `/api/mcp` and `/api/mcp/token` in the route list.

- [ ] **Step 5: Manual smoke**

```bash
npm run dev
```

In a browser at `http://localhost:3000`:
1. Connect GitHub via the existing modal (real credentials required).
2. Click **Connect Claude** in the top nav.
3. Click **Generate connection token** → token + snippets appear.
4. Copy the Claude Desktop snippet → paste into your Claude config → restart Claude Desktop.
5. In Claude, ask "What tools do you have from seokun?" — should list `list_audits`, `get_audit`, `get_finding`, `run_audit`.
6. Ask "Run list_audits" — should return an empty list.
7. Ask "Run run_audit on https://example.com" — should return a stub `auditId` with the `_note` about the engine not being implemented.
8. Close Claude Desktop. Back in seokun, click **Disconnect** in the Claude modal — token disappears from UI.
9. Reopen Claude — tool calls still work (stateless tokens; expected).

If steps 1–7 succeed, the feature ships.

- [ ] **Step 6: No additional commit** — verification only.

---

## Out of scope (deferred — do not implement)

- Real audit engine (`audit-store.ts` stays a stub)
- Server-side token revocation (UI-only in v1)
- MCP OAuth 2.1 / dynamic client registration
- stdio transport
- Token expiry / refresh
- Apply-fix or write-side tools
- Rendering `docs/claude-connect.md` as a `/claude-connect` route (it lives in the repo only for v1)
