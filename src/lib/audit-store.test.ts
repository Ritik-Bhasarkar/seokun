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
