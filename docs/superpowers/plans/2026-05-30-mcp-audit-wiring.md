# MCP ↔ Audit Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalize the six new source checks (Phase A), then wire the four MCP tools to the real audit pipeline with per-uid scoping and a server-side audit store + GitHub-token snapshot (Phase B).

**Architecture:** In-memory `Map<uid, AuditRecord[]>` in `src/lib/audit-store.ts` replaces the 4 stub functions. A second `Map<uid, string>` in `src/lib/gh-token-store.ts` snapshots the user's GitHub OAuth token at MCP-token mint time so detached `run_audit` runs can perform source checks without a session cookie. `/api/audit` mirrors web-UI audits into the same store keyed by `session.login`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, `@modelcontextprotocol/sdk` (already installed), `zod`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-mcp-audit-wiring-design.md`

---

## File map

```
Phase A — already in tree, just stage + commit:
  Modified:
    src/lib/audit-storage.ts
    src/lib/audit/index.ts
    src/lib/audit/schema.ts
    src/lib/audit/source/index.ts
    src/lib/audit/source/sync-heavy-imports.ts          (traverse import dropped earlier this session)
    src/components/audit-dashboard/audit-dashboard.tsx
  New (untracked):
    src/lib/audit/source/div-as-button.ts
    src/lib/audit/source/heading-hierarchy.ts
    src/lib/audit/source/icon-button-label.ts
    src/lib/audit/source/input-without-label.ts
    src/lib/audit/source/sync-heavy-imports.ts
    src/lib/audit/source/target-blank-rel.ts
    src/lib/audit/source/source-checks-extra.test.ts

Phase B — Task-by-task:
  Create:
    src/lib/gh-token-store.ts
    src/lib/gh-token-store.test.ts
  Modify (rewrite):
    src/lib/audit-store.ts
    src/lib/audit-store.test.ts
    src/lib/mcp-server.ts
    src/lib/mcp-server.test.ts                          (extend, don't replace)
    src/app/api/mcp/token/route.ts
    src/app/api/audit/route.ts
```

---

## Important Next.js 16 + project notes

- `cookies()` from `next/headers` is **async** in Next 16. Existing `getSession()` already awaits — no changes here.
- `iron-session` is mocked in tests via `vi.mock("./env", ...)` and a `Map` cookie store — see `src/lib/session.test.ts` for the canonical pattern.
- The vitest config maps `@/...` → `src/...` and only picks up files matching `src/**/*.test.ts` — colocate tests next to the file under test.
- Don't add `Co-Authored-By` or "Generated with Claude Code" trailers to commit messages (project memory).

---

### Task A1: Commit Phase A — six source checks + cleanup

**Files:**
- Stage: all entries from the Phase A file map above (already in working tree)

- [ ] **Step 1: Verify everything is clean**

Run in parallel:
```bash
npm test
npm run lint
npx tsc --noEmit
```
Expected:
- `npm test` — 95 tests, 16 files, all pass
- `npm run lint` — 0 errors, 6 warnings (all pre-existing-style underscore-prefixed unused params in `audit-store.ts` + `mcp-server.ts`, plus `src/components/home-screen/home-screen.tsx:88` unused eslint-disable directive — these get touched in Phase B / are out of scope)
- `npx tsc --noEmit` — exits 0 with no output

If any of those fail, STOP and surface the failure — Phase B depends on a green baseline.

- [ ] **Step 2: Stage the Phase A files**

```bash
git add \
  src/lib/audit-storage.ts \
  src/lib/audit/index.ts \
  src/lib/audit/schema.ts \
  src/lib/audit/source/index.ts \
  src/lib/audit/source/sync-heavy-imports.ts \
  src/lib/audit/source/div-as-button.ts \
  src/lib/audit/source/heading-hierarchy.ts \
  src/lib/audit/source/icon-button-label.ts \
  src/lib/audit/source/input-without-label.ts \
  src/lib/audit/source/target-blank-rel.ts \
  src/lib/audit/source/source-checks-extra.test.ts \
  src/components/audit-dashboard/audit-dashboard.tsx
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(audit): add six source checks (div-as-button, heading-hierarchy, icon-button-label, input-without-label, sync-heavy-imports, target-blank-rel)"
```

