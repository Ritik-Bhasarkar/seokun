import type { CSSProperties, ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "stroke" | "fill"> & {
	size?: number;
	stroke?: number;
	fill?: string;
	style?: CSSProperties;
};

function Icon({
	children,
	size = 16,
	stroke = 1.6,
	fill,
	...rest
}: IconProps & { children: ReactNode }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={fill ?? "none"}
			stroke="currentColor"
			strokeWidth={stroke}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...rest}
		>
			{children}
		</svg>
	);
}

export const IconArrowRight = (p: IconProps) => (
	<Icon {...p}>
		<line x1="5" y1="12" x2="19" y2="12" />
		<polyline points="12 5 19 12 12 19" />
	</Icon>
);

export const IconArrowUpRight = (p: IconProps) => (
	<Icon {...p}>
		<line x1="7" y1="17" x2="17" y2="7" />
		<polyline points="7 7 17 7 17 17" />
	</Icon>
);

export const IconChevronRight = (p: IconProps) => (
	<Icon {...p}>
		<polyline points="9 6 15 12 9 18" />
	</Icon>
);

export const IconCheck = (p: IconProps) => (
	<Icon {...p}>
		<polyline points="4 12 10 18 20 6" />
	</Icon>
);

export const IconSearch = (p: IconProps) => (
	<Icon {...p}>
		<circle cx="11" cy="11" r="7" />
		<line x1="20" y1="20" x2="16.65" y2="16.65" />
	</Icon>
);

export const IconGithub = (p: IconProps) => (
	<Icon {...p}>
		<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.2a11.6 11.6 0 0 0-6 0C6.7 1.7 5.7 2 5.7 2a4.3 4.3 0 0 0-.1 3.2A4.7 4.7 0 0 0 4.3 8.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
	</Icon>
);

export const IconClaude = ({ size = 16, style }: { size?: number; style?: CSSProperties }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="currentColor"
		style={style}
		aria-hidden="true"
	>
		<path d="M4.7 17.3 9.6 6.7h2.9l4.9 10.6h-2.4l-1-2.4H8l-1 2.4H4.7Zm3.8-4.1h4.5L10.7 8l-2.2 5.2Z" />
		<path d="M19 6.7v10.6h-2V6.7h2Z" />
	</svg>
);

export const IconBranch = (p: IconProps) => (
	<Icon {...p}>
		<line x1="6" y1="3" x2="6" y2="15" />
		<circle cx="18" cy="6" r="3" />
		<circle cx="6" cy="18" r="3" />
		<path d="M18 9a9 9 0 0 1-9 9" />
	</Icon>
);

export const IconX = (p: IconProps) => (
	<Icon {...p}>
		<line x1="6" y1="6" x2="18" y2="18" />
		<line x1="18" y1="6" x2="6" y2="18" />
	</Icon>
);

export const IconLock = (p: IconProps) => (
	<Icon {...p}>
		<rect x="4" y="11" width="16" height="10" rx="2" />
		<path d="M8 11V7a4 4 0 0 1 8 0v4" />
	</Icon>
);

export const IconCopy = (p: IconProps) => (
	<Icon {...p}>
		<rect x="9" y="9" width="11" height="11" rx="2" />
		<path d="M5 15V5a2 2 0 0 1 2-2h10" />
	</Icon>
);

export const IconRefresh = (p: IconProps) => (
	<Icon {...p}>
		<polyline points="21 4 21 10 15 10" />
		<path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
	</Icon>
);

export const IconClock = (p: IconProps) => (
	<Icon {...p}>
		<circle cx="12" cy="12" r="9" />
		<polyline points="12 7 12 12 15 14" />
	</Icon>
);

export const IconFile = (p: IconProps) => (
	<Icon {...p}>
		<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
		<polyline points="14 3 14 9 20 9" />
	</Icon>
);

export const IconLink = (p: IconProps) => (
	<Icon {...p}>
		<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 1 0-7-7l-1 1" />
		<path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 1 0 7 7l1-1" />
	</Icon>
);

export const IconPullRequest = (p: IconProps) => (
	<Icon {...p}>
		<circle cx="6" cy="6" r="3" />
		<circle cx="6" cy="18" r="3" />
		<circle cx="18" cy="18" r="3" />
		<line x1="6" y1="9" x2="6" y2="15" />
		<path d="M13 6h3a2 2 0 0 1 2 2v7" />
	</Icon>
);
