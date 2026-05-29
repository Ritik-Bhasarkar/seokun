"use client";

import { useEffect, useState } from "react";
import { Button } from "../button/button";
import { IconClaude, IconCheck, IconX } from "../icons/icons";
import type { ClaudeConnection } from "@/lib/types";
import styles from "./claude-modal.module.scss";

type Step = "auth" | "connected";
type Tab = "desktop" | "code";

type Props = {
	open: boolean;
	connection: ClaudeConnection | null;
	hasGithubSession: boolean;
	onClose: () => void;
	onConnect: (conn: ClaudeConnection) => void;
	onDisconnect: () => void;
	onGoConnectGithub: () => void;
};

export function ClaudeModal({
	open,
	connection,
	hasGithubSession,
	onClose,
	onConnect,
	onDisconnect,
	onGoConnectGithub,
}: Props) {
	const [step, setStep] = useState<Step>(connection ? "connected" : "auth");
	const [tab, setTab] = useState<Tab>("desktop");
	const [tokenVisible, setTokenVisible] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		// Resetting modal state when (re)opened — `open` and `connection`
		// from the parent are the external system being synchronized.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setStep(connection ? "connected" : "auth");
		setTokenVisible(false);
		setGenerating(false);
		setError(null);
		setTab("desktop");
	}, [open, connection]);

	if (!open) return null;

	const generate = async () => {
		setError(null);
		setGenerating(true);
		try {
			const res = await fetch("/api/mcp/token", { method: "POST" });
			if (res.status === 401) {
				setError("Connect GitHub first.");
				setGenerating(false);
				return;
			}
			if (!res.ok) {
				setError("Couldn't generate token. Try again.");
				setGenerating(false);
				return;
			}
			const json = (await res.json()) as { token: string; mcpUrl: string };
			onConnect({
				token: json.token,
				mcpUrl: json.mcpUrl,
				createdAt: Date.now(),
			});
		} catch {
			setError("Network error.");
		} finally {
			setGenerating(false);
		}
	};

	const disconnect = async () => {
		await fetch("/api/mcp/token", { method: "DELETE" });
		onDisconnect();
	};

	const copy = (text: string) => {
		void navigator.clipboard?.writeText(text);
	};

	const desktopSnippet = (token: string, mcpUrl: string) =>
		`{
  "mcpServers": {
    "seokun": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer ${token}" }
    }
  }
}`;

	const codeSnippet = (token: string, mcpUrl: string) =>
		`claude mcp add seokun ${mcpUrl} --header "Authorization: Bearer ${token}"`;

	return (
		<div
			className={styles["claude-modal__overlay"]}
			onClick={onClose}
			role="presentation"
		>
			<div
				className={styles["claude-modal"]}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Connect Claude"
			>
				<div className={styles["claude-modal__head"]}>
					<div className={styles["claude-modal__head-l"]}>
						<IconClaude size={16} />
						<span>{step === "connected" ? "Claude connected" : "Connect Claude"}</span>
					</div>
					<button
						type="button"
						className={styles["claude-modal__close"]}
						onClick={onClose}
						aria-label="Close"
					>
						<IconX size={14} stroke={2} />
					</button>
				</div>

				{step === "auth" && (
					<div className={styles["claude-modal__body"]}>
						<h2 className={styles["claude-modal__title"]}>
							Expose your audits to Claude
						</h2>
						<p className={styles["claude-modal__p"]}>
							seokun runs an MCP server. Generate a token and paste the
							snippet into your Claude config — Claude can then list your audits,
							inspect findings, and (later) trigger new ones from the chat.
						</p>
						{!hasGithubSession ? (
							<>
								<p className={styles["claude-modal__p"]}>
									Connect your GitHub account first so the token is tied to your repo.
								</p>
								<Button variant="primary" onClick={onGoConnectGithub}>
									Connect GitHub
								</Button>
							</>
						) : (
							<Button
								variant="primary"
								onClick={generate}
								disabled={generating}
								leftIcon={<IconClaude size={14} />}
							>
								{generating ? "Generating…" : "Generate connection token"}
							</Button>
						)}
						{error && <div className={styles["claude-modal__error"]}>{error}</div>}
					</div>
				)}

				{step === "connected" && connection && (
					<div className={styles["claude-modal__body"]}>
						<h2 className={styles["claude-modal__title"]}>Your connection token</h2>
						<div className={styles["claude-modal__token-row"]}>
							<span className={styles["claude-modal__token-value"]}>
								{tokenVisible ? connection.token : "•".repeat(36)}
							</span>
							<button
								type="button"
								className={styles["claude-modal__btn-mini"]}
								onClick={() => setTokenVisible((v) => !v)}
							>
								{tokenVisible ? "Hide" : "Show"}
							</button>
							<button
								type="button"
								className={styles["claude-modal__btn-mini"]}
								onClick={() => copy(connection.token)}
							>
								Copy
							</button>
						</div>

						<div className={styles["claude-modal__tabs"]}>
							<button
								type="button"
								className={[
									styles["claude-modal__tab"],
									tab === "desktop" ? styles["claude-modal__tab--active"] : "",
								]
									.filter(Boolean)
									.join(" ")}
								onClick={() => setTab("desktop")}
							>
								Claude Desktop
							</button>
							<button
								type="button"
								className={[
									styles["claude-modal__tab"],
									tab === "code" ? styles["claude-modal__tab--active"] : "",
								]
									.filter(Boolean)
									.join(" ")}
								onClick={() => setTab("code")}
							>
								Claude Code
							</button>
						</div>

						{tab === "desktop" && (
							<>
								<p className={styles["claude-modal__p"]}>
									Add to <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>,
									then restart Claude Desktop.
								</p>
								<pre className={styles["claude-modal__snippet"]}>
									{desktopSnippet(connection.token, connection.mcpUrl)}
								</pre>
								<button
									type="button"
									className={styles["claude-modal__btn-mini"]}
									onClick={() => copy(desktopSnippet(connection.token, connection.mcpUrl))}
								>
									Copy snippet
								</button>
							</>
						)}

						{tab === "code" && (
							<>
								<p className={styles["claude-modal__p"]}>
									Run in any terminal where Claude Code is installed:
								</p>
								<pre className={styles["claude-modal__snippet"]}>
									{codeSnippet(connection.token, connection.mcpUrl)}
								</pre>
								<button
									type="button"
									className={styles["claude-modal__btn-mini"]}
									onClick={() => copy(codeSnippet(connection.token, connection.mcpUrl))}
								>
									Copy command
								</button>
							</>
						)}

						<p className={styles["claude-modal__p"]} style={{ fontSize: 11 }}>
							Disconnecting removes the token from this UI only. To force-revoke
							server-side, ask the team to rotate <code>MCP_TOKEN_SECRET</code>.
						</p>

						<div className={styles["claude-modal__foot"]}>
							<Button variant="ghost" size="sm" onClick={disconnect}>
								Disconnect
							</Button>
							<Button size="sm" onClick={onClose} leftIcon={<IconCheck size={13} stroke={2.4} />}>
								Done
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
