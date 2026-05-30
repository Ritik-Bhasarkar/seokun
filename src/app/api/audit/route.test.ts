import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auditMock, getSession, recordAudit } = vi.hoisted(() => ({
  auditMock: vi.fn(),
  getSession: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ audit: auditMock }));
vi.mock("@/lib/session", () => ({ getSession }));
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