- [ ] **Step 4: Confirm the spec is already staged**

```bash
git status --short
```
Expected: `A  docs/superpowers/specs/2026-05-30-mcp-audit-wiring-design.md` plus nothing else.

- [ ] **Step 5: Commit the spec (and this plan, if also untracked)**

```bash
git add docs/superpowers/plans/2026-05-30-mcp-audit-wiring.md
git commit -m "docs(audit): add MCP ↔ audit wiring spec + plan"
```

---

### Task B1: GitHub-token snapshot store — TDD

**Files:**
- Create: `src/lib/gh-token-store.ts`
- Create: `src/lib/gh-token-store.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/gh-token-store.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  setGithubToken,
  getGithubToken,
  clearGithubToken,
  _resetForTests,
} from "./gh-token-store";

afterEach(() => {
  _resetForTests();
});

describe("gh-token-store", () => {
  it("returns undefined for an unknown uid", () => {
    expect(getGithubToken("nobody")).toBeUndefined();
  });

  it("round-trips a token", () => {
    setGithubToken("octocat", "ghp_abc");
    expect(getGithubToken("octocat")).toBe("ghp_abc");
  });

  it("overwrites on a second set", () => {
    setGithubToken("octocat", "ghp_old");
    setGithubToken("octocat", "ghp_new");
    expect(getGithubToken("octocat")).toBe("ghp_new");
  });

  it("isolates uids", () => {
    setGithubToken("a", "tok_a");
    setGithubToken("b", "tok_b");
    expect(getGithubToken("a")).toBe("tok_a");
    expect(getGithubToken("b")).toBe("tok_b");
  });

  it("clearGithubToken removes only the target uid", () => {
    setGithubToken("a", "tok_a");
    setGithubToken("b", "tok_b");
    clearGithubToken("a");
    expect(getGithubToken("a")).toBeUndefined();
    expect(getGithubToken("b")).toBe("tok_b");
  });

  it("_resetForTests clears everything", () => {
    setGithubToken("a", "tok_a");
    _resetForTests();
    expect(getGithubToken("a")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npm test -- src/lib/gh-token-store.test.ts
```
Expected: FAIL — `Cannot find module './gh-token-store'`.

- [ ] **Step 3: Implement `src/lib/gh-token-store.ts`**

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

- [ ] **Step 4: Run test, expect pass**

```bash
npm test -- src/lib/gh-token-store.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gh-token-store.ts src/lib/gh-token-store.test.ts
git commit -m "feat(mcp): add gh-token-store for per-uid GitHub token snapshots"
```

---

### Task B2: Real `audit-store` — TDD (replaces stub)

**Files:**
- Modify (rewrite): `src/lib/audit-store.ts`
- Modify (rewrite): `src/lib/audit-store.test.ts`

- [ ] **Step 1: Rewrite the test (replace the stub-era assertions)**

