import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { callbackUrl, oauthApp } from "@/lib/github";
import { setOAuthState } from "@/lib/session";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  await setOAuthState(state);

  const { url } = oauthApp.getWebFlowAuthorizationUrl({
    state,
    scopes: ["repo"],
    redirectUrl: callbackUrl(),
  });

  return NextResponse.redirect(url, { status: 302 });
}
