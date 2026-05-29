"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { Button } from "../button/button";
import { IconArrowRight } from "../icons/icons";
import styles from "./url-input.module.scss";

type Props = {
	value: string;
	onChange: (next: string) => void;
	onSubmit: () => void;
	loading: boolean;
	autoFocus?: boolean;
	error?: boolean;
};

export function UrlInput({
	value,
	onChange,
	onSubmit,
	loading,
	autoFocus,
	error,
}: Props) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (autoFocus) {
			inputRef.current?.focus();
		}
	}, [autoFocus]);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!value.trim() || loading) return;
		onSubmit();
	};

	const disabled = !value.trim() || loading;

	return (
		<form
			className={[
				styles["url-input"],
				error ? styles["url-input--error"] : "",
			]
				.filter(Boolean)
				.join(" ")}
			onSubmit={handleSubmit}
		>
			<span className={styles["url-input__prefix"]}>https://</span>
			<input
				ref={inputRef}
				className={styles["url-input__field"]}
				type="text"
				placeholder="your-site.com"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={loading}
				spellCheck={false}
				autoComplete="off"
				aria-label="URL to audit"
				aria-invalid={error || undefined}
			/>
			<Button
				type="submit"
				variant="primary"
				disabled={disabled}
				rightIcon={!loading ? <IconArrowRight size={14} stroke={2.2} /> : undefined}
			>
				{loading ? "Auditing…" : "Run audit"}
			</Button>
		</form>
	);
}
