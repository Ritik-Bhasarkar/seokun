import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export type TokenPayload = {
  v: 1;
  uid: string;
  iat: number;
};

const PREFIX = "seokun_mcp";

function sign(payloadB64: string): string {
  return createHmac("sha256", env.MCP_TOKEN_SECRET)
    .update(payloadB64)
    .digest("base64url");
}

export function mintMcpToken(input: { uid: string }): string {
  const payload: TokenPayload = { v: 1, uid: input.uid, iat: Date.now() };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(b64);
  return `${PREFIX}.${b64}.${sig}`;
}

export function parseMcpToken(token: string): TokenPayload | null {
  if (!token.startsWith(`${PREFIX}.`)) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, payloadB64, sig] = parts;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as TokenPayload).v !== 1 ||
    typeof (payload as TokenPayload).uid !== "string" ||
    typeof (payload as TokenPayload).iat !== "number"
  ) {
    return null;
  }
  return payload as TokenPayload;
}