`src/lib/audit-store.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: auditMock }));

const getGithubToken = vi.fn();
vi.mock("./gh-token-store", () => ({ getGithubToken }));

import type { AuditReport } from "./audit/schema";
import {
  listAudits,
  getAudit,
  getFinding,
  runAudit,
  recordAudit,
  _resetForTests,
} from "./audit-store";

function fakeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    id: "report-id",
    url: "https://example.com",
    auditedAt: new Date().toISOString(),
    formFactor: "mobile",
    scores: { seo: 90, performance: 80, accessibility: 95, bestPractices: 85 },
    metrics: [],
    findings: [
      {
        id: "finding-1",
        severity: "warning",
        category: "perf",
        title: "Heavy import",
        recommendation: "Use dynamic import",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  _resetForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  _resetForTests();
});

describe("recordAudit", () => {
  it("stores a complete record keyed by uid", () => {
    const report = fakeReport();
    recordAudit("octocat", { url: report.url ?? undefined }, report);
    const result = listAudits("octocat");
    expect(result.audits).toHaveLength(1);
    expect(result.audits[0].status).toBe("complete");
    expect(result.audits[0].report?.id).toBe(report.id);
  });

  it("scopes records to the owning uid", () => {
    recordAudit("a", { url: "https://a.test" }, fakeReport({ id: "ra" }));
    recordAudit("b", { url: "https://b.test" }, fakeReport({ id: "rb" }));
    expect(listAudits("a").audits).toHaveLength(1);
    expect(listAudits("b").audits).toHaveLength(1);
    expect(listAudits("a").audits[0].id).toBe("ra");
  });
});

describe("runAudit", () => {
  it("returns queued immediately and transitions to complete in the background", async () => {
    auditMock.mockResolvedValueOnce(fakeReport({ id: "from-audit" }));

    const { auditId, status } = await runAudit("octocat", { url: "https://example.com" });
    expect(status).toBe("queued");

    // Yield to the microtask queue twice: once for runAudit's then(), once for executeAudit.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const rec = getAudit("octocat", { auditId });
    if ("error" in rec) throw new Error("audit not stored");
    expect(rec.status).toBe("complete");
    expect(rec.report?.id).toBe(auditId);  // store's id wins, not audit()'s id
  });

  it("marks audit failed with no_github_token_for_uid when repo input has no snapshot", async () => {
    getGithubToken.mockReturnValueOnce(undefined);

    const { auditId } = await runAudit("octocat", { repo: { owner: "a", name: "b" } });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const rec = getAudit("octocat", { auditId });
    if ("error" in rec) throw new Error("audit not stored");
    expect(rec.status).toBe("failed");
    expect(rec.errorMessage).toBe("no_github_token_for_uid");
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("passes the snapshotted token into audit() when repo is set", async () => {
    getGithubToken.mockReturnValueOnce("ghp_snapshotted");
    auditMock.mockResolvedValueOnce(fakeReport({ id: "with-repo" }));

    await runAudit("octocat", { repo: { owner: "a", name: "b" } });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: { owner: "a", name: "b" },
        githubToken: "ghp_snapshotted",
      }),
    );
  });

  it("marks audit failed when audit() throws", async () => {
    auditMock.mockRejectedValueOnce(new Error("boom"));

    const { auditId } = await runAudit("octocat", { url: "https://example.com" });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const rec = getAudit("octocat", { auditId });
    if ("error" in rec) throw new Error("audit not stored");
    expect(rec.status).toBe("failed");
    expect(rec.errorMessage).toBe("boom");
  });
});

describe("listAudits", () => {
  it("returns empty + null cursor for an unknown uid", () => {
    expect(listAudits("nobody")).toEqual({ audits: [], nextCursor: null });
  });

  it("respects limit and paginates via cursor", () => {
    for (let i = 0; i < 5; i++) {
      recordAudit("u", { url: `https://e${i}.test` }, fakeReport({ id: `r${i}` }));
    }
    // Records are unshifted, so newest-first: r4, r3, r2, r1, r0
    const page1 = listAudits("u", { limit: 2 });
    expect(page1.audits.map((a) => a.id)).toEqual(["r4", "r3"]);
    expect(page1.nextCursor).toBe("r3");

    const page2 = listAudits("u", { limit: 2, cursor: "r3" });
    expect(page2.audits.map((a) => a.id)).toEqual(["r2", "r1"]);
    expect(page2.nextCursor).toBe("r1");

    const page3 = listAudits("u", { limit: 2, cursor: "r1" });
    expect(page3.audits.map((a) => a.id)).toEqual(["r0"]);
    expect(page3.nextCursor).toBeNull();
  });
});

