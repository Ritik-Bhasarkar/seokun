# GitHub OAuth Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mocked GitHub data in `GithubModal` with a real OAuth web flow + live repo/branch listing, with the access token sealed into an HttpOnly iron-session cookie.

**Architecture:** Next.js 16 App Router route handlers do the OAuth handshake via `@octokit/oauth-app`. The session lives in an encrypted cookie via `iron-session`. Authenticated REST calls use `@octokit/rest`. The client modal redirects the browser to `/api/auth/github/start` and fetches live data from server routes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, `@octokit/oauth-app`, `@octokit/rest`, `iron-session`, `zod`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-github-oauth-design.md`

---

## Prerequisites (user, one-time)

Before Task 1, the **user** must:

1. Visit github.com/settings/developers → "OAuth Apps" → "New OAuth App"
   - Application name: `seokun (local)`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
2. Copy the Client ID; click "Generate a new client secret", copy that too.
3. Create `.env.local` in the repo root with:
   ```
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   SESSION_SECRET=<output of `openssl rand -hex 32`>
   APP_URL=http://localhost:3000
   ```
4. Verify `.env.local` is in `.gitignore` (it should already be from the Next scaffold — `grep -n ".env" .gitignore`).

Do not start Task 1 until the four items above are done.

---

## Important Next.js 16 notes

- `cookies()` from `next/headers` is **async** in Next 16 — always `const store = await cookies()`.
- Route handlers receive `(request: NextRequest, ctx: { params: Promise<...> })`. `params` is a Promise — `await ctx.params`.
- Use `RouteContext<'/path/[param]'>` for typed dynamic-route context.
- Use `NextResponse.redirect(new URL(...))` for 302s.

---

## File map

```
Create:
  vitest.config.ts
  src/lib/env.ts                       + src/lib/env.test.ts
  src/lib/session.ts                   + src/lib/session.test.ts
  src/lib/github.ts
  src/lib/repo-mapper.ts               + src/lib/repo-mapper.test.ts
  src/app/api/auth/github/start/route.ts        + .test.ts (colocated)
  src/app/api/auth/github/callback/route.ts     + .test.ts
  src/app/api/auth/github/logout/route.ts       + .test.ts
  src/app/api/github/repos/route.ts             + .test.ts
  src/app/api/github/repos/[owner]/[name]/branches/route.ts + .test.ts

Modify:
  package.json                         (deps + scripts)
  src/lib/mock-data.ts                 (drop GH_REPO_LIST and DEMO_REPO)
  src/components/github-modal/github-modal.tsx   (rewrite to use real APIs)
  src/components/home-screen/home-screen.tsx     (handle ?gh=… query params)
```

---

### Task 1: Install dependencies and set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
npm install @octokit/oauth-app @octokit/rest iron-session zod
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 2: Add test scripts to `package.json`**

In the `scripts` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Verify Vitest runs (with no tests yet)**

Run: `npm test`
Expected: exits 0 with "No test files found" — that's fine for now.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add octokit, iron-session, zod, vitest"
```

---

### Task 2: Env validation (`src/lib/env.ts`) — TDD

**Files:**
- Create: `src/lib/env.ts`
- Test: `src/lib/env.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/env.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseEnv } from "./env";

describe("parseEnv", () => {
  const good = {
    GITHUB_CLIENT_ID: "client",
    GITHUB_CLIENT_SECRET: "secret",
    SESSION_SECRET: "x".repeat(32),
    APP_URL: "http://localhost:3000",
  };

  it("parses a valid env", () => {
    expect(parseEnv(good)).toEqual(good);
  });

  it("throws when GITHUB_CLIENT_ID is missing", () => {
    expect(() => parseEnv({ ...good, GITHUB_CLIENT_ID: "" })).toThrow();
  });

  it("throws when SESSION_SECRET is too short", () => {
    expect(() => parseEnv({ ...good, SESSION_SECRET: "short" })).toThrow();
  });

  it("throws when APP_URL is not a valid URL", () => {
    expect(() => parseEnv({ ...good, APP_URL: "not-a-url" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- src/lib/env.test.ts`
Expected: FAIL — `Cannot find module './env'`.

- [ ] **Step 3: Implement `src/lib/env.ts`**

