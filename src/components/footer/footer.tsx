import { IconGithub } from "../icons/icons";
import styles from "./footer.module.scss";

const VERSION = "v0.4.2";

export function Footer() {
	return (
		<footer className={styles.footer}>
			<div className={styles.footer__inner}>
				<span>seokun</span>
				<div className={styles.footer__right}>
					<a
						className={styles.footer__link}
						href="https://github.com/seokun"
						target="_blank"
						rel="noreferrer noopener"
					>
						<IconGithub size={13} />
						GitHub
					</a>
					<span className={styles.footer__version}>{VERSION}</span>
				</div>
			</div>
		</footer>
	);
}
