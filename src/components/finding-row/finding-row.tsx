"use client";

import type { Finding } from "@/lib/audit/schema";
import { CategoryChip } from "../category-chip/category-chip";
import { CopyButton } from "../copy-button/copy-button";
import { IconChevronRight, IconFile } from "../icons/icons";
import { SeverityBadge } from "../severity-badge/severity-badge";
import styles from "./finding-row.module.scss";

type Props = {
	finding: Finding;
	open: boolean;
	onToggle: () => void;
};

function isFilePathRef(element: string | undefined): boolean {
	if (!element) return false;
	return /^[\w./[\]@-]+:\d+$/.test(element);
}

export function FindingRow({ finding, open, onToggle }: Props) {
	const filePathRef = isFilePathRef(finding.element);

	return (
		<div
			className={[
				styles["finding-row"],
				open ? styles["finding-row--open"] : "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<button
				type="button"
				onClick={onToggle}
				className={styles["finding-row__head"]}
			>
				<SeverityBadge severity={finding.severity} />
				<CategoryChip category={finding.category} />
				<div className={styles["finding-row__title"]}>
					<span className={styles["finding-row__t"]}>{finding.title}</span>
					{finding.element && (
						<span className={styles["finding-row__snippet"]}>
							{filePathRef && (
								<IconFile size={11} style={{ opacity: 0.7 }} />
							)}
							{finding.element}
						</span>
					)}
				</div>
				<IconChevronRight
					size={16}
					stroke={2}
					className={styles["finding-row__chev"]}
				/>
			</button>

			{open && (
				<div className={styles["finding-row__body"]}>
					<div className={styles["finding-row__body-section"]}>
						<h4 className={styles["finding-row__body-label"]}>Recommendation</h4>
						<p>{finding.recommendation}</p>
					</div>
					{finding.fixHint && (
						<div className={styles["finding-row__body-section"]}>
							<h4 className={styles["finding-row__body-label"]}>Suggested fix</h4>
							<div className={styles["finding-row__fix"]}>
								<div className={styles["finding-row__fix-bar"]}>
									<span className={styles["finding-row__fix-name"]}>
										fix snippet
									</span>
									<CopyButton text={finding.fixHint} />
								</div>
								<pre className={styles["finding-row__fix-code"]}>
									{finding.fixHint}
								</pre>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
