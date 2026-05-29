import type { Category, Finding, Metric, Scores } from "./schema";

// Loosely typed shape — Lighthouse's full LHR types are heavy.
type Audit = {
	id: string;
	title?: string;
	description?: string;
	score: number | null;
	displayValue?: string;
};

type CategoryRef = {
	id: string;
	title?: string;
	score: number | null;
	auditRefs?: Array<{ id: string }>;
};

export type Lhr = {
	categories: Record<string, CategoryRef>;
	audits: Record<string, Audit>;
};

const CATEGORY_MAP: Record<string, Category> = {
	seo: "seo",
	performance: "perf",
	accessibility: "a11y",
	"best-practices": "best-practices",
};

// Lighthouse audit ids for the metrics shown in PageSpeed Insights' top panel.
const METRIC_IDS: Array<{ id: string; title: string }> = [
	{ id: "first-contentful-paint", title: "First Contentful Paint" },
	{ id: "largest-contentful-paint", title: "Largest Contentful Paint" },
	{ id: "total-blocking-time", title: "Total Blocking Time" },
	{ id: "cumulative-layout-shift", title: "Cumulative Layout Shift" },
	{ id: "speed-index", title: "Speed Index" },
	{ id: "interactive", title: "Time to Interactive" },
];

function stripHtml(s: string): string {
	return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function pct(score: number | null | undefined): number {
	return Math.round(((score ?? 0) as number) * 100);
}

export function mapLhrToScores(lhr: Lhr): Scores {
	return {
		seo: pct(lhr.categories.seo?.score),
		performance: pct(lhr.categories.performance?.score),
		accessibility: pct(lhr.categories.accessibility?.score),
		bestPractices: pct(lhr.categories["best-practices"]?.score),
	};
}

export function mapLhrToMetrics(lhr: Lhr): Metric[] {
	const out: Metric[] = [];
	for (const { id, title } of METRIC_IDS) {
		const audit = lhr.audits[id];
		if (!audit) continue;
		out.push({
			id,
			title,
			displayValue: audit.displayValue ?? "—",
			score: audit.score === null ? null : pct(audit.score),
		});
	}
	return out;
}

export function mapLhrToFindings(lhr: Lhr): Finding[] {
	const findings: Finding[] = [];
	for (const [catKey, cat] of Object.entries(lhr.categories)) {
		const category = CATEGORY_MAP[catKey];
		if (!category) continue;

		for (const ref of cat.auditRefs ?? []) {
			const audit = lhr.audits[ref.id];
			if (!audit) continue;
			if (audit.score === null) continue;
			if (audit.score >= 0.9) continue;
			// Skip the headline metrics — they get their own panel
			if (METRIC_IDS.some((m) => m.id === audit.id)) continue;

			const severity = audit.score < 0.5 ? "critical" : "warning";
			const description = stripHtml(audit.description ?? "");
			findings.push({
				id: `lighthouse.${category}.${audit.id}`,
				severity,
				category,
				title: audit.title ?? audit.id,
				recommendation:
					description || "See the Lighthouse docs for remediation guidance.",
				fixHint: audit.displayValue,
			});
		}
	}
	return findings;
}