describe("getAudit", () => {
  it("returns not_found for an unknown id", () => {
    expect(getAudit("u", { auditId: "missing" })).toEqual({ error: "not_found" });
  });

  it("returns not_found when the audit belongs to a different uid", () => {
    recordAudit("owner", { url: "https://x.test" }, fakeReport({ id: "shared-id" }));
    expect(getAudit("other", { auditId: "shared-id" })).toEqual({ error: "not_found" });
  });
});

describe("getFinding", () => {
  it("returns the finding when it exists in a uid's complete audit", () => {
    recordAudit("u", { url: "https://x.test" }, fakeReport({ id: "r1" }));
    const result = getFinding("u", { findingId: "finding-1" });
    if ("error" in result) throw new Error("expected a finding");
    expect(result.auditId).toBe("r1");
    expect(result.finding.title).toBe("Heavy import");
  });

  it("returns not_found across uids", () => {
    recordAudit("owner", { url: "https://x.test" }, fakeReport({ id: "r1" }));
    expect(getFinding("other", { findingId: "finding-1" })).toEqual({ error: "not_found" });
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npm test -- src/lib/audit-store.test.ts
```
Expected: FAIL — the old stub exports don't match the new test (missing `recordAudit`, `_resetForTests`, sync signatures, etc.).

- [ ] **Step 3: Replace `src/lib/audit-store.ts`**

Full file contents:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";
import type { AuditInput, AuditReport, Finding } from "@/lib/audit/schema";
import { getGithubToken } from "./gh-token-store";

export type AuditStatus = "queued" | "running" | "complete" | "failed";

export type AuditRecord = {
  uid: string;
  id: string;
  status: AuditStatus;
  startedAt: string;
  completedAt: string | null;
  input: AuditInput;
  report: AuditReport | null;
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
    rec.report = { ...report, id: rec.id };
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
  const cursorIdx = input.cursor
    ? all.findIndex((a) => a.id === input.cursor)
    : -1;
  const startIdx = cursorIdx >= 0 ? cursorIdx + 1 : 0;
  const page = all.slice(startIdx, startIdx + limit);
  const last = page[page.length - 1];
  const nextCursor =
    last && startIdx + limit < all.length ? last.id : null;
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
): { finding: Finding; auditId: string } | { error: "not_found" } {
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

export function _resetForTests(): void {
  store.clear();
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
npm test -- src/lib/audit-store.test.ts
```
Expected: PASS (10 tests).

- [ ] **Step 5: Type-check (callers may break)**

```bash
npx tsc --noEmit
```
Expected: type errors only in `src/lib/mcp-server.ts` (it still calls the old async stubs with old signatures). Those are fixed in Task B3. If tsc reports errors anywhere else, stop and surface.

- [ ] **Step 6: Commit (test + impl together, the in-between state doesn't type-check)**

```bash
git add src/lib/audit-store.ts src/lib/audit-store.test.ts
git commit -m "feat(audit-store): replace stubs with real per-uid in-memory store"
```

---

### Task B3: Rewrite `mcp-server.ts` to use the new store + extend its test

**Files:**
- Modify (rewrite): `src/lib/mcp-server.ts`
- Modify (extend): `src/lib/mcp-server.test.ts`

- [ ] **Step 1: Rewrite `src/lib/mcp-server.test.ts`**

Full file contents (replaces the stub-era assertions; uses the real audit-store + a mocked `@/lib/audit`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: auditMock }));

const getGithubToken = vi.fn();
vi.mock("./gh-token-store", () => ({ getGithubToken }));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp-server";
import { _resetForTests, recordAudit } from "./audit-store";
import type { AuditReport } from "./audit/schema";

function fakeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    id: "report-id",
    url: "https://example.com",
    auditedAt: new Date().toISOString(),
    formFactor: "mobile",
    scores: { seo: 90, performance: 80, accessibility: 95, bestPractices: 85 },
    metrics: [],
    findings: [
      {
        id: "f-1",
        severity: "warning",
        category: "perf",
        title: "Heavy import",
        recommendation: "Use dynamic import",
      },
    ],
    ...overrides,
  };
}

let client: Client;

async function connectAs(uid: string): Promise<void> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ uid });
  await server.connect(serverTransport);
  client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
}