```ts
import "server-only";
import { z } from "zod";

const Schema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.string().url(),
});

export type Env = z.infer<typeof Schema>;

export function parseEnv(input: Record<string, string | undefined>): Env {
  return Schema.parse(input);
}

let _env: Env | undefined;
function loadEnv(): Env {
  if (!_env) {
    _env = parseEnv(process.env as Record<string, string | undefined>);
  }
  return _env;
}

// Lazy: validation only runs on first property access, so `parseEnv` can be
// imported standalone in tests without needing process.env populated.
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    return loadEnv()[prop as keyof Env];
  },
});
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- src/lib/env.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts src/lib/env.test.ts
git commit -m "feat(env): add zod-validated env parser"
```

---

### Task 3: Session helpers (`src/lib/session.ts`) — TDD

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/session.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  })),
}));

vi.mock("./env", () => ({
  env: {
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "secret",
    SESSION_SECRET: "x".repeat(32),
    APP_URL: "http://localhost:3000",
  },
}));

import {
  clearSession,
  getSession,
  setSession,
  consumeOAuthState,
  setOAuthState,
} from "./session";

beforeEach(() => {
  cookieStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("session helpers", () => {
  it("returns null when no session cookie is present", async () => {
    expect(await getSession()).toBeNull();
  });

  it("round-trips a session", async () => {
    await setSession({
      githubToken: "ghp_abc",
      login: "octocat",
      avatarUrl: "https://example.com/a.png",
      connectedAt: 1700000000000,
    });
    const s = await getSession();
    expect(s?.login).toBe("octocat");
    expect(s?.githubToken).toBe("ghp_abc");
  });

  it("clearSession removes the cookie", async () => {
    await setSession({
      githubToken: "t",
      login: "u",
      avatarUrl: "",
      connectedAt: 0,
    });
    await clearSession();
    expect(await getSession()).toBeNull();
  });
});

describe("oauth state helpers", () => {
  it("setOAuthState writes a value that consumeOAuthState returns and clears", async () => {
    await setOAuthState("abc123");
    expect(await consumeOAuthState()).toBe("abc123");
    expect(await consumeOAuthState()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- src/lib/session.test.ts`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Implement `src/lib/session.ts`**

```ts
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- src/lib/session.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts
git commit -m "feat(session): add iron-session helpers for auth + oauth state"
```

---

### Task 4: GitHub helpers (`src/lib/github.ts`)

**Files:**
- Create: `src/lib/github.ts`

No test — this file is thin wiring. It will be mocked from the route-handler tests.

- [ ] **Step 1: Implement `src/lib/github.ts`**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to `src/lib/github.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/github.ts
git commit -m "feat(github): add OAuthApp + Octokit factory"
```

---

### Task 5: Repo mapper (`src/lib/repo-mapper.ts`) — TDD

**Files:**
- Create: `src/lib/repo-mapper.ts`
- Test: `src/lib/repo-mapper.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/repo-mapper.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toRepoListItem, formatRelative } from "./repo-mapper";

describe("toRepoListItem", () => {
  it("maps a GitHub repo to RepoListItem", () => {
    const result = toRepoListItem({
      name: "lume-app",
      owner: { login: "acme" },
      language: "TypeScript",
      pushed_at: "2026-05-27T10:00:00Z",
      private: true,
    });
    expect(result).toEqual({
      owner: "acme",
      name: "lume-app",
      lang: "TypeScript",
      pushedAt: expect.any(String),
      private: true,
    });
  });

  it("uses empty string when language is null", () => {
    const result = toRepoListItem({
      name: "x",
      owner: { login: "y" },
      language: null,
      pushed_at: "2026-05-27T10:00:00Z",
      private: false,
    });
    expect(result.lang).toBe("");
  });
});

describe("formatRelative", () => {
  it("returns 'just now' for <1 minute", () => {
    const now = Date.parse("2026-05-27T10:00:30Z");
    expect(formatRelative("2026-05-27T10:00:00Z", now)).toBe("just now");
  });

  it("returns minutes ago for <1 hour", () => {
    const now = Date.parse("2026-05-27T10:05:00Z");
    expect(formatRelative("2026-05-27T10:00:00Z", now)).toBe("5m ago");
  });

  it("returns hours ago for <1 day", () => {
    const now = Date.parse("2026-05-27T13:00:00Z");
    expect(formatRelative("2026-05-27T10:00:00Z", now)).toBe("3h ago");
  });

  it("returns days ago otherwise", () => {
    const now = Date.parse("2026-05-30T10:00:00Z");
    expect(formatRelative("2026-05-27T10:00:00Z", now)).toBe("3d ago");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- src/lib/repo-mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/repo-mapper.ts`**

```ts
import type { RepoListItem } from "./types";

export type GithubRepo = {
  name: string;
  owner: { login: string };
  language: string | null;
  pushed_at: string | null;
  private: boolean;
};

export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function toRepoListItem(repo: GithubRepo): RepoListItem {
  return {
    owner: repo.owner.login,
    name: repo.name,
    lang: repo.language ?? "",
    pushedAt: formatRelative(repo.pushed_at ?? new Date().toISOString()),
    private: repo.private,
  };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- src/lib/repo-mapper.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repo-mapper.ts src/lib/repo-mapper.test.ts
git commit -m "feat(github): add repo mapper + relative-time helper"
```

---

### Task 6: `/api/auth/github/start` route — TDD

**Files:**
- Create: `src/app/api/auth/github/start/route.ts`
- Test: `src/app/api/auth/github/start/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/auth/github/start/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const setOAuthState = vi.fn();
vi.mock("@/lib/session", () => ({
  setOAuthState,
}));

const getWebFlowAuthorizationUrl = vi.fn(({ state }) => ({
  url: `https://github.com/login/oauth/authorize?state=${state}&scope=repo`,
}));
vi.mock("@/lib/github", () => ({
  oauthApp: { getWebFlowAuthorizationUrl },
  callbackUrl: () => "http://localhost:3000/api/auth/github/callback",
}));

import { GET } from "./route";

describe("GET /api/auth/github/start", () => {
  it("stores a state cookie and redirects to GitHub with matching state", async () => {
    const res = await GET();
    expect(res.status).toBe(302);

    const location = res.headers.get("location") ?? "";
    const stateInUrl = new URL(location).searchParams.get("state");
    expect(stateInUrl).toBeTruthy();
    expect(setOAuthState).toHaveBeenCalledWith(stateInUrl);
    expect(location).toContain("github.com/login/oauth/authorize");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- src/app/api/auth/github/start`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/app/api/auth/github/start/route.ts`**

```ts
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- src/app/api/auth/github/start`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/github/start
git commit -m "feat(auth): add /api/auth/github/start route"
```

---

### Task 7: `/api/auth/github/callback` route — TDD

**Files:**
- Create: `src/app/api/auth/github/callback/route.ts`
- Test: `src/app/api/auth/github/callback/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/auth/github/callback/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const consumeOAuthState = vi.fn();
const setSession = vi.fn();
vi.mock("@/lib/session", () => ({ consumeOAuthState, setSession }));

const createToken = vi.fn();
const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/github", () => ({
  oauthApp: { createToken },
  octokitForSession: () => ({
    rest: { users: { getAuthenticated: getAuthenticatedUser } },
  }),
}));

import { GET } from "./route";

function req(qs: string) {
  return new Request(`http://localhost:3000/api/auth/github/callback?${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth/github/callback", () => {
  it("redirects with reason=denied when GitHub sends error=access_denied", async () => {
    const res = await GET(req("error=access_denied"));
    expect(res.headers.get("location")).toContain("/?gh=error&reason=denied");
    expect(createToken).not.toHaveBeenCalled();
  });

  it("redirects with reason=state when state cookie is missing", async () => {
    consumeOAuthState.mockResolvedValueOnce(null);
    const res = await GET(req("code=abc&state=xyz"));
    expect(res.headers.get("location")).toContain("reason=state");
  });

  it("redirects with reason=state when state does not match", async () => {
    consumeOAuthState.mockResolvedValueOnce("stored-state");
    const res = await GET(req("code=abc&state=other"));
    expect(res.headers.get("location")).toContain("reason=state");
  });

  it("redirects with reason=exchange when createToken throws", async () => {
    consumeOAuthState.mockResolvedValueOnce("good");
    createToken.mockRejectedValueOnce(new Error("nope"));
    const res = await GET(req("code=abc&state=good"));
    expect(res.headers.get("location")).toContain("reason=exchange");
  });

  it("redirects with reason=scope when granted scopes are insufficient", async () => {
    consumeOAuthState.mockResolvedValueOnce("good");
    createToken.mockResolvedValueOnce({
      authentication: { token: "t", scopes: ["public_repo"] },
    });
    const res = await GET(req("code=abc&state=good"));
    expect(res.headers.get("location")).toContain("reason=scope");
    expect(setSession).not.toHaveBeenCalled();
  });

  it("saves session and redirects to /?gh=connected on happy path", async () => {
    consumeOAuthState.mockResolvedValueOnce("good");
    createToken.mockResolvedValueOnce({
      authentication: { token: "ghp_real", scopes: ["repo"] },
    });
    getAuthenticatedUser.mockResolvedValueOnce({
      data: { login: "octocat", avatar_url: "https://example.com/a.png" },
    });

    const res = await GET(req("code=abc&state=good"));
    expect(setSession).toHaveBeenCalledWith({
      githubToken: "ghp_real",
      login: "octocat",
      avatarUrl: "https://example.com/a.png",
      connectedAt: expect.any(Number),
    });
    expect(res.headers.get("location")).toContain("/?gh=connected");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- src/app/api/auth/github/callback`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/app/api/auth/github/callback/route.ts`**

```ts
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- src/app/api/auth/github/callback`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/github/callback
git commit -m "feat(auth): add /api/auth/github/callback route"
```

---

### Task 8: `/api/auth/github/logout` route — TDD

**Files:**
- Create: `src/app/api/auth/github/logout/route.ts`
- Test: `src/app/api/auth/github/logout/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/auth/github/logout/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const clearSession = vi.fn();
vi.mock("@/lib/session", () => ({ clearSession }));

import { POST } from "./route";

describe("POST /api/auth/github/logout", () => {
  it("clears the session and returns 204", async () => {
    const res = await POST();
    expect(clearSession).toHaveBeenCalledOnce();
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- src/app/api/auth/github/logout`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/app/api/auth/github/logout/route.ts`**

```ts
import { clearSession } from "@/lib/session";

export async function POST() {
  await clearSession();
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- src/app/api/auth/github/logout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/github/logout
git commit -m "feat(auth): add /api/auth/github/logout route"
```

---

### Task 9: `/api/github/repos` route — TDD

**Files:**
- Create: `src/app/api/github/repos/route.ts`
- Test: `src/app/api/github/repos/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/github/repos/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession }));

const listForAuthenticatedUser = vi.fn();
vi.mock("@/lib/github", () => ({
  octokitForSession: () => ({
    rest: { repos: { listForAuthenticatedUser } },
  }),
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/github/repos", () => {
  it("returns 401 with no session", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns mapped repos when authenticated", async () => {
    getSession.mockResolvedValueOnce({ githubToken: "t", login: "u", avatarUrl: "", connectedAt: 0 });
    listForAuthenticatedUser.mockResolvedValueOnce({
      data: [
        {
          name: "lume-app",
          owner: { login: "acme" },
          language: "TypeScript",
          pushed_at: new Date().toISOString(),
          private: true,
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.repos[0]).toMatchObject({
      owner: "acme",
      name: "lume-app",
      lang: "TypeScript",
      private: true,
    });
  });

  it("returns 401 + clears session when GitHub returns 401", async () => {
    getSession.mockResolvedValueOnce({ githubToken: "t", login: "u", avatarUrl: "", connectedAt: 0 });
    listForAuthenticatedUser.mockRejectedValueOnce(Object.assign(new Error("unauth"), { status: 401 }));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when GitHub returns 403 rate limit", async () => {
    getSession.mockResolvedValueOnce({ githubToken: "t", login: "u", avatarUrl: "", connectedAt: 0 });
    listForAuthenticatedUser.mockRejectedValueOnce(
      Object.assign(new Error("rate"), {
        status: 403,
        response: { headers: { "x-ratelimit-reset": "1700000000" } },
      }),
    );
    const res = await GET();
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- src/app/api/github/repos/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/app/api/github/repos/route.ts`**

```ts
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- src/app/api/github/repos/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/github/repos
git commit -m "feat(github): add /api/github/repos route"
```

---

### Task 10: `/api/github/repos/[owner]/[name]/branches` route — TDD

**Files:**
- Create: `src/app/api/github/repos/[owner]/[name]/branches/route.ts`
- Test: `src/app/api/github/repos/[owner]/[name]/branches/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/github/repos/[owner]/[name]/branches/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession, clearSession: vi.fn() }));

const listBranches = vi.fn();
vi.mock("@/lib/github", () => ({
  octokitForSession: () => ({
    rest: { repos: { listBranches } },
  }),
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ owner: "acme", name: "lume-app" }) };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/github/repos/[owner]/[name]/branches", () => {
  it("returns 401 without a session", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns branch names when authenticated", async () => {
    getSession.mockResolvedValueOnce({ githubToken: "t", login: "u", avatarUrl: "", connectedAt: 0 });
    listBranches.mockResolvedValueOnce({
      data: [{ name: "main" }, { name: "develop" }],
    });
    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ branches: ["main", "develop"] });
    expect(listBranches).toHaveBeenCalledWith({
      owner: "acme",
      repo: "lume-app",
      per_page: 100,
    });
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- branches/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

`src/app/api/github/repos/[owner]/[name]/branches/route.ts`:

```ts
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- branches/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/github/repos/[owner]"
git commit -m "feat(github): add branches route"
```

---

### Task 11: Remove mock GitHub data

**Files:**
- Modify: `src/lib/mock-data.ts`

- [ ] **Step 1: Verify the only consumer of `GH_REPO_LIST` / `DEMO_REPO` is `github-modal.tsx`**

Run:
```bash
grep -rn "GH_REPO_LIST\|DEMO_REPO" src/
```
Expected: only references inside `src/lib/mock-data.ts` and `src/components/github-modal/github-modal.tsx`.

> If anything else imports them, stop and surface it — the plan assumes only the modal uses them.

- [ ] **Step 2: Edit `src/lib/mock-data.ts` — drop GitHub exports**

Replace the file with:

```ts
import type { RecentAudit } from "./types";

export const RECENT_AUDITS: RecentAudit[] = [
	{ url: "stellar-flux.vercel.app", score: 61, time: "3m ago" },
	{ url: "lume-app.io", score: 84, time: "27m ago" },
	{ url: "claude-clone-v2.lovable.app", score: 38, time: "yesterday" },
	{ url: "docs.basecase.ai", score: 92, time: "2 days ago" },
];
```

- [ ] **Step 3: Confirm TypeScript fails as expected on `github-modal.tsx`**

Run: `npx tsc --noEmit`
Expected: errors only in `src/components/github-modal/github-modal.tsx` — those get fixed in Task 12.

- [ ] **Step 4: Stage but do not commit yet** — Task 12 fixes the breakage in the same commit.

```bash
git add src/lib/mock-data.ts
```

---

### Task 12: Refactor `github-modal.tsx` to use real APIs

**Files:**
- Modify: `src/components/github-modal/github-modal.tsx` (full rewrite)

This is a UI change. No unit test — verified manually in Task 13.

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../button/button";
import {
	IconArrowRight,
	IconArrowUpRight,
	IconBranch,
	IconCheck,
	IconGithub,
	IconLock,
	IconSearch,
	IconX,
} from "../icons/icons";
import type { Repo, RepoListItem } from "@/lib/types";
import styles from "./github-modal.module.scss";

type Step = "auth" | "list" | "confirm" | "manage";

type Props = {
	open: boolean;
	repo: Repo | null;
	initialStep?: Step;
	onClose: () => void;
	onConfirm: (repo: Repo) => void;
	onDisconnect: () => void;
};

export function GithubModal({
	open,
	repo,
	initialStep,
	onClose,
	onConfirm,
	onDisconnect,
}: Props) {
	const [step, setStep] = useState<Step>(initialStep ?? (repo ? "manage" : "auth"));
	const [selected, setSelected] = useState<RepoListItem | null>(null);
	const [branch, setBranch] = useState<string>(repo?.branch ?? "main");
	const [query, setQuery] = useState("");

	const [repos, setRepos] = useState<RepoListItem[] | null>(null);
	const [reposError, setReposError] = useState<string | null>(null);
	const [branches, setBranches] = useState<string[] | null>(null);
	const [branchesError, setBranchesError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setStep(initialStep ?? (repo ? "manage" : "auth"));
		setSelected(null);
		setBranch(repo?.branch ?? "main");
		setQuery("");
		setRepos(null);
		setReposError(null);
		setBranches(null);
		setBranchesError(null);
	}, [open, repo, initialStep]);

	const loadRepos = useCallback(async () => {
		setRepos(null);
		setReposError(null);
		const res = await fetch("/api/github/repos");
		if (res.status === 401) {
			setStep("auth");
			return;
		}
		if (!res.ok) {
			setReposError("Couldn't load repositories. Try again.");
			return;
		}
		const json = (await res.json()) as { repos: RepoListItem[] };
		setRepos(json.repos);
	}, []);

	useEffect(() => {
		if (open && step === "list" && repos === null && reposError === null) {
			void loadRepos();
		}
	}, [open, step, repos, reposError, loadRepos]);

	useEffect(() => {
		if (!open || step !== "confirm" || !selected) return;
		setBranches(null);
		setBranchesError(null);
		void (async () => {
			const res = await fetch(
				`/api/github/repos/${encodeURIComponent(selected.owner)}/${encodeURIComponent(selected.name)}/branches`,
			);
			if (!res.ok) {
				setBranchesError("Couldn't load branches.");
				return;
			}
			const json = (await res.json()) as { branches: string[] };
			setBranches(json.branches);
			if (!json.branches.includes(branch)) {
				setBranch(json.branches[0] ?? "main");
			}
		})();
	}, [open, step, selected, branch]);

	if (!open) return null;

	const startAuth = () => {
		window.location.href = "/api/auth/github/start";
	};

	const filtered = (repos ?? []).filter((r) =>
		`${r.owner}/${r.name}`.toLowerCase().includes(query.toLowerCase()),
	);

	const submitConfirm = () => {
		if (!selected) return;
		onConfirm({
			owner: selected.owner,
			name: selected.name,
			branch,
			pushedAt: selected.pushedAt,
			branches: branches ?? [branch],
		});
	};

	const disconnect = async () => {
		await fetch("/api/auth/github/logout", { method: "POST" });
		onDisconnect();
	};

	const branchList = repo?.branches ?? branches ?? ["main"];

	return (
		<div
			className={styles["github-modal__overlay"]}
			onClick={onClose}
			role="presentation"
		>
			<div
				className={styles["github-modal"]}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Connect GitHub"
			>
				<div className={styles["github-modal__head"]}>
					<div className={styles["github-modal__head-l"]}>
						<IconGithub size={16} />
						<span>
							{step === "manage" ? "Connected repository" : "Connect GitHub"}
						</span>
					</div>
					<button
						type="button"
						className={styles["github-modal__close"]}
						onClick={onClose}
						aria-label="Close"
					>
						<IconX size={14} stroke={2} />
					</button>
				</div>

				{step === "auth" && (
					<div className={styles["github-modal__body"]}>
						<div className={styles["github-modal__illus"]}>
							<IconGithub size={42} />
						</div>
						<h2 className={styles["github-modal__title"]}>Connect your repository</h2>
						<p className={styles["github-modal__p"]}>
							seokun reads your source code to map every finding to a file, a line,
							and a ready-to-apply diff. Read-only access by default.
						</p>
						<ul className={styles["github-modal__perms"]}>
							<li>
								<IconCheck size={13} stroke={2.2} /> Read code & metadata
							</li>
							<li>
								<IconCheck size={13} stroke={2.2} /> Read pull requests
							</li>
							<li>
								<IconCheck size={13} stroke={2.2} /> Open PRs (only when you ask)
							</li>
						</ul>
						<Button
							variant="primary"
							className={styles["github-modal__cta"]}
							onClick={startAuth}
							leftIcon={<IconGithub size={14} />}
							rightIcon={<IconArrowUpRight size={12} stroke={2.2} />}
						>
							Authorize on GitHub
						</Button>
						<div className={styles["github-modal__note"]}>
							Tokens are scoped per-repo and revocable from your GitHub settings.
						</div>
					</div>
				)}

				{step === "list" && (
					<div
						className={`${styles["github-modal__body"]} ${styles["github-modal__body--list"]}`}
					>
						<h2 className={styles["github-modal__title"]}>Pick a repository</h2>
						<p className={styles["github-modal__p"]}>
							Choose the repo backing the site you&apos;re auditing.
						</p>
						<div className={styles["github-modal__search"]}>
							<IconSearch size={13} />
							<input
								className={styles["github-modal__search-input"]}
								placeholder="Filter repositories…"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								autoFocus
							/>
						</div>
						<div className={styles["github-modal__list"]}>
							{reposError && (
								<div className={styles["github-modal__p"]}>{reposError}</div>
							)}
							{!reposError && repos === null && (
								<div className={styles["github-modal__p"]}>Loading…</div>
							)}
							{filtered.map((r) => {
								const isSel = selected?.name === r.name && selected?.owner === r.owner;
								return (
									<button
										key={`${r.owner}/${r.name}`}
										type="button"
										className={[
											styles["github-modal__row"],
											isSel ? styles["github-modal__row--active"] : "",
										]
											.filter(Boolean)
											.join(" ")}
										onClick={() => setSelected(r)}
									>
										<div className={styles["github-modal__avatar"]}>
											{r.owner[0].toUpperCase()}
										</div>
										<div className={styles["github-modal__row-main"]}>
											<div className={styles["github-modal__row-name"]}>
												{r.owner}/
												<span className={styles["github-modal__row-repo"]}>
													{r.name}
												</span>
												{r.private && (
													<IconLock
														size={11}
														style={{ color: "var(--fg-dim)", marginLeft: 6 }}
													/>
												)}
											</div>
											<div className={styles["github-modal__row-meta"]}>
												<span className={styles["github-modal__lang"]}>
													<span className={styles["github-modal__lang-dot"]} />{" "}
													{r.lang || "—"}
												</span>
												<span>·</span>
												<span>Pushed {r.pushedAt}</span>
											</div>
										</div>
										{isSel && (
											<IconCheck
												size={14}
												stroke={2.4}
												style={{ color: "var(--accent)" }}
											/>
										)}
									</button>
								);
							})}
						</div>
						<div className={styles["github-modal__foot"]}>
							<Button variant="ghost" size="sm" onClick={onClose}>
								Cancel
							</Button>
							<Button
								variant="primary"
								size="sm"
								disabled={!selected}
								onClick={() => setStep("confirm")}
								rightIcon={<IconArrowRight size={12} stroke={2.2} />}
							>
								Continue
							</Button>
						</div>
					</div>
				)}

				{step === "confirm" && selected && (
					<div className={styles["github-modal__body"]}>
						<h2 className={styles["github-modal__title"]}>Confirm connection</h2>
						<p className={styles["github-modal__p"]}>
							seokun will index this repo and map findings to source files.
						</p>
						<div className={styles["github-modal__card"]}>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Repository</span>
								<span className={styles["github-modal__card-r-mono"]}>
									{selected.owner}/{selected.name}
								</span>
							</div>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Branch</span>
								<div className={styles["github-modal__branches"]}>
									{branchesError && <span>{branchesError}</span>}
									{!branchesError && branches === null && <span>Loading…</span>}
									{(branches ?? []).map((b) => (
										<button
											key={b}
											type="button"
											className={[
												styles["github-modal__branch"],
												branch === b ? styles["github-modal__branch--active"] : "",
											]
												.filter(Boolean)
												.join(" ")}
											onClick={() => setBranch(b)}
										>
											<IconBranch size={11} stroke={1.8} />
											{b}
										</button>
									))}
								</div>
							</div>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Access</span>
								<span className={styles["github-modal__card-r"]}>
									Read code + Open PRs
								</span>
							</div>
						</div>
						<div className={styles["github-modal__foot"]}>
							<Button variant="ghost" size="sm" onClick={() => setStep("list")}>
								← Back
							</Button>
							<Button
								variant="primary"
								size="sm"
								disabled={branches === null}
								onClick={submitConfirm}
								leftIcon={<IconCheck size={13} stroke={2.4} />}
							>
								Connect repository
							</Button>
						</div>
					</div>
				)}

				{step === "manage" && repo && (
					<div className={styles["github-modal__body"]}>
						<h2 className={styles["github-modal__title"]}>Connected to GitHub</h2>
						<p className={styles["github-modal__p"]}>
							Findings are mapped to source. You can switch branches or disconnect.
						</p>
						<div className={styles["github-modal__card"]}>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Repository</span>
								<span className={styles["github-modal__card-r-mono"]}>
									{repo.owner}/{repo.name}
								</span>
							</div>
							<div className={styles["github-modal__card-row"]}>
								<span className={styles["github-modal__card-l"]}>Branch</span>
								<div className={styles["github-modal__branches"]}>
									{branchList.map((b) => (
										<button
											key={b}
											type="button"
											className={[
												styles["github-modal__branch"],
												branch === b ? styles["github-modal__branch--active"] : "",
											]
												.filter(Boolean)
												.join(" ")}
											onClick={() => {
												setBranch(b);
												onConfirm({ ...repo, branch: b });
											}}
										>
											<IconBranch size={11} stroke={1.8} />
											{b}
										</button>
									))}
								</div>
							</div>
						</div>
						<div className={styles["github-modal__foot"]}>
							<Button variant="ghost" size="sm" onClick={disconnect}>
								Disconnect
							</Button>
							<Button size="sm" onClick={() => setStep("list")}>
								Change repo
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 4: Commit (Tasks 11 + 12 together)**

```bash
git add src/components/github-modal/github-modal.tsx src/lib/mock-data.ts
git commit -m "feat(modal): replace mock data with real GitHub APIs"
```

---

### Task 13: Home-screen integration — handle `?gh=…` query params

**Files:**
- Modify: `src/components/home-screen/home-screen.tsx`

- [ ] **Step 1: Add the query-param effect**

In `home-screen.tsx`, immediately after the existing `useEffect` that loads `repo` from localStorage (around line 30), insert this new effect:

```ts
useEffect(() => {
	if (typeof window === "undefined") return;
	const params = new URLSearchParams(window.location.search);
	const gh = params.get("gh");
	if (!gh) return;

	if (gh === "connected") {
		setGhOpen(true);
	} else if (gh === "error") {
		const reason = params.get("reason");
		const messages: Record<string, string> = {
			denied: "GitHub authorization was cancelled.",
			state: "Authorization state mismatch. Please try again.",
			exchange: "Couldn't exchange the GitHub code. Please try again.",
			scope: "Required scope (repo) was not granted.",
		};
		window.alert(messages[reason ?? ""] ?? "GitHub authorization failed.");
	}

	const url = new URL(window.location.href);
	url.searchParams.delete("gh");
	url.searchParams.delete("reason");
	window.history.replaceState({}, "", url.toString());
}, []);
```

> `window.alert` is a placeholder — replace with the project's toast/banner component when one exists. For now an alert is fine since there's no toast system in the codebase yet.

- [ ] **Step 2: Pass `initialStep="list"` when opening from `?gh=connected`**

Modify the `<GithubModal ... />` render in `home-screen.tsx`:

```tsx
<GithubModal
	open={ghOpen}
	repo={repo}
	initialStep={ghOpen && !repo ? "list" : undefined}
	onClose={() => setGhOpen(false)}
	onConfirm={(r) => {
		setRepo(r);
		setGhOpen(false);
	}}
	onDisconnect={() => {
		setRepo(null);
		setGhOpen(false);
	}}
/>
```

(If the existing `<GithubModal />` invocation doesn't match this shape exactly, preserve its other props and only add `initialStep`.)

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/home-screen/home-screen.tsx
git commit -m "feat(home): handle ?gh=connected and ?gh=error query params"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke test**

In a separate terminal:
```bash
npm run dev
```

In a browser:
1. Open `http://localhost:3000` — should render with no "Connected" badge.
2. Click "Connect GitHub" → "Authorize on GitHub" → consent on github.com.
3. After redirect, modal should re-open at the repo-list step with your real repos.
4. Pick a repo → Continue → branch list populates with the repo's real branches.
5. Click "Connect repository" → modal closes, the top-nav shows the repo as connected.
6. Re-open the modal (now in `manage` step) → click "Disconnect" → modal returns to `auth` step.
7. Re-authorize, then in github.com/settings/applications revoke the grant. Reload the page and open the modal — clicking through should land back at `auth` step with no errors in the console.

- [ ] **Step 6: Final commit if any lint/format auto-fixes**

```bash
git status
# only commit if there are unexpected uncommitted changes
```

---

## Out of scope (deferred — do not implement)

- Framework detection (`Repo.framework` left undefined)
- Server-side `oauthApp.deleteAuthorization` on disconnect
- Multi-account / org switching
- Real repo indexing / file counts (the "● Indexed · 184 files" line is intentionally removed)
- Refresh tokens / expiring user tokens
- Webhooks
- A toast / banner component to replace the `window.alert` in Task 13 (separate UI task)
