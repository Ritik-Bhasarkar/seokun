import type { Severity } from "@/lib/audit/schema";
import styles from "./severity-badge.module.scss";

type Props = { severity: Severity };

export function SeverityBadge({ severity }: Props) {
	return (
		<span
			className={[styles["severity-badge"], styles[`severity-badge--${severity}`]].join(
				" ",
			)}
		>
			<span className={styles["severity-badge__dot"]} />
			{severity}
		</span>
	);
}
