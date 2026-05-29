"use client";

import { useEffect, useState } from "react";
import { AuditLoader } from "../audit-loader/audit-loader";
import { Footer } from "../footer/footer";
import { ClaudeModal } from "../claude-modal/claude-modal";
import { GithubModal } from "../github-modal/github-modal";
import { IconGithub } from "../icons/icons";
import { RecentAudits } from "../recent-audits/recent-audits";
import { TopNav } from "../top-nav/top-nav";
import { UrlInput } from "../url-input/url-input";
import { RECENT_AUDITS } from "@/lib/mock-data";
import type { ClaudeConnection, Repo } from "@/lib/types";
import styles from "./home-screen.module.scss";

const STEPS = [
	"Resolving DNS & fetching HTML…",
	"Running Lighthouse audit…",
	"Scanning a11y & SEO heuristics…",
	"Indexing findings for MCP…",
];

const REPO_STORAGE_KEY = "seokun:repo";
const CLAUDE_STORAGE_KEY = "seokun:claude";

export function HomeScreen() {
	const [url, setUrl] = useState("");
	const [loading, setLoading] = useState(false);
	const [stepIdx, setStepIdx] = useState(0);
	const [repo, setRepo] = useState<Repo | null>(null);
	const [ghOpen, setGhOpen] = useState(false);
	const [claudeOpen, setClaudeOpen] = useState(false);
	const [claudeConn, setClaudeConn] = useState<ClaudeConnection | null>(null);

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(REPO_STORAGE_KEY);
			// Rehydrating persisted state from localStorage on mount — localStorage is the external system.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			if (raw) setRepo(JSON.parse(raw) as Repo);
		} catch {
			// ignore — invalid stored repo state
		}
	}, []);

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(CLAUDE_STORAGE_KEY);
			// Rehydrating persisted Claude connection from localStorage.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			if (raw) setClaudeConn(JSON.parse(raw) as ClaudeConnection);
		} catch {
			// ignore — invalid stored claude state
		}
	}, []);

	useEffect(() => {
		try {
			if (claudeConn) {
				window.localStorage.setItem(
					CLAUDE_STORAGE_KEY,
					JSON.stringify(claudeConn),
				);
			} else {
				window.localStorage.removeItem(CLAUDE_STORAGE_KEY);
			}
		} catch {
			// ignore — storage may be unavailable
		}
	}, [claudeConn]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const params = new URLSearchParams(window.location.search);
		const gh = params.get("gh");
		if (!gh) return;

		if (gh === "connected") {
			// Opening modal in response to OAuth callback redirect
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setGhOpen(true);
		} else if (gh === "error") {
			const reason = params.get("reason");
			const messages: Record<string, string> = {
				denied: "GitHub authorization was cancelled.",
				state: "Authorization state mismatch. Please try again.",
				exchange: "Couldn't exchange the GitHub code. Please try again.",
				scope: "Required scope (repo) was not granted.",
			};
			window.alert(messages[reason ?? ""] ?? "GitHub authorization failed.");
		}

		const url = new URL(window.location.href);
		url.searchParams.delete("gh");
		url.searchParams.delete("reason");
		window.history.replaceState({}, "", url.toString());
	}, []);

	useEffect(() => {
		try {
			if (repo) {
				window.localStorage.setItem(REPO_STORAGE_KEY, JSON.stringify(repo));
			} else {
				window.localStorage.removeItem(REPO_STORAGE_KEY);
			}
		} catch {
			// ignore — storage may be unavailable
		}
	}, [repo]);

	const runAudit = () => {
		if (loading || !url.trim()) return;
		setLoading(true);
		setStepIdx(0);

		let i = 0;
		const tick = () => {
			i += 1;
			if (i < STEPS.length) {
				setStepIdx(i);
				window.setTimeout(tick, 650);
			} else {
				window.setTimeout(() => {
					setLoading(false);
					setStepIdx(0);
				}, 500);
			}
		};
		window.setTimeout(tick, 650);
	};

	return (
		<div className={styles["home-screen"]}>
			<TopNav
				repo={repo}
				onConnectRepo={() => setGhOpen(true)}
				onConnectClaude={() => setClaudeOpen(true)}
			/>

			<main className={styles["home-screen__page"]}>
				<section className={styles["home-screen__hero"]}>
					<div className={styles["home-screen__eyebrow"]}>
						<span className={styles["home-screen__eyebrow-dot"]} />
						MCP server now in public beta
					</div>

					<h1 className={styles["home-screen__h1"]}>
						Lighthouse findings{" "}
						<em className={styles["home-screen__h1-em"]}>your AI can actually fix.</em>
					</h1>

					<p className={styles["home-screen__sub"]}>
						Paste a URL. seokun runs the audit, structures the findings, and exposes
						them to your coding agent — so the fixes land in code, not in a tab.
					</p>

					<UrlInput
						value={url}
						onChange={setUrl}
						onSubmit={runAudit}
						loading={loading}
						autoFocus
					/>

					<div className={styles["home-screen__hint"]}>
						{repo ? (
							<>
								<span
									className={styles["home-screen__hint-dot"]}
									style={{ background: "var(--green)" }}
								/>
								<span>Repo connected:</span>
								<span className={styles["home-screen__hint-mono"]}>
									{repo.owner}/{repo.name}
								</span>
								<span className={styles["home-screen__hint-sep"]}>·</span>
								<span>findings will map to source</span>
							</>
						) : (
							<>
								<span>Try a deployed v0 / Lovable / Bolt site</span>
								<span className={styles["home-screen__kbd"]}>⏎</span>
								<span>to run</span>
								<span className={styles["home-screen__hint-sep"]}>·</span>
								<button
									type="button"
									className={styles["home-screen__hint-link"]}
									onClick={() => setGhOpen(true)}
								>
									<IconGithub size={11} />
									connect a repo for code-level fixes
								</button>
							</>
						)}
					</div>

					{loading && <AuditLoader steps={STEPS} currentStep={stepIdx} />}
				</section>

				{!loading && <RecentAudits items={RECENT_AUDITS} onSelect={setUrl} />}
			</main>

			<Footer />

			<GithubModal
				open={ghOpen}
				repo={repo}
				initialStep={ghOpen && !repo ? "list" : undefined}
				onClose={() => setGhOpen(false)}
				onConfirm={(r) => {
					setRepo(r);
					setGhOpen(false);
				}}
				onDisconnect={() => {
					setRepo(null);
					setGhOpen(false);
				}}
			/>

			<ClaudeModal
				open={claudeOpen}
				connection={claudeConn}
				hasGithubSession={repo !== null}
				onClose={() => setClaudeOpen(false)}
				onConnect={(conn) => {
					setClaudeConn(conn);
				}}
				onDisconnect={() => setClaudeConn(null)}
				onGoConnectGithub={() => {
					setClaudeOpen(false);
					setGhOpen(true);
				}}
			/>
		</div>
	);
}
