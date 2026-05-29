export type Repo = {
	owner: string;
	name: string;
	branch: string;
	framework?: string;
	pushedAt?: string;
	branches?: string[];
};

export type RepoListItem = {
	owner: string;
	name: string;
	lang: string;
	pushedAt: string;
	private: boolean;
};

export type RecentAudit = {
	url: string;
	score: number;
	time: string;
};

export type Audit = {
	id: string;
	url: string;
	status: "queued" | "running" | "complete" | "failed";
	score: number | null;
	startedAt: string;
	completedAt: string | null;
	findingCount: number;
};

export type Finding = {
	id: string;
	auditId: string;
	category: "performance" | "a11y" | "seo" | "best-practices";
	severity: "high" | "medium" | "low";
	title: string;
	description: string;
	source: {
		file: string;
		line: number;
		snippet: string;
	} | null;
	diff: string | null;
};

export type ClaudeConnection = {
	token: string;
	mcpUrl: string;
	createdAt: number;
};