function textPayload(res: { content: unknown }): unknown {
  const arr = res.content as Array<{ type: string; text: string }>;
  return JSON.parse(arr[0].text);
}

beforeEach(async () => {
  _resetForTests();
  vi.clearAllMocks();
  await connectAs("octocat");
});

afterEach(() => {
  _resetForTests();
});

describe("MCP server tool surface", () => {
  it("lists the 4 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_audit", "get_finding", "list_audits", "run_audit"]);
  });
});

describe("list_audits", () => {
  it("returns an empty list when the uid has no audits", async () => {
    const res = await client.callTool({ name: "list_audits", arguments: {} });
    expect(textPayload(res)).toEqual({ audits: [], nextCursor: null });
  });

  it("returns the uid's audits with full record shape", async () => {
    recordAudit("octocat", { url: "https://example.com" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({ name: "list_audits", arguments: {} });
    const payload = textPayload(res) as { audits: Array<{ id: string; status: string }> };
    expect(payload.audits).toHaveLength(1);
    expect(payload.audits[0].id).toBe("r1");
    expect(payload.audits[0].status).toBe("complete");
  });

  it("does not leak another uid's audits", async () => {
    recordAudit("someone-else", { url: "https://x.test" }, fakeReport({ id: "other" }));
    const res = await client.callTool({ name: "list_audits", arguments: {} });
    expect(textPayload(res)).toEqual({ audits: [], nextCursor: null });
  });
});

describe("get_audit", () => {
  it("returns the audit when owned by this uid", async () => {
    recordAudit("octocat", { url: "https://example.com" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({
      name: "get_audit",
      arguments: { auditId: "r1" },
    });
    const payload = textPayload(res) as { id: string; status: string };
    expect(payload.id).toBe("r1");
  });

  it("returns not_found for another uid's audit", async () => {
    recordAudit("someone-else", { url: "https://x.test" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({
      name: "get_audit",
      arguments: { auditId: "r1" },
    });
    expect(textPayload(res)).toEqual({ error: "not_found" });
  });
});

describe("get_finding", () => {
  it("returns the finding when owned by this uid", async () => {
    recordAudit("octocat", { url: "https://example.com" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({
      name: "get_finding",
      arguments: { findingId: "f-1" },
    });
    const payload = textPayload(res) as { auditId: string; finding: { id: string } };
    expect(payload.auditId).toBe("r1");
    expect(payload.finding.id).toBe("f-1");
  });

  it("returns not_found across uids", async () => {
    recordAudit("someone-else", { url: "https://x.test" }, fakeReport({ id: "r1" }));
    const res = await client.callTool({
      name: "get_finding",
      arguments: { findingId: "f-1" },
    });
    expect(textPayload(res)).toEqual({ error: "not_found" });
  });
});

describe("run_audit", () => {
  it("queues a URL audit and reports queued status", async () => {
    auditMock.mockResolvedValueOnce(fakeReport({ id: "queued-1" }));
    const res = await client.callTool({
      name: "run_audit",
      arguments: { url: "https://example.com" },
    });
    const payload = textPayload(res) as { status: string; auditId: string };
    expect(payload.status).toBe("queued");
    expect(payload.auditId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("returns validation_error when neither url nor repo is set", async () => {
    const res = await client.callTool({ name: "run_audit", arguments: {} });
    const payload = textPayload(res) as { error?: string };
    expect(payload.error).toBe("validation_error");
  });

  it("returns validation_error when url is not a valid URL", async () => {
    const res = await client.callTool({
      name: "run_audit",
      arguments: { url: "not-a-url" },
    });
    const payload = textPayload(res) as { error?: string };
    expect(payload.error).toBe("validation_error");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npm test -- src/lib/mcp-server.test.ts
```
Expected: FAIL — the existing `mcp-server.ts` still calls the stub signatures.

- [ ] **Step 3: Replace `src/lib/mcp-server.ts`**

Full file contents:

```ts
import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
      inputSchema: {
        limit: z.number().int().positive().max(100).optional(),
        cursor: z.string().optional(),
      },
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
      description:
        "Queue an audit (URL, repo, or both). Returns an auditId immediately; poll get_audit for status and findings.",
      // AuditInputSchema is wrapped in .refine() so .shape isn't directly
      // available — define the input shape here and re-validate in the handler.
      inputSchema: {
        url: z.string().url().optional(),
        formFactor: z.enum(["mobile", "desktop"]).optional(),
        repo: z
          .object({ owner: z.string().min(1), name: z.string().min(1) })
          .optional(),
      },
    },
    async (input) => {
      const parsed = AuditInputSchema.safeParse(input);
      if (!parsed.success) {
        return textResult({
          error: "validation_error",
          issues: parsed.error.issues,
        });
      }
      return textResult(await runAudit(ctx.uid, parsed.data));
    },
  );

  return server;
}

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
npm test -- src/lib/mcp-server.test.ts
```
Expected: PASS (10 tests).

- [ ] **Step 5: Full test sweep**

```bash
npm test
```
Expected: all tests pass — including the existing `src/app/api/mcp/route.test.ts` which doesn't exercise tools directly.

- [ ] **Step 6: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```
Expected: zero type errors. Lint may emit warnings — confirm only the pre-existing ones from Task A1 remain (the `_ctx` underscored param in `mcp-server.ts` is gone now, so that warning should drop).

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp-server.ts src/lib/mcp-server.test.ts
git commit -m "feat(mcp): wire 4 tools to real audit store with per-uid scoping"
```

---

### Task B4: Wire `/api/mcp/token` mint/revoke to `gh-token-store`

**Files:**
- Modify: `src/app/api/mcp/token/route.ts`

(No dedicated test file exists for this route today. We add one.)

- [ ] **Step 1: Create the failing test**

Create `src/app/api/mcp/token/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession }));

const mintMcpToken = vi.fn();
vi.mock("@/lib/mcp-token", () => ({ mintMcpToken }));

const setGithubToken = vi.fn();
const clearGithubToken = vi.fn();
vi.mock("@/lib/gh-token-store", () => ({ setGithubToken, clearGithubToken }));

vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost:3000" },
}));

import { POST, DELETE } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/mcp/token", () => {
  it("returns 401 when no session", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(setGithubToken).not.toHaveBeenCalled();
  });

  it("mints a token and snapshots the GitHub token under the session uid", async () => {
    getSession.mockResolvedValueOnce({
      githubToken: "ghp_real",
      login: "octocat",
      avatarUrl: "",
      connectedAt: 0,
    });
    mintMcpToken.mockReturnValueOnce("mcp_token_value");

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      token: "mcp_token_value",
      mcpUrl: "http://localhost:3000/api/mcp",
    });
    expect(mintMcpToken).toHaveBeenCalledWith({ uid: "octocat" });
    expect(setGithubToken).toHaveBeenCalledWith("octocat", "ghp_real");
  });
});

describe("DELETE /api/mcp/token", () => {
  it("returns 204 and clears the snapshotted token when a session exists", async () => {
    getSession.mockResolvedValueOnce({
      githubToken: "ghp_real",
      login: "octocat",
      avatarUrl: "",
      connectedAt: 0,
    });
    const res = await DELETE();
    expect(res.status).toBe(204);
    expect(clearGithubToken).toHaveBeenCalledWith("octocat");
  });

  it("returns 204 even without a session and does not call clearGithubToken", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await DELETE();
    expect(res.status).toBe(204);
    expect(clearGithubToken).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npm test -- src/app/api/mcp/token/route.test.ts
```
Expected: FAIL — the current route doesn't call `setGithubToken` / `clearGithubToken`.

- [ ] **Step 3: Replace `src/app/api/mcp/token/route.ts`**

Full file contents:

```ts
import { env } from "@/lib/env";
import { clearGithubToken, setGithubToken } from "@/lib/gh-token-store";
import { mintMcpToken } from "@/lib/mcp-token";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "session_required" }, { status: 401 });
  }
  const token = mintMcpToken({ uid: session.login });
  setGithubToken(session.login, session.githubToken);
  const mcpUrl = new URL("/api/mcp", env.APP_URL).toString();
  return Response.json({ token, mcpUrl });
}

