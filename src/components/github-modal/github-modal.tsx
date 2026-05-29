"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../button/button";
import {
	IconArrowRight,
	IconArrowUpRight,
	IconBranch,
	IconCheck,
	IconGithub,
	IconLock,
	IconSearch,
	IconX,
} from "../icons/icons";
import type { Repo, RepoListItem } from "@/lib/types";
import styles from "./github-modal.module.scss";

type Step = "auth" | "list" | "confirm" | "manage";

type Props = {
	open: boolean;
	repo: Repo | null;
	initialStep?: Step;
	onClose: () => void;
	onConfirm: (repo: Repo) => void;
	onDisconnect: () => void;
};

export function GithubModal({
	open,
	repo,
	initialStep,
	onClose,
	onConfirm,
	onDisconnect,
}: Props) {
	const [step, setStep] = useState<Step>(initialStep ?? (repo ? "manage" : "auth"));
	const [selected, setSelected] = useState<RepoListItem | null>(null);
	const [branch, setBranch] = useState<string>(repo?.branch ?? "main");
	const [query, setQuery] = useState("");

	const [repos, setRepos] = useState<RepoListItem[] | null>(null);
	const [reposError, setReposError] = useState<string | null>(null);
	const [branches, setBranches] = useState<string[] | null>(null);
	const [branchesError, setBranchesError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setStep(initialStep ?? (repo ? "manage" : "auth"));
		setSelected(null);
		setBranch(repo?.branch ?? "main");
		setQuery("");
		setRepos(null);
		setReposError(null);
		setBranches(null);
		setBranchesError(null);
	}, [open, repo, initialStep]);

	const loadRepos = useCallback(async () => {
		setRepos(null);
		setReposError(null);
		const res = await fetch("/api/github/repos");
		if (res.status === 401) {
			setStep("auth");
			return;
		}
		if (!res.ok) {
			setReposError("Couldn't load repositories. Try again.");
			return;
		}
		const json = (await res.json()) as { repos: RepoListItem[] };
		setRepos(json.repos);
	}, []);

	useEffect(() => {
		if (open && step === "list" && repos === null && reposError === null) {
			void loadRepos();
		}
	}, [open, step, repos, reposError, loadRepos]);

	useEffect(() => {
		if (!open || step !== "confirm" || !selected) return;
		setBranches(null);
		setBranchesError(null);
		void (async () => {
			const res = await fetch(
				`/api/github/repos/${encodeURIComponent(selected.owner)}/${encodeURIComponent(selected.name)}/branches`,
			);
			if (!res.ok) {
				setBranchesError("Couldn't load branches.");
				return;
			}
			const json = (await res.json()) as { branches: string[] };
			setBranches(json.branches);
			if (!json.branches.includes(branch)) {
				setBranch(json.branches[0] ?? "main");
			}
		})();
	}, [open, step, selected, branch]);

	if (!open) return null;

	const startAuth = () => {
		window.location.href = "/api/auth/github/start";
	};

	const filtered = (repos ?? []).filter((r) =>
		`${r.owner}/${r.name}`.toLowerCase().includes(query.toLowerCase()),
	);

	const submitConfirm = () => {
		if (!selected) return;
		onConfirm({
			owner: selected.owner,
			name: selected.name,
			branch,
			pushedAt: selected.pushedAt,
			branches: branches ?? [branch],
		});
	};

	const disconnect = async () => {
		await fetch("/api/auth/github/logout", { method: "POST" });
		onDisconnect();
	};

	const branchList = repo?.branches ?? branches ?? ["main"];

	return (
		<div
			className={styles["github-modal__overlay"]}
			onClick={onClose}
			role="presentation"
		>
			<div
				className={styles["github-modal"]}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Connect GitHub"
			>
				<div className={styles["github-modal__head"]}>
					<div className={styles["github-modal__head-l"]}>
						<IconGithub size={16} />
						<span>
							{step === "manage" ? "Connected repository" : "Connect GitHub"}
						</span>
					</div>
					<button
						type="button"
						className={styles["github-modal__close"]}
						onClick={onClose}
						aria-label="Close"
					>
						<IconX size={14} stroke={2} />
					</button>
				</div>

				{step === "auth" && (
					<div className={styles["github-modal__body"]}>
						<div className={styles["github-modal__illus"]}>
							<IconGithub size={42} />
						</div>
						<h2 className={styles["github-modal__title"]}>Connect your repository</h2>
						<p className={styles["github-modal__p"]}>
							seokun reads your source code to map every finding to a file, a line,
							and a ready-to-apply diff. Read-only access by default.
						</p>
						<ul className={styles["github-modal__perms"]}>
							<li>
								<IconCheck size={13} stroke={2.2} /> Read code &amp; metadata
							</li>
							<li>
								<IconCheck size={13} stroke={2.2} /> Read pull requests
							</li>
							<li>
								<IconCheck size={13} stroke={2.2} /> Open PRs (only when you ask)
							</li>
						</ul>
						<Button
							variant="primary"
							className={styles["github-modal__cta"]}
							onClick={startAuth}
							leftIcon={<IconGithub size={14} />}
							rightIcon={<IconArrowUpRight size={12} stroke={2.2} />}
						>
							Authorize on GitHub
						</Button>
						<div className={styles["github-modal__note"]}>
							Tokens are scoped per-repo and revocable from your GitHub settings.
						</div>
					</div>
				)}

				{step === "list" && (
					<div
						className={`${styles["github-modal__body"]} ${styles["github-modal__body--list"]}`}
					>
						<h2 className={styles["github-modal__title"]}>Pick a repository</h2>
						<p className={styles["github-modal__p"]}>
							Choose the repo backing the site you&apos;re auditing.
						</p>
						<div className={styles["github-modal__search"]}>
							<IconSearch size={13} />
							<input
								className={styles["github-modal__search-input"]}
								placeholder="Filter repositories…"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								autoFocus
							/>
						</div>
						<div className={styles["github-modal__list"]}>
							{reposError && (
								<div className={styles["github-modal__p"]}>{reposError}</div>
							)}
							{!reposError && repos === null && (
								<div className={styles["github-modal__p"]}>Loading…</div>
							)}
							{filtered.map((r) => {
								const isSel = selected?.name === r.name && selected?.owner === r.owner;
								return (
									<button
										key={`${r.owner}/${r.name}`}
										type="button"
										className={[
											styles["github-modal__row"],
											isSel ? styles["github-modal__row--active"] : "",
										]
											.filter(Boolean)
											.join(" ")}
										onClick={() => setSelected(r)}
									>
										<div className={styles["github-modal__avatar"]}>
											{r.owner[0].toUpperCase()}
										</div>
										<div className={styles["github-modal__row-main"]}>
											<div className={styles["github-modal__row-name"]}>
												{r.owner}/
												<span className={styles["github-modal__row-repo"]}>
													{r.name}
												</span>
												{r.private && (
													<IconLock
														size={11}
														style={{ color: "var(--fg-dim)", marginLeft: 6 }}
													/>
												)}
											</div>
											<div className={styles["github-modal__row-meta"]}>
												<span className={styles["github-modal__lang"]}>
													<span className={styles["github-modal__lang-dot"]} />{" "}
													{r.lang || "—"}
												</span>
												<span>·</span>
												<span>Pushed {r.pushedAt}</span>
											</div>
										</div>
										{isSel && (
											<IconCheck
												size={14}
												stroke={2.4}
												style={{ color: "var(--accent)" }}
											/>
										)}
									</button>
								);
							})}
						</div>
						<div className={styles["github-modal__foot"]}>
							<Button variant="ghost" size="sm" onClick={onClose}>
								Cancel
							</Button>
							<Button
								variant="primary"
								size="sm"
								disabled={!selected}
								onClick={() => setStep("confirm")}
								rightIcon={<IconArrowRight size={12} stroke={2.2} />}
							>
								Continue
							</Button>
						</div>
					</div>
				)}

				{step === "confirm" && selected && (
					<div className={styles["github-modal__body"]}>
						<h2 className={styles["github-modal__title"]}>Confirm connection</h2>
						<p className={styles["github-modal__p"]}>
							seokun will index this repo and map findings to source files.
						</p>
						<div className={styles["github-modal__card"]}>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Repository</span>
								<span className={styles["github-modal__card-r-mono"]}>
									{selected.owner}/{selected.name}
								</span>
							</div>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Branch</span>
								<div className={styles["github-modal__branches"]}>
									{branchesError && <span>{branchesError}</span>}
									{!branchesError && branches === null && <span>Loading…</span>}
									{(branches ?? []).map((b) => (
										<button
											key={b}
											type="button"
											className={[
												styles["github-modal__branch"],
												branch === b ? styles["github-modal__branch--active"] : "",
											]
												.filter(Boolean)
												.join(" ")}
											onClick={() => setBranch(b)}
										>
											<IconBranch size={11} stroke={1.8} />
											{b}
										</button>
									))}
								</div>
							</div>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Access</span>
								<span className={styles["github-modal__card-r"]}>
									Read code + Open PRs
								</span>
							</div>
						</div>
						<div className={styles["github-modal__foot"]}>
							<Button variant="ghost" size="sm" onClick={() => setStep("list")}>
								← Back
							</Button>
							<Button
								variant="primary"
								size="sm"
								disabled={branches === null}
								onClick={submitConfirm}
								leftIcon={<IconCheck size={13} stroke={2.4} />}
							>
								Connect repository
							</Button>
						</div>
					</div>
				)}

				{step === "manage" && repo && (
					<div className={styles["github-modal__body"]}>
						<h2 className={styles["github-modal__title"]}>Connected to GitHub</h2>
						<p className={styles["github-modal__p"]}>
							Findings are mapped to source. You can switch branches or disconnect.
						</p>
						<div className={styles["github-modal__card"]}>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Repository</span>
								<span className={styles["github-modal__card-r-mono"]}>
									{repo.owner}/{repo.name}
								</span>
							</div>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Branch</span>
								<div className={styles["github-modal__branches"]}>
									{branchList.map((b) => (
										<button
											key={b}
											type="button"
											className={[
												styles["github-modal__branch"],
												branch === b ? styles["github-modal__branch--active"] : "",
											]
												.filter(Boolean)
												.join(" ")}
											onClick={() => {
												setBranch(b);
												onConfirm({ ...repo, branch: b });
											}}
										>
											<IconBranch size={11} stroke={1.8} />
											{b}
										</button>
									))}
								</div>
							</div>
						</div>
						<div className={styles["github-modal__foot"]}>
							<Button variant="ghost" size="sm" onClick={disconnect}>
								Disconnect
							</Button>
							<Button size="sm" onClick={() => setStep("list")}>
								Change repo
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
