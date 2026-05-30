import "server-only";
import { randomUUID } from "node:crypto";
import { runRuntime } from "./runtime";
import {
	type AuditInput,
	type AuditReport,
	AuditReportSchema,
	type Scores,
} from "./schema";
import { runSourceChecks } from "./source";

export type AuditOptions = AuditInput & {
	githubToken?: string;
};

const NULL_SCORES: Scores = {
	seo: null,
	performance: null,
	accessibility: null,
	bestPractices: null,
};

export async function audit(options: AuditOptions): Promise<AuditReport> {
	const { url, repo, githubToken } = options;

	let scores: Scores = NULL_SCORES;
	let metrics: AuditReport["metrics"] = [];
	let runtimeFindings: AuditReport["findings"] = [];
	let formFactor: AuditReport["formFactor"];

	if (url) {
		formFactor = options.formFactor ?? "mobile";
		const runtime = await runRuntime(url, formFactor);
		scores = runtime.scores;
		metrics = runtime.metrics;
		runtimeFindings = runtime.findings;
	}

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
		url: url ?? null,
		auditedAt: new Date().toISOString(),
		formFactor,
		scores,
		metrics,
		findings: [...runtimeFindings, ...sourceFindings],
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
