import { z } from "zod";

export const SeveritySchema = z.enum(["critical", "warning", "info"]);
export const CategorySchema = z.enum(["seo", "a11y", "perf"]);

export const FindingSchema = z.object({
	id: z.string().min(1),
	severity: SeveritySchema,
	category: CategorySchema,
	title: z.string().min(1),
	element: z.string().optional(),
	recommendation: z.string().min(1),
	fixHint: z.string().optional(),
});

export const ScoresSchema = z.object({
	seo: z.number().min(0).max(100),
	performance: z.number().min(0).max(100),
	accessibility: z.number().min(0).max(100),
});

export const AuditReportSchema = z.object({
	id: z.string().min(1),
	url: z.string().url(),
	auditedAt: z.string().datetime(),
	scores: ScoresSchema,
	findings: z.array(FindingSchema),
});

export const AuditInputSchema = z.object({
	url: z.string().url(),
	repo: z
		.object({
			owner: z.string().min(1),
			name: z.string().min(1),
		})
		.optional(),
});

export type Severity = z.infer<typeof SeveritySchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Scores = z.infer<typeof ScoresSchema>;
export type AuditReport = z.infer<typeof AuditReportSchema>;
export type AuditInput = z.infer<typeof AuditInputSchema>;
