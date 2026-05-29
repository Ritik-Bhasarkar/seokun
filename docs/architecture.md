# seokun — System Architecture

seokun is built around three subsystems that share a single Next.js 16 app:

1. **GitHub OAuth** — authenticates the user and gives the engine read access to their repos
2. **Claude / MCP** — exposes the user's audits to Claude (Desktop / Code) via the Model Context Protocol
3. **Audit engine** — runs Lighthouse + Cheerio + (optional) source-code checks on a URL

This document describes how they fit together, what packages each one uses, and what contracts (schemas / interfaces) cross the boundaries.

---

## Shared foundation

All three subsystems pull from the same three modules:

```
SHARED FOUNDATION
─────────────────
┌────────────────────────────────────────────────────────────┐
│  src/lib/env.ts        zod-validated env (lazy Proxy)      │
│    GITHUB_CLIENT_ID / SECRET                               │
│    SESSION_SECRET / MCP_TOKEN_SECRET                       │
│    APP_URL                                                 │
│                                                            │
│  src/lib/session.ts    iron-session (HttpOnly cookies)     │
│    seokun_session  (githubToken, login, avatarUrl)         │
│    seokun_oauth_state  (CSRF, 10-min TTL)                  │
│                                                            │
│  src/lib/types.ts      Repo, RepoListItem, RecentAudit,    │
│                        Audit, Finding, ClaudeConnection    │
└────────────────────────────────────────────────────────────┘
                              │ ▲ ▲ ▲
            ┌─────────────────┘ │ │ │
            │            ┌──────┘ │ └──────────┐
            ▼            ▼        ▼            ▼
        (GitHub)      (MCP)   (Audit)    (UI / dashboard)
```

