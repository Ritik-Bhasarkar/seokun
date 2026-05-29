import type { RepoListItem } from "./types";

export type GithubRepo = {
  name: string;
  owner: { login: string };
  language: string | null;
  pushed_at: string | null;
  private: boolean;
};

export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function toRepoListItem(repo: GithubRepo): RepoListItem {
  return {
    owner: repo.owner.login,
    name: repo.name,
    lang: repo.language ?? "",
    pushedAt: formatRelative(repo.pushed_at ?? new Date().toISOString()),
    private: repo.private,
  };
}
