import "server-only";
import { randomUUID } from "node:crypto";
import { runRuntime } from "./runtime";
import {
	type AuditInput,
	type AuditReport,
	AuditReportSchema,
} from "./schema";
import { runSourceChecks } from "./source";

export type AuditOptions = AuditInput & {
	githubToken?: string;
};

export async function audit(options: AuditOptions): Promise<AuditReport> {
	const { url, repo, githubToken } = options;
	const formFactor = options.formFactor ?? "mobile";

	const runtime = await runRuntime(url, formFactor);

	let sourceFindings: AuditReport["findings"] = [];
	if (repo && githubToken) {
		try {
			sourceFindings = await runSourceChecks({
				githubToken,
				owner: repo.owner,
				repo: repo.name,
			});
		} catch (err) {
			console.error("[audit] source checks orchestrator failed", err);
		}
	}

	const report: AuditReport = {
		id: randomUUID(),
		url,
		auditedAt: new Date().toISOString(),
		formFactor,
		scores: runtime.scores,
		metrics: runtime.metrics,
		findings: [...runtime.findings, ...sourceFindings],
	};

	// Validate before returning — catches drift in finding schemas
	return AuditReportSchema.parse(report);
}

export { AuditReportSchema, AuditInputSchema, FindingSchema } from "./schema";
export type {
	AuditReport,
	AuditInput,
	Finding,
	Scores,
	Severity,
	Category,
	FormFactor,
	Metric,
} from "./schema";
