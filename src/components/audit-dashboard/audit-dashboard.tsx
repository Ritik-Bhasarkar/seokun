"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
	AuditReport,
	Category,
	FormFactor,
	Severity,
} from "@/lib/audit/schema";
import { formatRelative, loadReport, saveReport } from "@/lib/audit-storage";
import { Button } from "../button/button";
import { CopyButton } from "../copy-button/copy-button";
import { FindingRow } from "../finding-row/finding-row";
import {
	IconChevronRight,
	IconClock,
	IconRefresh,
} from "../icons/icons";
import { ScoreGauge } from "../score-gauge/score-gauge";
import styles from "./audit-dashboard.module.scss";

const SEVERITY_ORDER: Record<Severity, number> = {
	critical: 0,
	warning: 1,
	info: 2,
};

const CATEGORY_ORDER: Array<{ id: Category; name: string; score: keyof AuditReport["scores"] }> = [
	{ id: "perf", name: "Performance", score: "performance" },
	{ id: "a11y", name: "Accessibility", score: "accessibility" },
	{ id: "best-practices", name: "Best Practices", score: "bestPractices" },
	{ id: "seo", name: "SEO", score: "seo" },
];

function scoreBand(value: number): "good" | "warn" | "bad" {
	if (value < 50) return "bad";
	if (value < 90) return "warn";
	return "good";
}

function metricBand(score: number | null): "good" | "warn" | "bad" | "unknown" {
	if (score === null) return "unknown";
	if (score < 50) return "bad";
	if (score < 90) return "warn";
	return "good";
}

type Props = { id: string };

