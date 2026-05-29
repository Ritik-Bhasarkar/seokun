# Deploying seokun

seokun is a Next.js app **plus** a real Chromium browser launched on every audit. That second part is what makes deploy non-obvious — most Node-friendly hosts don't accept a 170 MB browser binary in a function bundle. This doc covers what works, what doesn't, and how to ship.

## TL;DR

- **For local dev / demos:** `npm run dev`. Nothing else.
- **For production:** deploy to a container host (Railway, Render, Fly.io). One service, one Dockerfile, done.
- **Don't deploy the audit route to Vercel.** Everything else on Vercel is fine.

## Why not Vercel / serverless

Vercel functions (and Netlify Functions, Cloudflare Workers, AWS Lambda, etc.) are short-lived sandboxes optimised for sub-second responses. The audit engine fights every assumption in that model:

| Constraint | What seokun needs |
|---|---|
| **Bundle size** ~250 MB cap | Chromium alone is ~170 MB. With deps the bundle blows the cap. |
| **No persistent filesystem** outside `/tmp` (and `/tmp` is wiped per invocation) | Playwright expects Chromium installed at `~/.cache/ms-playwright/...` and re-launchable. |
| **Execution time** default 10s; up to 60-90s on paid plans | A Lighthouse run + `networkidle` wait on a slow site can run 15-30s. |
| **Cold start per request** | Spinning up Chromium adds ~1-2s to every cold call. |

The OAuth routes, MCP routes, MCP token endpoints, and the home screen are all serverless-friendly. **Only `/api/audit` needs the container host.**

## Recommended: single container on Railway

This is the simplest path — one app, one URL, one place to manage.

### Prereqs

- A Railway account at [railway.app](https://railway.app)
- This repo pushed to GitHub
- A GitHub OAuth App (we'll point its callback URL at the deployed domain after the first deploy)

### 1. Create a `Dockerfile` at the repo root

```dockerfile
FROM node:20-bookworm-slim

# Playwright needs these system libs for Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk-bridge2.0-0 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libpango-1.0-0 \
    libcairo2 libcups2 libdrm2 libxshmfence1 libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Install Chromium for Playwright at build time so it's baked into the image
RUN npx playwright install chromium

RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
```

### 2. Push to a new GitHub repo (if you haven't)

Railway pulls from GitHub.

### 3. Create the Railway project

1. `New Project` → `Deploy from GitHub repo` → pick this repo
2. Railway autodetects the `Dockerfile`
3. Add env vars under **Variables**:
   - `GITHUB_CLIENT_ID` — from your OAuth App
   - `GITHUB_CLIENT_SECRET` — from your OAuth App
   - `SESSION_SECRET` — `openssl rand -hex 32` output
   - `MCP_TOKEN_SECRET` — `openssl rand -hex 32` output (different value from `SESSION_SECRET`)
   - `APP_URL` — `https://<your-railway-subdomain>.up.railway.app` (set this after the first deploy gives you the URL, then redeploy)
4. Hit **Deploy**. First build takes ~5 min (mostly Chromium download).

### 4. Update the GitHub OAuth App callback URL

In github.com/settings/developers → your OAuth App → **Authorization callback URL** → set to `https://<your-railway-subdomain>.up.railway.app/api/auth/github/callback`. Save.

### 5. Set `APP_URL` and redeploy

Add `APP_URL=https://<your-railway-subdomain>.up.railway.app` under Railway Variables and trigger a redeploy. The env var must match the GitHub OAuth callback URL exactly for OAuth to work.

### 6. Smoke test

```bash
curl -X POST https://<your-railway-subdomain>.up.railway.app/api/audit \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Expected: 200 with a valid AuditReport in ~10-15s.

## Alternative: Render

Same shape, slightly different setup.

1. `New` → `Web Service` → connect the repo
2. **Environment:** Docker
3. **Dockerfile path:** `./Dockerfile`
4. **Plan:** Starter or higher (free tier doesn't have enough RAM to run Chromium reliably)
5. Add the same env vars as Railway (Step 3 above)
6. Deploy
7. Update GitHub OAuth callback to the Render URL; set `APP_URL`; redeploy

## Alternative: Fly.io

```bash
fly launch       # auto-detects Dockerfile
fly secrets set GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... \
                SESSION_SECRET=$(openssl rand -hex 32) \
                MCP_TOKEN_SECRET=$(openssl rand -hex 32) \
                APP_URL=https://<your-app>.fly.dev
fly deploy
```

Update the GitHub OAuth callback URL once the Fly domain is live.

## Split deploy (advanced — Vercel for the app, Railway for the audit engine)

Only worth doing if you specifically want Vercel's edge CDN for the marketing pages.

### Architecture

```
Browser ── https://seokun.app  (Vercel)
              │
              │ proxies /api/audit
              ▼
         https://audit.seokun.app  (Railway — runs only the audit engine)
```

### Steps (sketch)

1. Extract `src/lib/audit/` and `src/app/api/audit/route.ts` into a separate tiny Next.js (or plain Node) service.
2. Deploy that service to Railway following the same Dockerfile recipe above.
3. In the main app, replace the `/api/audit` route with a proxy that forwards to the Railway URL. Keep the same `AuditInputSchema` validation so failures surface early.
4. The proxy route can live on Vercel — it's just a `fetch`.

You will still need to:
- Share `SESSION_SECRET` between both services if the audit service needs to read the user's GitHub token from the session cookie. (Or have the proxy pass the token in the request body — simpler.)
- Update `APP_URL` for both services correctly.
- Update GitHub OAuth callback URL to point at the main (Vercel) host.

If you don't have a strong reason for this split, **skip it**. One Railway container is operationally much simpler.

## Environment variables reference

| Var | Required by | Local | Production |
|---|---|---|---|
| `GITHUB_CLIENT_ID` | OAuth flow | `.env.local` | host secrets |
| `GITHUB_CLIENT_SECRET` | OAuth flow | `.env.local` | host secrets |
| `SESSION_SECRET` | iron-session | 32+ chars | 32+ chars, different per env |
| `MCP_TOKEN_SECRET` | MCP token signing | 32+ chars | 32+ chars, different per env |
| `APP_URL` | OAuth callback + MCP URL building | `http://localhost:3000` | `https://your-domain` |

Rotate `SESSION_SECRET` and `MCP_TOKEN_SECRET` whenever a token leaks. `SESSION_SECRET` rotation logs everyone out; `MCP_TOKEN_SECRET` rotation invalidates every issued MCP token.

## Operational notes

- **Memory:** Chromium needs ~512 MB RAM per concurrent audit. Pick a plan with at least 1 GB RAM if you expect more than one user at a time.
- **Concurrency:** Each audit launches its own browser. The container can run several concurrently but RAM scales linearly. For a public-beta launch, consider rate-limiting at the route.
- **Cold-start:** Chromium's first launch in a fresh container takes ~2-3s. Subsequent launches in the same container reuse the binary.
- **Logs:** Audit failures log to stdout via `console.error("[audit] ...")`. The Railway / Render / Fly log UIs surface those directly.
