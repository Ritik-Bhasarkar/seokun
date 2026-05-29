"use client";

import { IconChevronRight } from "../icons/icons";
import type { RecentAudit } from "@/lib/types";
import styles from "./recent-audits.module.scss";

type Props = {
	items: RecentAudit[];
	onSelect: (url: string) => void;
};

function scoreColor(score: number) {
	if (score < 50) return "var(--red)";
	if (score < 80) return "var(--amber)";
	return "var(--green)";
}

export function RecentAudits({ items, onSelect }: Props) {
	if (items.length === 0) return null;

	return (
		<div className={styles["recent-audits"]}>
			<h3 className={styles["recent-audits__heading"]}>Recent audits</h3>
			<div className={styles["recent-audits__list"]}>
				{items.map((item) => (
					<button
						key={item.url}
						type="button"
						className={styles["recent-audits__row"]}
						onClick={() => onSelect(item.url)}
					>
						<span className={styles["recent-audits__url"]}>{item.url}</span>
						<span
							className={styles["recent-audits__score"]}
							style={{ color: scoreColor(item.score) }}
						>
							{item.score}
						</span>
						<span className={styles["recent-audits__time"]}>{item.time}</span>
						<IconChevronRight size={14} style={{ color: "var(--fg-dim)" }} />
					</button>
				))}
			</div>
		</div>
	);
}
