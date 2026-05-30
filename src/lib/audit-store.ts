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
