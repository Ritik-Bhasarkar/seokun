"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "../icons/icons";
import styles from "./copy-button.module.scss";

type Props = {
	text: string;
	label?: string;
};

export function CopyButton({ text, label = "Copy" }: Props) {
	const [copied, setCopied] = useState(false);

	const copy = (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			void navigator.clipboard?.writeText(text);
		} catch {
			// ignore — older browsers, sandboxed iframes
		}
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	};

	return (
		<button
			type="button"
			onClick={copy}
			className={[
				styles["copy-button"],
				copied ? styles["copy-button--copied"] : "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			{copied ? <IconCheck size={12} stroke={2.2} /> : <IconCopy size={12} />}
			{copied ? "Copied" : label}
		</button>
	);
}
