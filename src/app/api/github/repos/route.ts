import { octokitForSession } from "@/lib/github";
import { clearSession, getSession } from "@/lib/session";
import { toRepoListItem, type GithubRepo } from "@/lib/repo-mapper";

type ErrorWithStatus = Error & {
  status?: number;
  response?: { headers?: Record<string, string> };
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { data } = await octokitForSession(session).rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: "pushed",
    });
    return Response.json({ repos: data.map((r) => toRepoListItem(r as GithubRepo)) });
  } catch (e) {
    const err = e as ErrorWithStatus;
    if (err.status === 401) {
      await clearSession();
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err.status === 403) {
      const reset = Number(err.response?.headers?.["x-ratelimit-reset"] ?? 0);
      return Response.json(
        { error: "rate_limited", resetAt: reset ? reset * 1000 : null },
        { status: 429 },
      );
    }
    return Response.json({ error: "github_unavailable" }, { status: 502 });
  }
}
