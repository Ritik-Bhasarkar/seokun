"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./button.module.scss";

type Variant = "primary" | "secondary" | "ghost" | "nav";
type Size = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: Variant;
	size?: Size;
	leftIcon?: ReactNode;
	rightIcon?: ReactNode;
	active?: boolean;
	children: ReactNode;
};

export function Button({
	variant = "secondary",
	size = "md",
	leftIcon,
	rightIcon,
	active = false,
	className,
	children,
	type = "button",
	...rest
}: Props) {
	const cls = [
		styles.button,
		styles[`button--${variant}`],
		styles[`button--${size}`],
		active ? styles["button--active"] : "",
		className ?? "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<button type={type} className={cls} {...rest}>
			{leftIcon}
			<span className={styles.button__label}>{children}</span>
			{rightIcon}
		</button>
	);
}
