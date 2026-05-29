"use client";

import { Button } from "../button/button";
import { IconBranch, IconClaude, IconGithub } from "../icons/icons";
import type { Repo } from "@/lib/types";
import styles from "./top-nav.module.scss";

type Props = {
	repo: Repo | null;
	onConnectRepo: () => void;
	onConnectClaude: () => void;
};

export function TopNav({ repo, onConnectRepo, onConnectClaude }: Props) {
	return (
		<header className={styles["top-nav"]}>
			<div className={styles["top-nav__inner"]}>
				<div className={styles["top-nav__wordmark"]}>
					<div className={styles["top-nav__glyph"]}>s</div>
					<span className={styles["top-nav__name"]}>seokun</span>
				</div>

				<nav className={styles["top-nav__right"]}>
					{repo ? (
						<button
							type="button"
							className={styles["top-nav__repo-chip"]}
							onClick={onConnectRepo}
							title="Manage repo connection"
						>
							<span className={styles["top-nav__repo-dot"]} />
							<IconGithub size={13} />
							<span className={styles["top-nav__repo-name"]}>
								{repo.owner}/{repo.name}
							</span>
							<span className={styles["top-nav__repo-branch"]}>
								<IconBranch size={11} stroke={1.8} />
								{repo.branch}
							</span>
						</button>
					) : (
						<Button
							variant="nav"
							leftIcon={<IconGithub size={14} />}
							onClick={onConnectRepo}
						>
							Connect repo
						</Button>
					)}

					<Button
						variant="nav"
						leftIcon={<IconClaude size={14} />}
						onClick={onConnectClaude}
					>
						Connect Claude
					</Button>
				</nav>
			</div>
		</header>
	);
}
