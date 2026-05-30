# MCP ↔ Audit Wiring — Design

**Date:** 2026-05-30
**Status:** Draft, awaiting user review
**Owner:** Ritik

## Goal

Replace the four stub MCP tools (`list_audits`, `get_audit`, `get_finding`, `run_audit`) with real implementations that drive the existing audit pipeline (`src/lib/audit/index.ts`). Make audits triggered from the web UI visible to the user's connected Claude, and let Claude trigger fresh audits — including repo source checks — over the existing Streamable HTTP MCP transport.

Also: finalize the six new source checks that are already wired into `src/lib/audit/source/index.ts` but uncommitted (Phase A).

## Non-goals

- Persistence across process restarts (in-memory `Map` is acceptable for MVP single-instance Vercel deploy)
- MCP token rotation / expiry (carried from the prior MCP spec — still out of scope)
- Multi-tenant audit visibility (records are strictly scoped to the issuing `uid`)
- A real `apply_fix` MCP tool
- Background queue / worker (audit runs fire-and-forget on the same Node process; long audits race process lifecycle — acceptable for MVP)
- Streaming progress updates over MCP (Claude polls `get_audit`)
- Refreshing the GitHub token snapshot if it's revoked (modal already warns users to re-mint)

## Decisions (locked, auto-mode)

| Decision | Choice | Rationale |
|---|---|---|
| Audit store backend | In-memory `Map<uid, AuditRecord[]>` in `src/lib/audit-store.ts` | Matches existing stub shape; single-region MVP; cheap to replace later |
| Source-check auth | Snapshot `session.githubToken` into a server-side `Map<uid, string>` at MCP token-mint time | Claude can't send our session cookie; embedding GH token in MCP bearer is worse (long-lived in client config) |
| `run_audit` execution model | Fire-and-forget: return queued status immediately, run on detached promise, write status transitions back | Audits take 60–90s — too long for a single MCP tool call; matches existing stub return shape |
| `run_audit` input | Full `AuditInputSchema` — `{ url?, repo?, formFactor? }` (one of `url`/`repo` required) | Re-uses the validated schema the `/api/audit` route already uses |
| Authorization model | Filter all reads by `record.uid === payload.uid`; cross-user reads return `{ error: "not_found" }` | Don't leak existence of other users' audits |
| Web-UI ↔ MCP convergence | `POST /api/audit` persists to the same server store, keyed by `session.login`. localStorage stays as the dashboard's offline-friendly fast path. | Web audits become visible to the user's Claude without a separate path |
| Phase A scope | Commit the 6 untracked source checks + the colocated `source-checks-extra.test.ts` + drop the unused `traverse` import in `sync-heavy-imports.ts` | All tests already pass (95/95), types clean, only that one lint warning needed a fix |

## Architecture

### File layout

```
Phase A — finalize source checks
  Commit (already in tree):
    src/lib/audit/source/div-as-button.ts
    src/lib/audit/source/heading-hierarchy.ts
    src/lib/audit/source/icon-button-label.ts
    src/lib/audit/source/input-without-label.ts
    src/lib/audit/source/sync-heavy-imports.ts        (with traverse import dropped)
    src/lib/audit/source/target-blank-rel.ts
    src/lib/audit/source/source-checks-extra.test.ts
  Commit (already-modified):
    src/lib/audit/source/index.ts                     (registers the 6 new checks)
    src/lib/audit/index.ts                            (orchestrator updates)
    src/lib/audit/schema.ts                           (schema updates)
    src/lib/audit-storage.ts                          (storage updates)
    src/components/audit-dashboard/audit-dashboard.tsx (dashboard updates)

Phase B — wire MCP to real audits
  Create:
    src/lib/gh-token-store.ts                + .test.ts
    src/lib/audit-store.test.ts              (replace the stub-era test if shape changed)
  Modify:
    src/lib/audit-store.ts                   (real in-memory store, replace 4 stubs)
    src/lib/mcp-server.ts                    (pass uid into store calls; tool input for run_audit broadens)
    src/app/api/mcp/token/route.ts           (snapshot session.githubToken into gh-token-store on mint, drop on revoke)
    src/app/api/audit/route.ts               (persist to audit-store keyed by session.login after a successful audit)
```

