import { z } from "zod";

export const SeveritySchema = z.enum(["critical", "warning", "info"]);
export const CategorySchema = z.enum([
	"seo",
	"a11y",
	"perf",
	"best-practices",
]);
export const FormFactorSchema = z.enum(["mobile", "desktop"]);

export const FindingSchema = z.object({
	id: z.string().min(1),
	severity: SeveritySchema,
	category: CategorySchema,
	title: z.string().min(1),
	element: z.string().optional(),
	recommendation: z.string().min(1),
	fixHint: z.string().optional(),
});

// Scores are nullable per category — a source-only audit has no Lighthouse
// to compute perf/a11y/best-practices/seo scores, so each is allowed to be null
// and the dashboard renders "—".
export const ScoresSchema = z.object({
	seo: z.number().min(0).max(100).nullable(),
	performance: z.number().min(0).max(100).nullable(),
	accessibility: z.number().min(0).max(100).nullable(),
	bestPractices: z.number().min(0).max(100).nullable(),
});

export const MetricSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	displayValue: z.string(),
	score: z.number().min(0).max(100).nullable(),
});

// formFactor is optional on the report — for repo-only audits there's no
// browser emulation. URL audits always include it.
export const AuditReportSchema = z.object({
	id: z.string().min(1),
	url: z.string().url().nullable(),
	auditedAt: z.string().datetime(),
	formFactor: FormFactorSchema.optional(),
	scores: ScoresSchema,
	metrics: z.array(MetricSchema),
	findings: z.array(FindingSchema),
});

export const AuditInputSchema = z
	.object({
		url: z.string().url().optional(),
		formFactor: FormFactorSchema.optional(),
		repo: z
			.object({
				owner: z.string().min(1),
				name: z.string().min(1),
			})
			.optional(),
	})
	.refine((v) => Boolean(v.url) || Boolean(v.repo), {
		message: "Either url or repo is required",
		path: ["url"],
	});

export type Severity = z.infer<typeof SeveritySchema>;
export type Category = z.infer<typeof CategorySchema>;
export type FormFactor = z.infer<typeof FormFactorSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Scores = z.infer<typeof ScoresSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type AuditReport = z.infer<typeof AuditReportSchema>;
export type AuditInput = z.infer<typeof AuditInputSchema>;
