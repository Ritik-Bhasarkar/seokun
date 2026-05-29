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
