"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AuditReport, Severity } from "@/lib/audit/schema";
import { formatRelative, loadReport } from "@/lib/audit-storage";
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

type Filter = "all" | Severity;

const SEVERITY_ORDER: Severity[] = ["critical", "warning", "info"];

function deltaLabel(value: number): string {
	if (value < 50) return "needs work";
	if (value < 80) return "improve";
	return "good";
}

function severityDotColor(sev: Severity): string {
	if (sev === "critical") return "var(--red)";
	if (sev === "warning") return "var(--amber)";
	return "var(--accent)";
}

type Props = {
	id: string;
};

export function AuditDashboard({ id }: Props) {
	const router = useRouter();
	const [report, setReport] = useState<AuditReport | null>(null);
	const [hydrated, setHydrated] = useState(false);
	const [filter, setFilter] = useState<Filter>("all");
	const [openId, setOpenId] = useState<string | null>(null);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setReport(loadReport(id));
		setHydrated(true);
	}, [id]);

	const counts = useMemo(() => {
		const out = { all: 0, critical: 0, warning: 0, info: 0 };
		if (!report) return out;
		for (const f of report.findings) {
			out.all += 1;
			out[f.severity] += 1;
		}
		return out;
	}, [report]);

	const grouped = useMemo(() => {
		const g: Record<Severity, AuditReport["findings"]> = {
			critical: [],
			warning: [],
			info: [],
		};
		if (!report) return g;
		const items =
			filter === "all"
				? report.findings
				: report.findings.filter((f) => f.severity === filter);
		for (const f of items) g[f.severity].push(f);
		return g;
	}, [report, filter]);

	useEffect(() => {
		if (report && !openId && report.findings.length > 0) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setOpenId(report.findings[0].id);
		}
	}, [report, openId]);

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

	const totalIssues = report.findings.length;
	const scoreItems = [
		{
			key: "seo",
			short: "SEO",
			name: "SEO",
			value: report.scores.seo,
			count: report.findings.filter((f) => f.category === "seo").length,
		},
		{
			key: "performance",
			short: "Perf",
			name: "Performance",
			value: report.scores.performance,
			count: report.findings.filter((f) => f.category === "perf").length,
		},
		{
			key: "accessibility",
			short: "A11y",
			name: "Accessibility",
			value: report.scores.accessibility,
			count: report.findings.filter((f) => f.category === "a11y").length,
		},
	] as const;

	const json = JSON.stringify(report, null, 2);
	const reRun = () => {
		const stripped = report.url.replace(/^https?:\/\//, "");
		router.push(`/?url=${encodeURIComponent(stripped)}&run=1`);
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
						<span style={{ fontFamily: "var(--mono)" }}>{report.id.slice(0, 8)}</span>
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

			<div className={styles["audit-dashboard__score-row"]}>
				{scoreItems.map((s) => (
					<div key={s.key} className={styles["audit-dashboard__score-card"]}>
						<ScoreGauge value={s.value} />
						<div className={styles["audit-dashboard__score-info"]}>
							<div className={styles["audit-dashboard__score-label"]}>
								{s.short}
							</div>
							<div className={styles["audit-dashboard__score-name"]}>
								{s.name}
							</div>
							<div className={styles["audit-dashboard__score-issues"]}>
								<span>
									{s.count} {s.count === 1 ? "issue" : "issues"}
								</span>
								<span className={styles["audit-dashboard__score-delta"]}>
									{deltaLabel(s.value)}
								</span>
							</div>
						</div>
					</div>
				))}
			</div>

			<div className={styles["audit-dashboard__section-h"]}>
				<h2>Findings</h2>
				<span className={styles["audit-dashboard__section-count"]}>
					{filter === "all"
						? totalIssues
						: report.findings.filter((f) => f.severity === filter).length}{" "}
					of {totalIssues}
				</span>
			</div>

			<div className={styles["audit-dashboard__filter-row"]}>
				{(["all", "critical", "warning", "info"] as const).map((f) => (
					<button
						key={f}
						type="button"
						onClick={() => setFilter(f)}
						className={[
							styles["audit-dashboard__filter-chip"],
							filter === f ? styles["audit-dashboard__filter-chip--active"] : "",
						]
							.filter(Boolean)
							.join(" ")}
					>
						{f !== "all" && (
							<span
								className={styles["audit-dashboard__filter-dot"]}
								style={{ background: severityDotColor(f as Severity) }}
							/>
						)}
						<span>{f}</span>
						<span className={styles["audit-dashboard__filter-ct"]}>
							{counts[f]}
						</span>
					</button>
				))}
			</div>

			<div>
				{totalIssues === 0 ? (
					<div className={styles["audit-dashboard__empty"]}>
						No findings — looks clean.
					</div>
				) : (
					SEVERITY_ORDER.map((sev) => {
						const items = grouped[sev];
						if (items.length === 0) return null;
						return (
							<div key={sev} className={styles["audit-dashboard__group"]}>
								<div className={styles["audit-dashboard__group-h"]}>
									<span
										className={styles["audit-dashboard__group-dot"]}
										style={{ background: severityDotColor(sev) }}
									/>
									<h3>{sev}</h3>
									<span className={styles["audit-dashboard__group-ct"]}>
										{items.length}
									</span>
								</div>
								<div
									style={{ display: "flex", flexDirection: "column", gap: 8 }}
								>
									{items.map((f) => (
										<FindingRow
											key={f.id}
											finding={f}
											open={openId === f.id}
											onToggle={() =>
												setOpenId(openId === f.id ? null : f.id)
											}
										/>
									))}
								</div>
							</div>
						);
					})
				)}
			</div>
		</main>
	);
}