export function AuditDashboard({ id }: Props) {
	const router = useRouter();
	const [report, setReport] = useState<AuditReport | null>(null);
	const [hydrated, setHydrated] = useState(false);
	const [openId, setOpenId] = useState<string | null>(null);
	const [switching, setSwitching] = useState<FormFactor | null>(null);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setReport(loadReport(id));
		setHydrated(true);
	}, [id]);

	const groupedByCategory = useMemo(() => {
		const g: Record<Category, AuditReport["findings"]> = {
			perf: [],
			a11y: [],
			"best-practices": [],
			seo: [],
		};
		if (!report) return g;
		for (const f of report.findings) g[f.category].push(f);
		for (const cat of Object.keys(g) as Category[]) {
			g[cat].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
		}
		return g;
	}, [report]);

	useEffect(() => {
		if (report && !openId && report.findings.length > 0) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setOpenId(report.findings[0].id);
		}
	}, [report, openId]);

	const switchFormFactor = async (target: FormFactor) => {
		if (!report || switching || target === report.formFactor) return;
		setSwitching(target);
		try {
			const res = await fetch("/api/audit", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: report.url, formFactor: target }),
			});
			if (!res.ok) throw new Error("audit failed");
			const next = (await res.json()) as AuditReport;
			saveReport(next);
			router.replace(`/audit/${next.id}`);
		} catch {
			window.alert("Couldn't re-run for that form factor. Try again.");
		} finally {
			setSwitching(null);
		}
	};

	const reRun = () => {
		if (!report) return;
		const stripped = report.url.replace(/^https?:\/\//, "");
		router.push(
			`/?url=${encodeURIComponent(stripped)}&formFactor=${report.formFactor}`,
		);
	};

	if (!hydrated) return null;

	if (!report) {
		return (
			<main className={styles["audit-dashboard"]}>
				<div className={styles["audit-dashboard__not-found"]}>
					<h1>Audit not found</h1>
					<p>
						We couldn&apos;t find an audit with id <code>{id}</code> in this
						browser. Audit reports are stored locally — open this page in the
						browser where you ran the audit, or run a new one.
					</p>
					<Button variant="primary" onClick={() => router.push("/")}>
						← Run a new audit
					</Button>
				</div>
			</main>
		);
	}

	const json = JSON.stringify(report, null, 2);
	const totalIssues = report.findings.length;
	const counts: Record<Category, number> = {
		perf: groupedByCategory.perf.length,
		a11y: groupedByCategory.a11y.length,
		"best-practices": groupedByCategory["best-practices"].length,
		seo: groupedByCategory.seo.length,
	};

	return (
		<main className={styles["audit-dashboard"]}>
			<div className={styles["audit-dashboard__header"]}>
				<div>
					<div className={styles["audit-dashboard__crumb"]}>
						<button type="button" onClick={() => router.push("/")}>
							Audit
						</button>
						<IconChevronRight size={12} stroke={2} />
						<span className={styles["audit-dashboard__url"]}>{report.url}</span>
					</div>
					<div className={styles["audit-dashboard__meta"]}>
						<IconClock size={12} />
						Audited {formatRelative(report.auditedAt)}
						<span className={styles["audit-dashboard__meta-sep"]}>·</span>
						<span className={styles["audit-dashboard__ff-badge"]}>
							{report.formFactor}
						</span>
						<span className={styles["audit-dashboard__meta-sep"]}>·</span>
						<span>{totalIssues} findings</span>
					</div>
				</div>
				<div className={styles["audit-dashboard__actions"]}>
					<CopyButton text={json} label="Copy JSON" />
					<Button size="sm" onClick={reRun} leftIcon={<IconRefresh size={13} />}>
						Re-run
					</Button>
				</div>
			</div>

			<div className={styles["audit-dashboard__ff-tabs"]}>
				{(["mobile", "desktop"] as const).map((ff) => {
					const active = report.formFactor === ff;
					const isLoading = switching === ff;
					return (
						<button
							key={ff}
							type="button"
							disabled={switching !== null || active}
							onClick={() => switchFormFactor(ff)}
							className={[
								styles["audit-dashboard__ff-tab"],
								active ? styles["audit-dashboard__ff-tab--active"] : "",
							]
								.filter(Boolean)
								.join(" ")}
						>
							{isLoading ? "Running…" : ff === "mobile" ? "Mobile" : "Desktop"}
						</button>
					);
				})}
			</div>

			<div className={styles["audit-dashboard__score-row"]}>
				{CATEGORY_ORDER.map((c) => {
					const value = report.scores[c.score];
					return (
						<div key={c.id} className={styles["audit-dashboard__score-card"]}>
							<ScoreGauge value={value} size={72} />
							<div className={styles["audit-dashboard__score-info"]}>
								<div className={styles["audit-dashboard__score-name"]}>
									{c.name}
								</div>
								<div className={styles["audit-dashboard__score-issues"]}>
									{counts[c.id]}{" "}
									{counts[c.id] === 1 ? "issue" : "issues"}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{CATEGORY_ORDER.map((c) => {
				const value = report.scores[c.score];
				const items = groupedByCategory[c.id];
				const showMetrics =
					c.id === "perf" && (report.metrics?.length ?? 0) > 0;
				return (
					<section key={c.id} className={styles["audit-dashboard__category"]}>
						<div className={styles["audit-dashboard__category-h"]}>
							<div className={styles["audit-dashboard__category-l"]}>
								<h2>{c.name}</h2>
								<span className={styles["audit-dashboard__category-score"]}>
									{value} / 100 · {scoreBand(value)}
								</span>
							</div>
							<span className={styles["audit-dashboard__category-count"]}>
								{items.length}{" "}
								{items.length === 1 ? "finding" : "findings"}
							</span>
						</div>

						{showMetrics && (
							<>
								<div className={styles["audit-dashboard__metrics-h"]}>
									Metrics
								</div>
								<div className={styles["audit-dashboard__metrics"]}>
									{report.metrics.map((m) => (
										<div
											key={m.id}
											className={styles["audit-dashboard__metric-card"]}
											data-score={metricBand(m.score)}
										>
											<div className={styles["audit-dashboard__metric-title"]}>
												{m.title}
											</div>
											<div className={styles["audit-dashboard__metric-value"]}>
												{m.displayValue}
											</div>
										</div>
									))}
								</div>
							</>
						)}

						{items.length === 0 ? (
							<div className={styles["audit-dashboard__empty"]}>
								No findings — looks clean.
							</div>
						) : (
							<div className={styles["audit-dashboard__findings"]}>
								{items.map((f) => (
									<FindingRow
										key={f.id}
										finding={f}
										open={openId === f.id}
										onToggle={() => setOpenId(openId === f.id ? null : f.id)}
									/>
								))}
							</div>
						)}
					</section>
				);
			})}
		</main>
	);
}
