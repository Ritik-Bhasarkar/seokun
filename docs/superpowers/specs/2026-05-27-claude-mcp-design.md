# Claude MCP Connect — Design

**Date:** 2026-05-27
**Status:** Draft, awaiting user review
**Owner:** Ritik

## Goal

Wire the "Connect Claude" button to a modal that helps users connect their Claude client (Desktop / Code) to seokun's MCP server. Ship the MCP server itself in the same Next.js app at `/api/mcp`, exposing four audit-related tools (currently returning stub data) authenticated by per-user bearer tokens.

## Non-goals

- A real audit engine (`audit-store.ts` is a stub; `run_audit` does not actually queue work)
- MCP prompts or resources (tools only)
- `apply_fix` or other write tools beyond `run_audit`
- MCP OAuth 2.1 dynamic client registration (bearer tokens only)
- stdio transport (Streamable HTTP only — works for both local Claude Desktop and remote Claude Code)
- Token rotation / expiry (tokens live until explicitly revoked)
- Multi-tenant tokens (one token per user session)

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Modal UI + docs + real MCP server endpoint | One coupled feature, ship as two phases |
| Auth | Per-user bearer token | Simplest; works in every Claude client config |
| Tool set | Speculative full set with stub data | Pins schemas now so Claude integrations can be built |
| MCP transport | Streamable HTTP | Works for local + remote clients; replaces deprecated HTTP+SSE |
| MCP SDK | `@modelcontextprotocol/sdk` (TS, official) | Maintained by Anthropic |

## Architecture

### Dependencies (new, runtime)

- `@modelcontextprotocol/sdk`

(Re-uses already-installed `iron-session`, `zod`, `@octokit/rest`.)

### Environment variables (required, zod-validated alongside existing ones)

| Var | Purpose |
|---|---|
| `MCP_TOKEN_SECRET` | 32+ chars, signs MCP bearer tokens. Separate from `SESSION_SECRET` so MCP tokens rotate independently. |

### File layout

```
Create:
  src/app/api/mcp/route.ts                      POST handler: Streamable HTTP MCP transport
  src/app/api/mcp/token/route.ts                POST = mint, DELETE = revoke (web session required)
  src/lib/mcp-token.ts                          mint / parse / revoke helpers (stateless, signed)
  src/lib/mcp-server.ts                         McpServer instance + 4 tool handlers
  src/lib/audit-store.ts                        in-memory stub; real audit engine plugs in here later
  src/components/claude-modal/claude-modal.tsx          mirrors github-modal pattern
  src/components/claude-modal/claude-modal.module.scss
  docs/claude-connect.md                        user-facing how-to (the md file the user asked for)

Modify:
  src/lib/env.ts                                add MCP_TOKEN_SECRET to schema
  src/lib/types.ts                              add Audit, Finding, ClaudeConnection types
  src/components/home-screen/home-screen.tsx    wire onConnectClaude → open the new modal
```

### Two-phase implementation

The spec is one document, but the work splits into two phases that commit independently:

- **Phase A — backend.** Env var, MCP server, route handler, token mint/revoke endpoints, audit-store stub, full test coverage. Connectable from Claude via raw config paste before Phase B lands.
- **Phase B — frontend.** Claude-modal component, home-screen integration, `docs/claude-connect.md`.

## Tool surface

All four tools live in `src/lib/mcp-server.ts`, register via the SDK's `server.tool()` API, and accept zod-validated inputs.

### `list_audits`

```
input:  { limit?: number = 20, cursor?: string }
output: { audits: Audit[], nextCursor: string | null }
```
Stub returns `{ audits: [], nextCursor: null }`.

### `get_audit`

```
input:  { auditId: string }
output: Audit | { error: "not_found" }
```
Stub returns `{ error: "not_found" }`.

### `get_finding`

```
input:  { findingId: string }
output: Finding | { error: "not_found" }
```
Stub returns `{ error: "not_found" }`.

### `run_audit`

```
input:  { url: string }
output: { auditId: string, status: "queued", _note: string }
```
Stub returns `{ auditId: "stub-<uuid>", status: "queued", _note: "audit engine not yet implemented" }`. The `_note` is intentional — Claude clients surface it so the user knows the limitation.

### Shared types (`src/lib/types.ts`)

