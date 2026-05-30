import { env } from "@/lib/env";
import { clearGithubToken, setGithubToken } from "@/lib/gh-token-store";
import { mintMcpToken } from "@/lib/mcp-token";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "session_required" }, { status: 401 });
  }
  const token = mintMcpToken({ uid: session.login });
  setGithubToken(session.login, session.githubToken);
  const mcpUrl = new URL("/api/mcp", env.APP_URL).toString();
  return Response.json({ token, mcpUrl });
}

export async function DELETE() {
  const session = await getSession();
  if (session) {
    clearGithubToken(session.login);
  }
  // v1: bearer tokens themselves are stateless. Clearing the snapshotted GH
  // token disables repo source-check audits for this uid until the user
  // re-mints, but URL audits continue to work.
  return new Response(null, { status: 204 });
}
