# GitHub OAuth Connection — Design

**Date:** 2026-05-27
**Status:** Draft, awaiting user review
**Owner:** Ritik

## Goal

Replace the mocked `GH_REPO_LIST` / `DEMO_REPO` data in `GithubModal` with a real GitHub OAuth web flow. After connecting, the modal lists the signed-in user's repositories and their branches via the GitHub REST API. Tokens are stored server-side in an encrypted HttpOnly cookie.

## Non-goals

- Framework detection for connected repos (e.g. "Next.js 14")
- Server-side revocation of the OAuth grant on disconnect
- Multi-account or org switching
- Real repo indexing or file counts
- Refresh tokens / expiring user tokens
- Webhooks

## Decisions (locked in during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Auth flow | OAuth web flow | Best UX, scoped per-user, standard pattern |
| Scopes | `repo` | Matches modal copy ("Read code + Open PRs"); covers public + private |
| Token storage | HttpOnly encrypted cookie via `iron-session` | No DB needed; token never reaches client JS |
| OAuth library | `@octokit/oauth-app` + `@octokit/rest` | Official, blessed-by-octokit handshake helper |
| OAuth App | New, created as part of setup | None exists yet |

## Architecture

### Dependencies (new, runtime)

- `@octokit/oauth-app` — authorize-URL builder + code → token exchange
- `@octokit/rest` — REST client used inside API routes only
- `iron-session` — seal / unseal session cookie

### Environment variables (required at startup, zod-validated)

| Var | Purpose |
|---|---|
| `GITHUB_CLIENT_ID` | From the OAuth App |
| `GITHUB_CLIENT_SECRET` | From the OAuth App |
| `SESSION_SECRET` | 32+ chars, used by iron-session |
| `APP_URL` | e.g. `http://localhost:3000`, used to build absolute callback URLs |

### File layout

> Next.js 16 App Router conventions. Per `AGENTS.md`, the exact route handler / cookies APIs must be re-confirmed against `node_modules/next/dist/docs/` before writing implementation code — this is not the Next.js in training data.

```
src/
  app/api/auth/github/
    start/route.ts          GET → 302 to github.com/login/oauth/authorize
    callback/route.ts       GET → exchange code, seal cookie, 302 back to /
    logout/route.ts         POST → clear cookie
  app/api/github/
    repos/route.ts          GET → user's repos via Octokit
    repos/[owner]/[name]/branches/route.ts  GET → branches list
  lib/
    env.ts                  zod-validated env at startup
    session.ts              iron-session config + getSession/setSession/clearSession
    github.ts               oauthApp instance + octokitForSession() factory
    types.ts                (existing) — extend RepoListItem to match GitHub shape
  components/github-modal/
    github-modal.tsx        rewritten: real fetches + redirect to /api/auth/github/start
```

### Removed

- `GH_REPO_LIST` and `DEMO_REPO` exports from `src/lib/mock-data.ts`
- `RECENT_AUDITS` from the same file is unrelated to GitHub and stays where it is. The file shrinks but is not deleted.

## Auth flow

### OAuth handshake (once per user / cookie lifetime)

```
User clicks "Authorize on GitHub"  (in github-modal)
         │
         ▼
window.location.href = "/api/auth/github/start"
         │
         ▼  [our server]
GET /api/auth/github/start
  · generate random `state` (CSRF), store in short-lived signed cookie
  · build authorize URL via oauthApp.getWebFlowAuthorizationUrl({ state, scopes: ["repo"] })
  · 302 → https://github.com/login/oauth/authorize?...
         │
         ▼  [github.com]
User consents on github.com
         │
         ▼
302 → http://localhost:3000/api/auth/github/callback?code=…&state=…
         │
         ▼  [our server]
GET /api/auth/github/callback
  · verify `state` matches cookie, then clear state cookie
  · oauthApp.createToken({ code }) → { authentication: { token, scopes, … } }
  · iron-session: seal { githubToken, login, avatarUrl, connectedAt } into "seokun_session"
  · 302 → "/?gh=connected"
         │
         ▼  [browser]
Home page renders. Effect notices ?gh=connected → opens GithubModal at step="list"
```

### Authenticated API calls

```
Modal: fetch("/api/github/repos")
         │
         ▼  [our server]
GET /api/github/repos
  · session = await getSession(); 401 if no token
  · const octokit = new Octokit({ auth: session.githubToken })
  · octokit.rest.repos.listForAuthenticatedUser({ per_page: 100, sort: "pushed" })
  · map → RepoListItem[], return JSON
```

Branches use `octokit.rest.repos.listBranches({ owner, repo })` the same way.

### Logout / disconnect

```
Modal "Disconnect" → POST /api/auth/github/logout → clearSession() → modal re-renders to step="auth"
```

Cookie is cleared locally only — the OAuth grant on GitHub's side remains until the user revokes it from their GitHub settings. (Adding server-side revocation is a ~10-line follow-up using `oauthApp.deleteAuthorization`.)

## Session / cookie shape

### Cookie 1 — `seokun_session` (auth session)

```ts
type Session = {
  githubToken: string;      // OAuth access token, scope=repo
  login: string;            // GitHub login for display
  avatarUrl: string;        // for header / modal
  connectedAt: number;      // epoch ms
};
```