```ts
export type Audit = {
  id: string;
  url: string;
  status: "queued" | "running" | "complete" | "failed";
  score: number | null;        // 0-100, null until complete
  startedAt: string;            // ISO
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
  mcpUrl: string;                // e.g. https://seokun.app/api/mcp
  createdAt: number;             // epoch ms
};
```

## MCP transport

Streamable HTTP transport (the modern recommended one, supersedes HTTP+SSE).

- Route: `POST /api/mcp`
- Single-request lifecycle per JSON-RPC message; responses can be JSON or an SSE stream of partial chunks
- The MCP SDK's `StreamableHTTPServerTransport` handles framing. We adapt to Next.js by passing the `Request` through to the transport and returning the SDK's response.
- We do NOT keep persistent connections; each request stands alone. Simpler than session-id-based SSE bidirectional streams.

## Token model

### Token format (stateless, signed)

```
seokun_mcp.<base64url(JSON.stringify(payload))>.<base64url(hmacSha256(payload, MCP_TOKEN_SECRET))>
```

```ts
type TokenPayload = {
  v: 1;                    // version, for future migrations
  uid: string;             // user identity (github login from session)
  iat: number;             // issued at, epoch ms
};
```

Stateless: no DB lookup on every MCP request. Revocation is handled by versioning the secret — out of scope for v1. (`Disconnect` button in the modal just removes the token from the user-facing display; the token still works on the server side until `MCP_TOKEN_SECRET` rotates. This is acceptable for v1 and noted in the modal copy.)

### Mint endpoint

`POST /api/mcp/token`
- Requires existing iron-session (`getSession()`); 401 otherwise
- Generates token with `uid = session.login`
- Returns `{ token, mcpUrl }`

### Revoke endpoint

`DELETE /api/mcp/token`
- 204 always (revocation is a UI affordance only in v1, since tokens are stateless)
- Documented in the modal: "Tokens remain valid until we rotate signing secrets. To force-revoke now, ask the team."

### Validate inside `/api/mcp` route handler

Pull `Authorization: Bearer <token>` header → verify signature → extract `uid` → make available to tool handlers via a request-scoped context. Invalid/missing token → 401 JSON-RPC error.

## Connect Claude modal

Mirrors `GithubModal`. Two steps: `auth` (not yet connected, generate token) and `connected` (token visible + config snippets + disconnect).

### Step `auth`

- Title: "Connect Claude"
- Body explains what MCP is + that seokun's MCP server exposes the user's audits to Claude
- CTA: "Generate connection token" → `POST /api/mcp/token`
- Requires GitHub session (login is part of token payload). If no session, modal shows "Connect GitHub first" with a hand-off button

### Step `connected`