export async function DELETE() {
  const session = await getSession();
  if (session) {
    clearGithubToken(session.login);
  }
  // v1: bearer tokens themselves are stateless. Clearing the snapshotted GH
  // token disables repo source-check audits for this uid until the user
  // re-mints, but URL audits continue to work.
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
npm test -- src/app/api/mcp/token/route.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Full test sweep**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mcp/token/route.ts src/app/api/mcp/token/route.test.ts
git commit -m "feat(mcp): snapshot/clear GitHub token on mcp token mint/revoke"
```

---

### Task B5: Wire `/api/audit` to persist into the server store

**Files:**
- Modify: `src/app/api/audit/route.ts`
- Create: `src/app/api/audit/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/audit/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: auditMock }));

const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession }));

const recordAudit = vi.fn();
vi.mock("@/lib/audit-store", () => ({ recordAudit }));

import { POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sampleReport = {
  id: "report-id",
  url: "https://example.com",
  auditedAt: new Date().toISOString(),
  formFactor: "mobile" as const,
  scores: { seo: 90, performance: 80, accessibility: 95, bestPractices: 85 },
  metrics: [],
  findings: [],
};

beforeEach(() => vi.clearAllMocks());

describe("POST /api/audit", () => {
  it("returns 400 on invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on validation error", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it("runs a URL audit without a session and does not call recordAudit", async () => {
    getSession.mockResolvedValueOnce(null);
    auditMock.mockResolvedValueOnce(sampleReport);

    const res = await POST(postReq({ url: "https://example.com" }));
    expect(res.status).toBe(200);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("persists URL audit to the store when a session exists", async () => {
    getSession.mockResolvedValueOnce({
      githubToken: "ghp_x",
      login: "octocat",
      avatarUrl: "",
      connectedAt: 0,
    });
    auditMock.mockResolvedValueOnce(sampleReport);

    const res = await POST(postReq({ url: "https://example.com" }));
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      "octocat",
      expect.objectContaining({ url: "https://example.com" }),
      sampleReport,
    );
  });

  it("requires a session for repo audits (unchanged behavior)", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await POST(
      postReq({ url: "https://example.com", repo: { owner: "a", name: "b" } }),
    );
    expect(res.status).toBe(401);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npm test -- src/app/api/audit/route.test.ts
```
Expected: FAIL on the "persists URL audit" test — current route doesn't call `recordAudit`.

- [ ] **Step 3: Modify `src/app/api/audit/route.ts`**

Edit the file — add the import and the persistence call after a successful audit. Only the marked sections change; preserve everything else.

Find:

```ts
import { ZodError } from "zod";
import { audit } from "@/lib/audit";
import { UnreachableError } from "@/lib/audit/errors";
import { AuditInputSchema } from "@/lib/audit/schema";
import { getSession } from "@/lib/session";
```

Replace with:

```ts
import { ZodError } from "zod";
import { audit } from "@/lib/audit";
import { recordAudit } from "@/lib/audit-store";
import { UnreachableError } from "@/lib/audit/errors";
import { AuditInputSchema } from "@/lib/audit/schema";
import { getSession } from "@/lib/session";
```

The existing handler currently captures `session` only inside `if (input.repo)`. We need it for the post-audit persistence too. Refactor to hoist the session lookup:

Find:

```ts
	// Auth only required when a repo is involved — source checks need a token
	let githubToken: string | undefined;
	if (input.repo) {
		const session = await getSession();
		if (!session) {
			return Response.json(
				{ error: "session_required_for_source_checks" },
				{ status: 401 },
			);
		}
		githubToken = session.githubToken;
	}

	try {
		const report = await audit({
			url: input.url,
			repo: input.repo,
			formFactor: input.formFactor,
			githubToken,
		});
		return Response.json(report);
	} catch (err) {
```

Replace with:

```ts
	const session = await getSession();

	// Auth only required when a repo is involved — source checks need a token
	let githubToken: string | undefined;
	if (input.repo) {
		if (!session) {
			return Response.json(
				{ error: "session_required_for_source_checks" },
				{ status: 401 },
			);
		}
		githubToken = session.githubToken;
	}

	try {
		const report = await audit({
			url: input.url,
			repo: input.repo,
			formFactor: input.formFactor,
			githubToken,
		});
		if (session) {
			recordAudit(session.login, input, report);
		}
		return Response.json(report);
	} catch (err) {
```

- [ ] **Step 4: Run test, expect pass**

```bash
npm test -- src/app/api/audit/route.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/audit/route.ts src/app/api/audit/route.test.ts
git commit -m "feat(audit): persist web-UI audits into server store for MCP visibility"
```

---

### Task B6: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```
Expected: all tests pass. Expected new total: 95 (Phase A baseline) + 6 (gh-token-store) + 10 (audit-store rewrite, replaces 5 stub tests so +5 net) + 6 (mcp-server rewrite, replaces 5 stub tests so +5 net) + 4 (mcp token route) + 5 (audit route) = roughly **120 tests**. The exact number isn't critical — what matters is zero failures.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: zero errors. Warnings may include the pre-existing `home-screen.tsx:88` unused eslint-disable directive; the four `_input` warnings in `audit-store.ts` should be gone (we removed the stubs).

- [ ] **Step 4: Build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Manual smoke test**

In a separate terminal:
```bash
npm run dev
```

In a browser + Claude Desktop:
1. Open `http://localhost:3000` — connect GitHub (existing flow).
2. Pick a repo. Run a URL+repo audit from the web UI. Confirm the dashboard renders.
3. Open the Connect Claude modal → generate a token.
4. Paste the snippet into `~/Library/Application Support/Claude/claude_desktop_config.json` under `mcpServers.seokun`. Restart Claude Desktop.
5. In Claude, ask: "What tools do you have from seokun?" → should list 4.
6. Ask: "Run list_audits" → should return the audit from step 2 with status `complete`.
7. Ask: "Run get_audit <id-from-list>" → should return the full record including findings.
8. Ask: "Run run_audit { url: 'https://example.com' }" → returns an `auditId` + `queued`.
9. Wait ~30s, then ask: "Run get_audit <new-id>" → status should be `complete` with a real Lighthouse-derived report.
10. Ask: "Run run_audit { repo: { owner: '<your-login>', name: '<your-repo>' } }" → returns `queued`. Poll until `complete`. Findings should include the new source checks (e.g., `source.div-as-button.*`, `source.target-blank-rel.*`).
11. In the Connect Claude modal, click "Disconnect" → ask Claude `run_audit { repo: ... }` again → poll until `failed` with `errorMessage: "no_github_token_for_uid"`.

- [ ] **Step 6: Final commit if lint/format produced any incidental changes**

```bash
git status
# only commit if there are unexpected uncommitted changes
```

---

## Out of scope (deferred — do not implement)

- Persistence across process restarts (KV / Redis / Postgres backing for the audit & token stores)
- MCP token rotation / expiry (carried from prior MCP spec)
- A `revoke_token` / `apply_fix` MCP tool
- Streaming partial audit progress over MCP (Claude polls instead)
- Refreshing the snapshotted GitHub token (user must re-mint)
- Cross-instance coordination on Vercel (assume single-region single-instance MVP)
