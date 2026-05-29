import { env } from "@/lib/env";
import { mintMcpToken } from "@/lib/mcp-token";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "session_required" }, { status: 401 });
  }
  const token = mintMcpToken({ uid: session.login });
  const mcpUrl = new URL("/api/mcp", env.APP_URL).toString();
  return Response.json({ token, mcpUrl });
}

export async function DELETE() {
  // v1: tokens are stateless, so revocation is UI-only. The token remains
  // valid until MCP_TOKEN_SECRET rotates. Documented in the modal.
  return new Response(null, { status: 204 });
}
