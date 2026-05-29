import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp-server";
import { parseMcpToken } from "@/lib/mcp-token";

function jsonRpcError(code: number, message: string, httpStatus: number): Response {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code, message } },
    { status: httpStatus },
  );
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return jsonRpcError(-32001, "missing_token", 401);
  }
  const token = auth.slice("Bearer ".length);
  const payload = parseMcpToken(token);
  if (!payload) {
    return jsonRpcError(-32002, "invalid_token", 401);
  }

  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServer({ uid: payload.uid });
  await server.connect(transport);
  return transport.handleRequest(request);
}