- **`env.ts`** uses a lazy `Proxy` so `parseEnv` can be imported in tests without `process.env` being populated. Real consumers (e.g. `iron-session`'s `password` option) trigger validation on first property access.
- **`session.ts`** wraps `iron-session` with helpers: `getSession`, `setSession`, `clearSession`, plus a separate `setOAuthState` / `consumeOAuthState` pair for the OAuth handshake CSRF cookie.
- **`types.ts`** holds cross-subsystem types. Audit-specific zod schemas live in `src/lib/audit/schema.ts`.

---

## Subsystem 1 — GitHub OAuth

```
╔══════════════════╗
║  GITHUB OAUTH    ║
╠══════════════════╣
║  HTTP ROUTES     ║
║  /api/auth/      ║
║   github/        ║
║   start          ║
║   callback       ║
║   logout         ║
║  /api/github/    ║
║   repos          ║
║   repos/[owner]/ ║
║   [name]/        ║
║   branches       ║
║                  ║
║  HELPERS         ║
║   github.ts      ║
║    OAuthApp +    ║
║    Octokit       ║
║    factory       ║
║   repo-mapper.ts ║
║    GH repo →     ║
║    RepoListItem  ║
║                  ║
║  AUTH MODEL      ║
║   web flow,      ║
║   scope=repo,    ║
║   token sealed   ║
║   in cookie      ║
║                  ║
║  PACKAGES        ║
║   @octokit/      ║
║    oauth-app     ║
║   @octokit/rest  ║
╚══════════════════╝
```

**Flow.** User clicks "Connect repo" in the modal → browser is redirected to `/api/auth/github/start` → server generates random `state`, sets it in `seokun_oauth_state`, redirects to GitHub. GitHub returns to `/api/auth/github/callback?code=…&state=…`, where the server verifies the state, exchanges the code for a token via `@octokit/oauth-app`, calls `users.getAuthenticated()` to capture the login + avatar, and seals everything into `seokun_session`. Subsequent calls to `/api/github/repos` and `/api/github/repos/[owner]/[name]/branches` use `octokitForSession(session)` to read.

**Spec / plan:** `docs/superpowers/specs/2026-05-27-github-oauth-design.md` and `docs/superpowers/plans/2026-05-27-github-oauth.md`.

---

## Subsystem 2 — Claude / MCP

```
╔══════════════════╗
║  CLAUDE / MCP    ║
╠══════════════════╣
║  HTTP ROUTES     ║
║  /api/mcp        ║
║   token (POST/   ║
║          DELETE) ║
║  /api/mcp        ║
║   (POST, MCP     ║
║    JSON-RPC)     ║
║                  ║
║  HELPERS         ║
║   mcp-token.ts   ║
║    HMAC-SHA256   ║
║    stateless     ║
║   mcp-server.ts  ║
║    McpServer +   ║
║    4 tools       ║
║   audit-store.ts ║
║    stub for now  ║
║                  ║
║  ERROR CODES     ║
║   -32001 missing ║
║   -32002 invalid ║
║                  ║
║  AUTH MODEL      ║
║   per-user       ║
║   bearer token,  ║
║   minted from    ║
║   session.login  ║
║                  ║
║  PACKAGES        ║
║   @model-        ║
║    contextproto- ║
║    col/sdk       ║
║                  ║
║  TOOLS EXPOSED   ║
║   list_audits    ║
║   get_audit      ║
║   get_finding    ║
║   run_audit      ║
╚══════════════════╝
```

**Token flow.** UI calls `POST /api/mcp/token` → server reads `seokun_session`, calls `mintMcpToken({ uid: session.login })`, returns `{ token, mcpUrl }`. The token is `seokun_mcp.<base64url(payload)>.<base64url(hmac-sha256)>` — stateless, so no DB.

**Server flow.** Claude POSTs JSON-RPC to `/api/mcp` with `Authorization: Bearer <token>`. The route validates the signature (`parseMcpToken`), constructs an `McpServer` instance via `createMcpServer({ uid })`, connects it to a fresh `WebStandardStreamableHTTPServerTransport`, and returns `transport.handleRequest(request)` — the SDK natively accepts a Web standard `Request` and returns a `Response`, so no Node-style req/res shim is needed.

**Tool surface.** Schemas are pinned now even though `audit-store.ts` returns stubs (`{ audits: [], nextCursor: null }`, `{ error: "not_found" }`, `{ auditId: "stub-<uuid>", _note: "audit engine not yet implemented" }`). When the engine wires through here in v2, the wire protocol won't change.

**Spec / plan:** `docs/superpowers/specs/2026-05-27-claude-mcp-design.md` and `docs/superpowers/plans/2026-05-27-claude-mcp.md`. User-facing how-to: `docs/claude-connect.md`.

---

## Subsystem 3 — Audit engine

```
╔══════════════════════╗
║  AUDIT ENGINE        ║
╠══════════════════════╣
║  HTTP ROUTE          ║
║  /api/audit          ║
║   (POST, maxDuration ║
║    =90)              ║
║                      ║
║  PIPELINE            ║
║   1. preflight HEAD  ║
║   2. Playwright      ║
║      chromium        ║
║   3. Lighthouse      ║
║      (perf/a11y/     ║
║       bp/seo,        ║
║       mobile|desktop)║
║   4. Cheerio HTML    ║
║      checks          ║
║   5. (optional)      ║
║      Octokit fetch   ║
║      .tsx/.jsx files,║
║      Babel parse, run║
║      4 source checks ║
║                      ║
║  MODULES             ║
║   audit/index.ts     ║
║    audit() entry     ║
║   audit/runtime.ts   ║
║   audit/lighthouse-  ║
║    mapper.ts         ║
║   audit/cheerio-     ║
║    checks.ts         ║
║   audit/source/* (4  ║
║    checks + parse)   ║
║   audit/errors.ts    ║
║                      ║
║  PACKAGES            ║
║   playwright         ║
║   lighthouse         ║
║   cheerio            ║
║   @babel/parser      ║
║   @babel/traverse    ║
║   @octokit/rest      ║
╚══════════════════════╝
```

**Pipeline.**

1. **`preflight(url)`** — `fetch(url, { method: "HEAD", signal: AbortSignal.timeout(6000) })`. If DNS fails or the connection is refused, throw `UnreachableError(host, reason)` → 502. Saves chromium spin-up for unreachable hosts.
2. **Playwright `chromium.launch`** with `--remote-debugging-port=9222`, then `page.goto(url, { waitUntil: "networkidle", timeout: 45_000 })`.
3. **Lighthouse** attaches to port 9222. `onlyCategories: ["seo", "performance", "accessibility", "best-practices"]`, `formFactor` and `screenEmulation` set from the input (mobile = 412×823@1.75, desktop = 1350×940@1).
4. **Cheerio** parses `page.content()` for our own opinionated checks (missing `<title>`, missing meta description, missing og:title/description/image).
5. **Source checks** (only when `repo` + `githubToken` are passed) — `Octokit.git.getTree({ recursive: "true" })` filtered to `.tsx`/`.jsx`, capped at 30 files; each parsed with `@babel/parser` (`errorRecovery: true`) and walked with `@babel/traverse` (handling the CJS/ESM default-import quirk). Four checks: `raw-img-alt`, `missing-metadata` (Next.js layouts), `empty-link`, `next-image-alt` (which walks ImportDeclarations FIRST to confirm `next/image` is imported before traversing).

**Output.** Every report goes through `AuditReportSchema.parse(report)` before returning — drift in any individual check produces a server-side error, not a corrupt response.

**Error handling.** `UnreachableError` from `errors.ts` is caught at the route and surfaced as 502 with `{ error: "unreachable", host, reason }`. Validation errors → 400. Anything else → generic 500. The browser is closed in a `finally` block on every path.

---

## How the three subsystems connect

```
┌─────────┐                                                ┌─────────┐
│ Browser │  ── 1. type URL on / ─────────────────────────▶│ Home    │
│         │                                                │ page    │
│         │  ◀── 5. push /audit/<id> ──────────────────────│         │
└────┬────┘                                                └────┬────┘
     │                                                          │
     │   2. POST /api/audit                                     │
     │      { url, formFactor, repo? }                          │
     ▼                                                          │
┌──────────────────────────────────────────────────┐            │
│  /api/audit                                      │            │
│    a. AuditInputSchema.parse                     │            │
│    b. if repo passed → getSession()  ◀───────────┼── reads ──▶│ GitHub
│       (needs githubToken from cookie)            │            │ subsystem
│    c. audit({ url, repo, githubToken, formFactor})            │ ───────────
│         │                                        │            │
│         ▼                                        │            │
│       runRuntime ──── preflight HEAD             │            │
│         │            └─ Playwright + Lighthouse  │            │
│         │            └─ Cheerio on rendered HTML │            │
│         ▼                                        │            │
│       runSourceChecks ─ Octokit ─◀── github.com ◀┼── token ──▶│
│         │            └─ Babel parse + 4 checks   │            │
│         ▼                                        │            │
│    d. AuditReportSchema.parse before returning   │            │
└──────────────────────────────────────────────────┘            │
     │                                                          │
     │   3. AuditReport JSON                                    │
     ▼                                                          │
┌─────────┐                                                     │
│ Browser │  4. saveReport() → localStorage["seokun:audit:<id>"]│
└────┬────┘                                                     │
     │                                                          │
     └──────────────────────────────────────────────────────────┘

     ┌──────────────── parallel surface ────────────────┐
     │                                                  │
     │   Claude Desktop / Code                          │
     │       │                                          │
     │       │ POST /api/mcp                            │
     │       │ Authorization: Bearer seokun_mcp.<sig>   │
     │       ▼                                          │
     │   ┌──────────────────────────────────┐           │
     │   │ /api/mcp                         │           │
     │   │   parseMcpToken(token) → uid     │           │
     │   │   createMcpServer({ uid })       │           │
     │   │   WebStandardStreamableHTTP-     │           │
     │   │   ServerTransport.handleRequest()│           │
     │   │     │                            │           │
     │   │     ▼                            │           │
     │   │   audit-store.ts (stub today) ── future ───▶ /api/audit
     │   └──────────────────────────────────┘           │
     │                                                  │
     │   Token mint flow:                               │
     │     UI ── POST /api/mcp/token ──▶ getSession ──▶ mintMcpToken(login)
     │                                                  │
     └──────────────────────────────────────────────────┘
```

### What ties the three together

| Tie | What flows | Where it lives |
|---|---|---|
| **Session cookie** | `githubToken` from OAuth → consumed by `/api/audit` (source checks need it) and `/api/mcp/token` (mint needs `login`) | `src/lib/session.ts` |
| **Env validation** | All three subsystems pull credentials from the same lazy Proxy | `src/lib/env.ts` |
| **Shared types** | `Repo`, `Finding`, `ClaudeConnection` flow between modals, dashboard, engine, MCP | `src/lib/types.ts` + `src/lib/audit/schema.ts` |
| **Schema as contract** | `AuditReportSchema` validates the engine's output AND validates anything `loadReport` pulls out of localStorage | `src/lib/audit/schema.ts` |
| **UI bridges** | `GithubModal` (token-bearing session), `ClaudeModal` (mints MCP token), `home-screen` (orchestrates: holds repo, claudeConn, runs audit) | `src/components/*` |

---

## Package inventory (grouped by concern)

| Subsystem | Runtime packages | Why |
|---|---|---|
| **GitHub** | `@octokit/oauth-app`, `@octokit/rest`, `iron-session` | OAuth handshake / REST API / encrypted cookie |
| **MCP** | `@modelcontextprotocol/sdk` (sub-paths `/server/mcp.js`, `/server/webStandardStreamableHttp.js`, `/client`, `/inMemory`) | Server framework, Web-standard HTTP transport, in-process testing |
| **Audit** | `playwright`, `lighthouse`, `cheerio`, `@babel/parser`, `@babel/traverse`, `@octokit/rest` | Browser orchestration, scoring, HTML parse, JSX/TS AST, repo file fetch |
| **Glue** | `next` (16.2.6 App Router), `react` 19, `zod` (every public input + output is parsed), `sass` (CSS Modules) | App shell + validation everywhere |
| **Dev** | `vitest`, `@vitest/coverage-v8`, `eslint`, `eslint-config-next`, `typescript`, `@types/*` | 74 tests, lint, strict TS |

---

## Interfaces (the contracts between layers)

| Boundary | Schema / Type | File |
|---|---|---|
| Browser → `/api/audit` | `AuditInputSchema` (url, formFactor?, repo?) | `audit/schema.ts` |
| `/api/audit` → Browser | `AuditReportSchema` (id, url, formFactor, scores, metrics, findings) | `audit/schema.ts` |
| Engine error path | `UnreachableError` → `{ error: "unreachable", host, reason }` 502 | `audit/errors.ts` |
| Browser → `/api/mcp/token` | session cookie | (no body) |
| Browser ← `/api/mcp/token` | `{ token, mcpUrl }` | inline |
| Claude → `/api/mcp` | `Authorization: Bearer seokun_mcp.<b64>.<sig>` + JSON-RPC | `mcp-token.ts` |
| Claude tool I/O | zod-validated tool args; results as `{ content: [{ type: "text", text: JSON }] }` | `mcp-server.ts` |
| Browser → `/api/auth/github/start` | (none) | — |
| GitHub callback → server | `?code=…&state=…` matched against `seokun_oauth_state` cookie | `auth/github/callback/route.ts` |
| Server → GitHub | `OAuthApp.getWebFlowAuthorizationUrl`, `createToken`; Octokit `repos.listForAuthenticatedUser`, `repos.listBranches`, `git.getTree`, `repos.getContent` | `github.ts`, `audit/source/index.ts` |

---

## Routes registered (from the last `next build`)

```
○  /                                          (static, the home page)
○  /_not-found
ƒ  /api/audit                                 POST  — audit engine
ƒ  /api/auth/github/start                     GET   — OAuth handshake start
ƒ  /api/auth/github/callback                  GET   — handshake completion
ƒ  /api/auth/github/logout                    POST  — clear session
ƒ  /api/github/repos                          GET   — list user's repos
ƒ  /api/github/repos/[owner]/[name]/branches  GET   — list branches
ƒ  /api/mcp                                   POST  — MCP server (Streamable HTTP)
ƒ  /api/mcp/token                             POST  — mint token
                                              DELETE — UI-only revoke
ƒ  /audit/[id]                                dynamic — results dashboard
```

---

## One-line summary per subsystem

- **GitHub OAuth.** Standard web flow, `repo` scope, token sealed into HttpOnly cookie via `iron-session`; Octokit reads on top of that token.
- **MCP server.** Stateless `WebStandardStreamableHTTPServerTransport` at `/api/mcp`, gated by HMAC-signed bearer tokens minted from a logged-in session.
- **Audit engine.** Preflight HEAD → Playwright/Chromium → Lighthouse (4 categories, mobile|desktop) + Cheerio + optional Octokit-fetched source AST checks, all merged through `AuditReportSchema`.

## Related docs

- `docs/superpowers/specs/2026-05-27-github-oauth-design.md` — GitHub OAuth spec
- `docs/superpowers/plans/2026-05-27-github-oauth.md` — GitHub OAuth implementation plan
- `docs/superpowers/specs/2026-05-27-claude-mcp-design.md` — Claude MCP spec
- `docs/superpowers/plans/2026-05-27-claude-mcp.md` — Claude MCP implementation plan
- `docs/claude-connect.md` — user-facing how-to for connecting Claude
- `docs/deployment.md` — why the audit engine can't run on Vercel + container deploy guide
