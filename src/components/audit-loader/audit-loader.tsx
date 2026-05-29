"use client";

import { IconCheck } from "../icons/icons";
import styles from "./audit-loader.module.scss";

type Props = {
	steps: string[];
	currentStep: number;
};

export function AuditLoader({ steps, currentStep }: Props) {
	return (
		<div className={styles["audit-loader"]}>
			{steps.map((label, i) => {
				const state =
					i < currentStep ? "done" : i === currentStep ? "active" : "pending";
				return (
					<div
						key={label}
						className={[
							styles["audit-loader__line"],
							state === "done" ? styles["audit-loader__line--done"] : "",
						]
							.filter(Boolean)
							.join(" ")}
					>
						<div
							className={[
								styles["audit-loader__dot"],
								styles[`audit-loader__dot--${state}`],
							].join(" ")}
						>
							{state === "done" && <IconCheck size={9} stroke={3} />}
						</div>
						<span>{label}</span>
					</div>
				);
			})}
		</div>
	);
}
