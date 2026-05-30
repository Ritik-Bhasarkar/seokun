import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auditMock, getGithubToken } = vi.hoisted(() => ({
  auditMock: vi.fn(),
  getGithubToken: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: auditMock }));
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

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const rec = getAudit("octocat", { auditId });
    if ("error" in rec) throw new Error("audit not stored");
    expect(rec.status).toBe("complete");
    expect(rec.report?.id).toBe(auditId);
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
