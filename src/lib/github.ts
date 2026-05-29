import "server-only";
import { OAuthApp } from "@octokit/oauth-app";
import { Octokit } from "@octokit/rest";
import { env } from "./env";
import type { Session } from "./session";

export const oauthApp = new OAuthApp({
  clientType: "oauth-app",
  clientId: env.GITHUB_CLIENT_ID,
  clientSecret: env.GITHUB_CLIENT_SECRET,
});

export function octokitForSession(session: Pick<Session, "githubToken">): Octokit {
  return new Octokit({ auth: session.githubToken });
}

export function callbackUrl(): string {
  return new URL("/api/auth/github/callback", env.APP_URL).toString();
}