Attributes: `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`, no explicit `Max-Age` (session cookie). Sealed by iron-session with `SESSION_SECRET`.

### Cookie 2 — `seokun_oauth_state` (CSRF, short-lived)

```ts
type OAuthState = { state: string; createdAt: number };
```

Attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=600` (10 min). Set by `/start`, read + cleared by `/callback`. State mismatch or missing cookie → 400, no token exchange attempted.

### Helper API (`src/lib/session.ts`)

```ts
export async function getSession(): Promise<Session | null>
export async function setSession(s: Session): Promise<void>
export async function clearSession(): Promise<void>
// + matching helpers for the state cookie
```

All server-only (`import "server-only"` at the top).

## Client-side changes — `github-modal.tsx`

### Removed

- Imports of `GH_REPO_LIST`, `DEMO_REPO` (those exports removed from `mock-data.ts`)
- Fake `setTimeout(...1100)` in `startAuth`
- `BRANCHES` constant
- The fake "● Indexed · 184 files" line in `step="manage"` is removed (no real indexing exists yet)

### Added state

```ts
const [repos, setRepos] = useState<RepoListItem[] | null>(null);
const [reposError, setReposError] = useState<string | null>(null);
const [branches, setBranches] = useState<string[] | null>(null);
const [branchesError, setBranchesError] = useState<string | null>(null);
```

### Changed flows

- `startAuth` → `window.location.href = "/api/auth/github/start"` (full nav, not fetch)
- On entering `step="list"`: fetch `/api/github/repos` once; skeleton while `repos === null`; error state if `reposError`
- When `selected` changes on the confirm step: fetch branches for that repo
- `submitConfirm`: use the selected repo's real `pushed_at`; leave `framework` undefined
- On `step="manage"`: `repo.branches` already persisted, so no extra fetch
- Disconnect: `await fetch("/api/auth/github/logout", { method: "POST" })` then `onDisconnect()`

### Home-screen integration

`home-screen.tsx` gets one new `useEffect`: read `URLSearchParams.get("gh")`. If `"connected"` → open modal at `step="list"` and `replaceState` to strip the query. Same effect handles `"error"` (see Error handling below).

## Error handling

### During OAuth handshake (`/callback`)

| Failure | Response |
|---|---|
| `state` cookie missing or mismatched | 302 → `/?gh=error&reason=state` |
| GitHub returns `error=access_denied` | 302 → `/?gh=error&reason=denied` (user clicked Cancel) |
| `oauthApp.createToken` throws (bad code, network) | 302 → `/?gh=error&reason=exchange` |
| Granted scopes ⊂ requested `repo` | 302 → `/?gh=error&reason=scope` |

Home-screen effect that reads `?gh=connected` also handles `?gh=error&reason=…` — shows a human-readable banner, then strips the query.

### During API calls (`/api/github/*`)

| Condition | Response |
|---|---|
| No session cookie | `401 { error: "unauthorized" }` — modal re-renders to `step="auth"` |
| Octokit throws `401` (token revoked at GitHub) | `clearSession()`, return `401`, modal re-renders to `step="auth"` |
| Octokit throws `403` rate limit | `429 { error: "rate_limited", resetAt }` — modal shows "rate-limited, try again at HH:MM" |
| Octokit throws anything else | `502 { error: "github_unavailable" }` — modal shows generic retry banner |

### At startup

`src/lib/env.ts` parses required env vars with zod; missing or empty values throw immediately so the dev server fails loudly rather than silently breaking OAuth.

## Testing strategy

> The project has no test setup yet. The implementation plan sets up Vitest as step 1 and adds these tests as it goes.

### Unit

- `lib/session.ts` — round-trip seal/unseal with fixed `SESSION_SECRET`
- `lib/env.ts` — throws on missing, parses good values
- GitHub repo → `RepoListItem` mapper — fixture in, expected object out

### Integration

- `/api/auth/github/start` — sets state cookie, redirect URL's `state` query matches the cookie
- `/api/auth/github/callback` — happy path + each error branch above; `@octokit/oauth-app` mocked at module boundary
- `/api/github/repos` — 401 without session; 200 with stubbed Octokit returning fixtures

### Mocking boundary

Mock `@octokit/oauth-app` (token exchange) and `@octokit/rest` (REST calls). Everything else hits real code, including `iron-session`.

### Manual smoke test

The only thing that proves the round-trip works: create the OAuth App locally, `npm run dev`, click through the modal end to end against real github.com.

## Setup checklist (step 0 of the implementation plan)

1. github.com/settings/developers → "New OAuth App"
   - Application name: `seokun (local)`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
2. Copy Client ID; generate Client Secret
3. Create `.env.local`:
   ```
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   SESSION_SECRET=<openssl rand -hex 32>
   APP_URL=http://localhost:3000
   ```
4. Verify `.env.local` is in `.gitignore`

## Open questions for the implementation plan

- Exact Next.js 16 cookies API (`cookies()` from `next/headers` is the App Router pattern, but verify against `node_modules/next/dist/docs/` per AGENTS.md)