No frontend changes are required for Phase B — the web UI already calls `/api/audit` and saves to localStorage; adding server-side persistence behind that route is transparent.

### Two-phase commit boundary

- **Phase A** — one commit: "feat(audit): add six source checks (div-as-button, heading-hierarchy, icon-button-label, input-without-label, sync-heavy-imports, target-blank-rel)". This phase ships independently and is testable in the web UI before Phase B lands.
- **Phase B** — three commits, in order: (1) `gh-token-store` + `audit-store` rewrite (with tests), (2) MCP server tool rewrite + mint/revoke wiring, (3) `/api/audit` server-side persistence.

## Server-side audit store

`src/lib/audit-store.ts` becomes a real in-memory store. Module-scoped `Map<string, AuditRecord[]>` (key = uid).

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";
import type { AuditReport, AuditInput } from "@/lib/audit/schema";
import { getGithubToken } from "./gh-token-store";

export type AuditStatus = "queued" | "running" | "complete" | "failed";

export type AuditRecord = {
  uid: string;
  id: string;
  status: AuditStatus;
  startedAt: string;
  completedAt: string | null;
  input: AuditInput;
  report: AuditReport | null;  // populated only when status === "complete"
  errorMessage?: string;
};

const MAX_PER_USER = 50;
const store = new Map<string, AuditRecord[]>();

export function recordAudit(
  uid: string,
  input: AuditInput,
  report: AuditReport,
): AuditRecord {
  const rec: AuditRecord = {
    uid,
    id: report.id,
    status: "complete",
    startedAt: report.auditedAt,
    completedAt: report.auditedAt,
    input,
    report,
  };
  push(uid, rec);
  return rec;
}

export async function runAudit(
  uid: string,
  input: AuditInput,
): Promise<{ auditId: string; status: AuditStatus }> {
  const id = randomUUID();
  const rec: AuditRecord = {
    uid,
    id,
    status: "queued",
    startedAt: new Date().toISOString(),
    completedAt: null,
    input,
    report: null,
  };
  push(uid, rec);

  // Fire-and-forget. Status transitions write back via mutation.
  void executeAudit(rec).catch((err) => {
    console.error("[audit-store] background audit crashed", err);
  });

  return { auditId: id, status: "queued" };
}

async function executeAudit(rec: AuditRecord): Promise<void> {
  rec.status = "running";
  try {
    const githubToken = rec.input.repo ? getGithubToken(rec.uid) : undefined;
    if (rec.input.repo && !githubToken) {
      rec.status = "failed";
      rec.completedAt = new Date().toISOString();
      rec.errorMessage = "no_github_token_for_uid";
      return;
    }
    const report = await audit({ ...rec.input, githubToken });
    rec.report = { ...report, id: rec.id };  // keep our canonical id
    rec.status = "complete";
    rec.completedAt = new Date().toISOString();
  } catch (err) {
    rec.status = "failed";
    rec.completedAt = new Date().toISOString();
    rec.errorMessage = err instanceof Error ? err.message : String(err);
  }
}

export function listAudits(
  uid: string,
  input: { limit?: number; cursor?: string } = {},
): { audits: AuditRecord[]; nextCursor: string | null } {
  const all = store.get(uid) ?? [];
  const limit = Math.min(input.limit ?? 20, 100);
  const startIdx = input.cursor ? all.findIndex((a) => a.id === input.cursor) + 1 : 0;
  const page = all.slice(startIdx, startIdx + limit);
  const nextCursor = startIdx + limit < all.length ? page[page.length - 1]?.id ?? null : null;
  return { audits: page, nextCursor };
}

export function getAudit(
  uid: string,
  input: { auditId: string },
): AuditRecord | { error: "not_found" } {
  const rec = (store.get(uid) ?? []).find((a) => a.id === input.auditId);
  return rec ?? { error: "not_found" };
}

export function getFinding(
  uid: string,
  input: { findingId: string },
): { finding: AuditReport["findings"][number]; auditId: string } | { error: "not_found" } {
  for (const rec of store.get(uid) ?? []) {
    if (!rec.report) continue;
    const f = rec.report.findings.find((x) => x.id === input.findingId);
    if (f) return { finding: f, auditId: rec.id };
  }
  return { error: "not_found" };
}