- Shows the generated token (with copy button + a "show/hide" toggle since it's sensitive)
- Shows the MCP URL
- Tabbed snippets for **Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`) and **Claude Code** (`~/.claude.json` or similar — verify at implementation time):

```jsonc
// Claude Desktop
{
  "mcpServers": {
    "seokun": {
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

```jsonc
// Claude Code (use `claude mcp add`)
claude mcp add seokun http://localhost:3000/api/mcp --header "Authorization: Bearer <TOKEN>"
```

- Footer: "Disconnect" (DELETE /api/mcp/token) and "Open docs" (links to `/claude-connect`)

### Component state

```ts
type Step = "auth" | "connected";
const [step, setStep] = useState<Step>(connection ? "connected" : "auth");
const [tokenVisible, setTokenVisible] = useState(false);
const [generating, setGenerating] = useState(false);
const [error, setError] = useState<string | null>(null);
```

The `connection` is persisted to `localStorage` like the GitHub repo, so the user sees their connection status on reload. The actual token is also in localStorage — acceptable for v1 since the same browser session can also read the session cookie to mint a fresh one anyway.

## docs/claude-connect.md

User-facing how-to, written as a plain markdown file in the repo (NOT rendered as a web route in v1). Outline:

1. What MCP is + why seokun exposes one (2-3 paragraphs)
2. Prerequisites: connected GitHub account on seokun
3. Step-by-step for Claude Desktop (with screenshot placeholder)
4. Step-by-step for Claude Code (with `claude mcp add` command)
5. Available tools (table: name → purpose → status)
6. Troubleshooting: 401 errors, tool not appearing, etc.

The modal embeds the key config snippets inline (so the user doesn't need to leave the app), and the docs file is the expanded version that lives in the repo for anyone browsing the codebase. The modal's footer links to the file on GitHub (`https://github.com/<owner>/seokun/blob/main/docs/claude-connect.md`) — owner/repo placeholders are filled in at implementation time based on the connected repo or hard-coded once a canonical repo URL exists.

## Auth / data flow

### Token mint

```
User clicks "Generate connection token" in claude-modal
         │
         ▼
fetch("/api/mcp/token", { method: "POST" })
         │
         ▼  [our server]
POST /api/mcp/token
  · session = await getSession(); 401 if no GitHub session
  · token = mintMcpToken({ uid: session.login })
  · return { token, mcpUrl: `${env.APP_URL}/api/mcp` }
         │
         ▼  [browser]
Modal advances to step="connected"
Connection persisted to localStorage["seokun:claude"]
```

### MCP call (from Claude)

```
Claude → POST /api/mcp
         Authorization: Bearer seokun_mcp.<payload>.<sig>
         body: <JSON-RPC request>
         │
         ▼  [our server]
src/app/api/mcp/route.ts
  · const token = request.headers.get("authorization")?.slice("Bearer ".length)
  · const { uid } = parseMcpToken(token, env.MCP_TOKEN_SECRET)
       — if parse fails: return 401 JSON-RPC error
  · const transport = new StreamableHTTPServerTransport()
  · const server = createMcpServer({ uid })   // tools close over uid for future per-user data
  · await server.connect(transport)
  · return transport.handleRequest(request)
```

## Error handling

### Token endpoint

| Condition | Response |
|---|---|
| No session | `401 { error: "session_required" }` |
| `MCP_TOKEN_SECRET` missing (startup) | env validation fails fast, no boot |

### MCP route

| Condition | Response (JSON-RPC error) |
|---|---|
| Missing `Authorization` header | `-32001` ("missing_token") |
| Token parse / signature failure | `-32002` ("invalid_token") |
| Token version mismatch (`v != 1`) | `-32003` ("token_version") |
| Tool input zod validation failure | `-32602` (invalid params) — handled by SDK |
| Tool handler throws unexpectedly | `-32603` (internal error) — handled by SDK |

JSON-RPC error codes in the `-32000` to `-32099` range are reserved for server-defined errors; we use `-32001..3` for auth.

### Modal

| Condition | UX |
|---|---|
| `POST /api/mcp/token` returns 401 | Show "Connect GitHub first" with a button that closes this modal and opens the GitHub modal |
| Network error | Show retry banner |

## Testing strategy

### Phase A unit tests

- `lib/mcp-token.ts` — round-trip mint/parse with a fixed secret; tampered signature fails; version mismatch fails
- `lib/audit-store.ts` — list returns empty, get returns null, runAudit returns stub with `_note`

### Phase A integration tests

- `POST /api/mcp/token` — 401 without session, 200 with session returns valid token and matching `mcpUrl`
- `DELETE /api/mcp/token` — always 204
- `POST /api/mcp` — 401 without bearer, 401 with bad bearer, 200 with valid bearer + a JSON-RPC `initialize` request returns server info
- `POST /api/mcp` — each of the 4 tools called via JSON-RPC `tools/call`, returns expected stub payloads

### Phase B

- `lib/claude-storage.ts` (or inline logic) for localStorage round-trip
- Modal: no automated component tests (no React testing setup); rely on manual smoke

### Mocking boundary

- `@modelcontextprotocol/sdk` is real (not mocked) — it's our wire protocol
- Audit store is real (in-memory)
- Iron-session mocked the same way as existing session tests

### Manual smoke (the only thing that proves end-to-end)

1. `npm run dev`
2. Connect GitHub
3. Open Connect Claude modal → generate token
4. Add to Claude Desktop config
5. Restart Claude Desktop
6. Ask Claude "What tools do you have from seokun?" → should list 4
7. Ask "list_audits" → empty list
8. Ask "run_audit https://example.com" → returns stub auditId

## Setup checklist (step 0 of the implementation plan)

1. Add to `.env.local`:
   ```
   MCP_TOKEN_SECRET=<openssl rand -hex 32>
   ```
2. Install `@modelcontextprotocol/sdk`
3. No GitHub-side setup needed

## Open questions for the implementation plan

(none — all decisions taken)
