"use client";

import { useEffect, useState } from "react";
import styles from "./score-gauge.module.scss";

type Props = {
	value: number;
	size?: number;
};

function colorFor(value: number): string {
	if (value < 50) return "var(--red, #f87171)";
	if (value < 80) return "var(--amber, #fbbf24)";
	return "var(--green, #4ade80)";
}

export function ScoreGauge({ value, size = 96 }: Props) {
	const [shown, setShown] = useState(0);

	useEffect(() => {
		let raf = 0;
		const start = performance.now();
		const dur = 800;
		const tick = (t: number) => {
			const p = Math.min(1, (t - start) / dur);
			const eased = 1 - Math.pow(1 - p, 3);
			setShown(Math.round(value * eased));
			if (p < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [value]);

	const color = colorFor(value);
	const r = size / 2 - 6;
	const cx = size / 2;
	const cy = size / 2;
	const startAngle = 135;
	const endAngle = 405;
	const sweep = endAngle - startAngle;

	const toXY = (angle: number): [number, number] => {
		const rad = (angle * Math.PI) / 180;
		return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
	};

	const [sx, sy] = toXY(startAngle);
	const [ex, ey] = toXY(endAngle - 0.001);
	const trackPath = `M ${sx} ${sy} A ${r} ${r} 0 1 1 ${ex} ${ey}`;

	const filledEnd = startAngle + (sweep * shown) / 100;
	const [fx, fy] = toXY(filledEnd);
	const large = filledEnd - startAngle > 180 ? 1 : 0;
	const filledPath = `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${fx} ${fy}`;

	return (
		<div
			className={styles["score-gauge"]}
			style={{ width: size, height: size }}
		>
			<svg width={size} height={size}>
				<path
					d={trackPath}
					fill="none"
					stroke="var(--border, #26262e)"
					strokeWidth={5}
					strokeLinecap="round"
				/>
				<path
					d={filledPath}
					fill="none"
					stroke={color}
					strokeWidth={5}
					strokeLinecap="round"
					style={{ filter: `drop-shadow(0 0 8px ${color})`, opacity: 0.95 }}
				/>
			</svg>
			<div className={styles["score-gauge__num"]} style={{ color }}>
				{shown}
			</div>
		</div>
	);
}