function push(uid: string, rec: AuditRecord): void {
  const list = store.get(uid) ?? [];
  list.unshift(rec);
  if (list.length > MAX_PER_USER) list.length = MAX_PER_USER;
  store.set(uid, list);
}

// Test-only: clear store between tests
export function _resetForTests(): void {
  store.clear();
}
```

### Why mutation over immutability

Status transitions happen from a detached promise — using a `Map` of mutable records means callers don't see stale snapshots. The boundary is the module: nothing outside `audit-store.ts` mutates records, and only `getAudit` / `listAudits` are read paths.

## GitHub token snapshot store

`src/lib/gh-token-store.ts`:

```ts
import "server-only";

const tokens = new Map<string, string>();

export function setGithubToken(uid: string, token: string): void {
  tokens.set(uid, token);
}

export function getGithubToken(uid: string): string | undefined {
  return tokens.get(uid);
}

export function clearGithubToken(uid: string): void {
  tokens.delete(uid);
}

export function _resetForTests(): void {
  tokens.clear();
}
```

### Token-snapshot lifecycle

| Event | Action |
|---|---|
| `POST /api/mcp/token` (mint) | `setGithubToken(session.login, session.githubToken)` after token mint succeeds |
| `DELETE /api/mcp/token` (revoke) | `clearGithubToken(session.login)` |
| `POST /api/auth/github/logout` | `clearGithubToken(session.login)` — keeps token store consistent with session |
| Process restart | Map is empty; user must re-mint MCP token to restore source-check capability. Modal copy already covers this. |

### Security note

The snapshotted token is a real GitHub OAuth access token sitting in process memory. Two implications:
1. **Anyone with a valid MCP bearer for this `uid`** can trigger repo audits using the snapshotted token. Equivalent to the existing iron-session model (anyone with the cookie can use the token), but the threat surface is wider because MCP bearers live in user-controlled config files.
2. **If the user revokes on GitHub but doesn't disconnect on seokun**, the stale token in our store will return 401 from GitHub. `audit()` already handles this gracefully (catches and emits empty source findings).

## MCP server wiring

`src/lib/mcp-server.ts` becomes uid-aware (it already accepts a `uid` in `createMcpServer({ uid })` — we stop ignoring it):

```ts
import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AuditInputSchema } from "@/lib/audit/schema";
import {
  getAudit,
  getFinding,
  listAudits,
  runAudit,
} from "./audit-store";

export function createMcpServer(ctx: { uid: string }): McpServer {
  const server = new McpServer({ name: "seokun", version: "0.2.0" });

  server.registerTool(
    "list_audits",
    {
      description: "List the user's recent audits",
      inputSchema: AuditListInputShape,
    },
    async (input) => textResult(listAudits(ctx.uid, input)),
  );

  server.registerTool(
    "get_audit",
    {
      description: "Get details for one audit by id",
      inputSchema: { auditId: z.string().min(1) },
    },
    async (input) => textResult(getAudit(ctx.uid, input)),
  );

  server.registerTool(
    "get_finding",
    {
      description: "Get one finding by id with source mapping",
      inputSchema: { findingId: z.string().min(1) },
    },
    async (input) => textResult(getFinding(ctx.uid, input)),
  );

  server.registerTool(
    "run_audit",
    {
      description: "Queue an audit (URL, repo, or both). Poll with get_audit.",
      // Defined inline because the SDK expects a record of zod schemas, and
      // AuditInputSchema is wrapped in .refine() so `.shape` isn't available.
      // The handler re-parses with AuditInputSchema to enforce the "url or repo
      // is required" refinement.
      inputSchema: {
        url: z.string().url().optional(),
        formFactor: z.enum(["mobile", "desktop"]).optional(),
        repo: z.object({ owner: z.string().min(1), name: z.string().min(1) }).optional(),
      },
    },
    async (input) => {
      const parsed = AuditInputSchema.safeParse(input);
      if (!parsed.success) {
        return textResult({ error: "validation_error", issues: parsed.error.issues });
      }
      return textResult(await runAudit(ctx.uid, parsed.data));
    },
  );

  return server;
}

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}
```

### `run_audit` input — broadened from prior spec

Prior spec said `{ url: string }`. We broaden to the full `AuditInputSchema`:

```ts
{
  url?: string;                                  // valid URL
  formFactor?: "mobile" | "desktop";             // defaults to "mobile" server-side
  repo?: { owner: string; name: string };        // requires snapshotted GH token
  // Schema-level refine: at least one of url or repo must be set
}
```

This unlocks the headline use case: "Claude, audit the repo I just connected" — runs source checks only, no URL needed. Aligns with how `/api/audit` already validates input.

### Errors via MCP

- Input validation: handled by the SDK from the zod input schema (`-32602`).
- Missing/invalid token: 401 from `/api/mcp/route.ts` (already implemented).
- `run_audit` with `repo` set but no snapshotted token: audit completes with `status: "failed"` and `errorMessage: "no_github_token_for_uid"`. We don't fail the `run_audit` call itself — Claude gets an `auditId` to poll, and the failure surfaces in `get_audit`. This is intentional: same shape for transient failures and "you need to re-mint" failures, Claude can communicate either to the user.

## `/api/audit` server-side persistence

After a successful audit, also persist server-side so the user's Claude can read it.

```ts
// at the end of POST /api/audit, after audit() returns:
const report = await audit({ url: input.url, repo: input.repo, formFactor: input.formFactor, githubToken });

