import type { Category, Finding, Scores } from "./schema";

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
};

function stripHtml(s: string): string {
	return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function mapLhrToScores(lhr: Lhr): Scores {
	const score = (id: string) =>
		Math.round(((lhr.categories[id]?.score ?? 0) as number) * 100);
	return {
		seo: score("seo"),
		performance: score("performance"),
		accessibility: score("accessibility"),
	};
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

			const severity = audit.score < 0.5 ? "critical" : "warning";
			const description = stripHtml(audit.description ?? "");
			findings.push({
				id: `lighthouse.${category}.${audit.id}`,
				severity,
				category,
				title: audit.title ?? audit.id,
				recommendation: description || "See the Lighthouse docs for remediation guidance.",
				fixHint: audit.displayValue,
			});
		}
	}
	return findings;
}
