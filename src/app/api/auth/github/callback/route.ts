import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { oauthApp, octokitForSession } from "@/lib/github";
import { consumeOAuthState, setSession } from "@/lib/session";

type ErrorReason = "denied" | "state" | "exchange" | "scope";

function redirectError(reason: ErrorReason) {
  return NextResponse.redirect(
    new URL(`/?gh=error&reason=${reason}`, env.APP_URL),
    { status: 302 },
  );
}

function redirectConnected() {
  return NextResponse.redirect(new URL("/?gh=connected", env.APP_URL), {
    status: 302,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error === "access_denied") return redirectError("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = await consumeOAuthState();

  if (!code || !state || !expectedState || expectedState !== state) {
    return redirectError("state");
  }

  let token: string;
  let grantedScopes: string[];
  try {
    const result = await oauthApp.createToken({ code });
    token = result.authentication.token;
    grantedScopes = result.authentication.scopes ?? [];
  } catch {
    return redirectError("exchange");
  }

  if (!grantedScopes.includes("repo")) {
    return redirectError("scope");
  }

  try {
    const me = await octokitForSession({ githubToken: token }).rest.users.getAuthenticated();
    await setSession({
      githubToken: token,
      login: me.data.login,
      avatarUrl: me.data.avatar_url,
      connectedAt: Date.now(),
    });
  } catch {
    return redirectError("exchange");
  }

  return redirectConnected();
}