const session = await getSession();
if (session) {
  recordAudit(session.login, input, report);  // best-effort; non-fatal if uid changes
}

return Response.json(report);
```

Audits run anonymously (no session) still work for URL-only audits — they just don't get persisted to the server store. The dashboard's localStorage path is unaffected.

## Test strategy

### Phase A
- Already covered: `source-checks-extra.test.ts` (untracked) covers the new checks. Confirm `npm test` continues to pass after commit.

### Phase B unit tests
- `gh-token-store.test.ts` — set / get / clear / reset; isolation between uids.
- `audit-store.test.ts` (rewrite) —
  - `runAudit` returns `queued` immediately
  - background promise transitions to `complete` and `report` is populated (mock `@/lib/audit` to return a fixed report fast)
  - `runAudit` with `repo` but no GH token transitions to `failed` with `no_github_token_for_uid`
  - `listAudits` returns the uid's records, oldest-last; respects `limit`; cursor pagination works
  - `getAudit` cross-uid returns `not_found`
  - `getFinding` returns the matching finding from any complete audit owned by uid; cross-uid returns `not_found`

### Phase B integration tests
- `mcp-server.test.ts` (extend existing) — each tool exercised end-to-end against a real `createMcpServer({ uid: "octocat" })`, with `@/lib/audit` mocked.
- `app/api/mcp/token/route.test.ts` (extend) — mint calls `setGithubToken`; revoke calls `clearGithubToken`.
- `app/api/audit/route.test.ts` (new) — successful POST persists via `recordAudit`; anonymous POST does not.

### Mocking boundary

- `@modelcontextprotocol/sdk` real
- `@/lib/audit` (the orchestrator) mocked in audit-store tests — too slow + network-heavy
- `iron-session` mocked the same way as existing session tests

### Manual smoke

1. `npm run dev`; connect GitHub on the web; pick a repo.
2. Run a URL+repo audit from the web UI → confirm dashboard works.
3. Open Connect Claude modal; mint a token; paste into Claude Desktop config; restart.
4. Ask Claude `list_audits` → should return the audit from step 2.
5. Ask Claude `get_audit <id>` → full report.
6. Ask Claude `run_audit { repo: { owner, name } }` → returns `queued`, poll with `get_audit` until `complete`, confirm source findings are present.
7. Click Disconnect on Claude modal → ask Claude `list_audits` again → still works (token still valid; we don't revoke). Ask `run_audit` with repo → audit fails with `no_github_token_for_uid` (token store cleared).

## Setup checklist

No new environment variables. No new dependencies. Phase A reuses existing tests; Phase B reuses existing `iron-session` mock pattern.

## Open questions

None — all decisions locked.
