import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "./env";

export type Session = {
  githubToken: string;
  login: string;
  avatarUrl: string;
  connectedAt: number;
};

type SessionData = Partial<Session>;

type OAuthStateData = { state?: string };

const SESSION_COOKIE = "seokun_session";
const STATE_COOKIE = "seokun_oauth_state";

const baseOptions: Pick<SessionOptions, "password"> = {
  password: env.SESSION_SECRET,
};

const sessionOptions: SessionOptions = {
  ...baseOptions,
  cookieName: SESSION_COOKIE,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};

const stateOptions: SessionOptions = {
  ...baseOptions,
  cookieName: STATE_COOKIE,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  },
};

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const s = await getIronSession<SessionData>(store, sessionOptions);
  if (!s.githubToken || !s.login) return null;
  return {
    githubToken: s.githubToken,
    login: s.login,
    avatarUrl: s.avatarUrl ?? "",
    connectedAt: s.connectedAt ?? 0,
  };
}

export async function setSession(session: Session): Promise<void> {
  const store = await cookies();
  const s = await getIronSession<SessionData>(store, sessionOptions);
  Object.assign(s, session);
  await s.save();
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  const s = await getIronSession<SessionData>(store, sessionOptions);
  s.destroy();
}

export async function setOAuthState(state: string): Promise<void> {
  const store = await cookies();
  const s = await getIronSession<OAuthStateData>(store, stateOptions);
  s.state = state;
  await s.save();
}

export async function consumeOAuthState(): Promise<string | null> {
  const store = await cookies();
  const s = await getIronSession<OAuthStateData>(store, stateOptions);
  const value = s.state ?? null;
  s.destroy();
  return value;
}
