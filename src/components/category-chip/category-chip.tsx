import type { Category } from "@/lib/audit/schema";
import styles from "./category-chip.module.scss";

type Props = { category: Category };

export function CategoryChip({ category }: Props) {
	return <span className={styles["category-chip"]}>{category}</span>;
}
