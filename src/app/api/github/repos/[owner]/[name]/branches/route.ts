import { octokitForSession } from "@/lib/github";
import { clearSession, getSession } from "@/lib/session";

type ErrorWithStatus = Error & { status?: number };

type Ctx = { params: Promise<{ owner: string; name: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { owner, name } = await ctx.params;

  try {
    const { data } = await octokitForSession(session).rest.repos.listBranches({
      owner,
      repo: name,
      per_page: 100,
    });
    return Response.json({ branches: data.map((b) => b.name) });
  } catch (e) {
    const err = e as ErrorWithStatus;
    if (err.status === 401) {
      await clearSession();
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err.status === 403) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
    return Response.json({ error: "github_unavailable" }, { status: 502 });
  }
}
