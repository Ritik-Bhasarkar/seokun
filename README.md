# seokun

seokun is a Next.js application for auditing websites and their React source
code. It combines Lighthouse and Cheerio checks for a live URL with optional
GitHub-backed static analysis of a repository. Audit results are presented in a
dashboard and can be exposed to Claude Desktop or Claude Code through MCP.

## What it does

- Audits a URL in mobile or desktop mode.
- Reports Lighthouse scores for SEO, performance, accessibility, and best
  practices.
- Checks rendered HTML for titles, metadata, Open Graph tags, and image alt
  text.
- Connects to GitHub through OAuth and reads a selected repository's source.
- Runs JSX/TSX checks for accessibility, SEO, metadata, headings, links,
  imports, and common interaction issues.
- Displays findings with severity, recommendations, and fix hints.
- Exposes audit operations to Claude through a signed, per-user MCP bearer
  token.

The project is currently a prototype. Browser-visible reports are stored in
`localStorage`, and the server-side audit/MCP store is an in-memory map, so
data is not durable across browsers, deployments, or process restarts.

## Requirements

- Node.js 20 or newer
- npm
- Chromium dependencies for Playwright when running outside the provided
  Docker image
- A GitHub OAuth App if GitHub repository audits or Claude integration are
  needed

## Getting started

Install dependencies:

```bash
npm ci
```

Create `.env.local` in the project root:

```dotenv
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
SESSION_SECRET=replace_with_at_least_32_random_characters
MCP_TOKEN_SECRET=replace_with_a_different_32_plus_character_secret
APP_URL=http://localhost:3000
```

Generate strong secrets, for example:

```bash
openssl rand -hex 32
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A URL audit can run
without GitHub credentials, but the environment variables must still be
present because the server validates them when authentication-related code is
used.

For local browser audits, install Chromium if it is not already available:

```bash
npx playwright install chromium
```

## GitHub OAuth setup

Create an OAuth App in GitHub and set its authorization callback URL to:

```text
http://localhost:3000/api/auth/github/callback
```

The application uses the `repo` OAuth scope. After connecting, the UI can list
repositories and branches, and a selected repository can be included with an
audit to enable source checks.

The OAuth flow is implemented by these routes:

| Route | Purpose |
| --- | --- |
| `GET /api/auth/github/start` | Starts OAuth and creates a CSRF state cookie |
| `GET /api/auth/github/callback` | Validates state, exchanges the code, and creates the session |
| `POST /api/auth/github/logout` | Clears the GitHub session |
| `GET /api/github/repos` | Lists repositories for the authenticated user |
| `GET /api/github/repos/:owner/:name/branches` | Lists repository branches |

## Audit workflow

1. The browser sends an audit request to `POST /api/audit`.
2. The server validates the input with Zod.
3. For a URL, a preflight request checks reachability before Chromium starts.
4. Playwright renders the page and Lighthouse evaluates it.
5. Cheerio runs additional checks against the rendered HTML.
6. If a GitHub repository is supplied, up to 30 `.tsx`/`.jsx` files are read,
   parsed with Babel, and inspected by source checks.
7. The combined report is schema-validated and returned to the browser.
8. The browser stores the report locally and navigates to `/audit/:id`.

Example request:

```bash
curl -X POST http://localhost:3000/api/audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","formFactor":"mobile"}'
```

The request must contain either `url`, `repo`, or both:

```json
{
  "url": "https://example.com",
  "formFactor": "desktop",
  "repo": {
    "owner": "example",
    "name": "website"
  }
}
```

`/api/audit` may take up to 90 seconds because it launches Chromium and runs
Lighthouse. URL validation failures return `400`; repository audits require a
GitHub session and return `401` when one is missing; unreachable hosts return
`502`.

## Claude / MCP

After connecting GitHub, choose **Connect Claude** in the top navigation and
generate a connection token. The UI provides configuration for Claude Desktop
and Claude Code.

The MCP endpoint is:

```text
POST /api/mcp
Authorization: Bearer seokun_mcp.<payload>.<signature>
```

The server currently exposes these tools:

| Tool | Purpose |
| --- | --- |
| `list_audits` | List the current user's recent audits |
| `get_audit` | Retrieve an audit by ID |
| `get_finding` | Retrieve a finding by ID |
| `run_audit` | Queue an audit and return its ID |

MCP tokens are stateless HMAC-SHA256 tokens signed with `MCP_TOKEN_SECRET`.
The audit store is currently in memory, and issued tokens are not individually
revocable; rotate `MCP_TOKEN_SECRET` to invalidate all of them.

See [docs/claude-connect.md](docs/claude-connect.md) for client-specific
configuration and troubleshooting.

## Useful commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest test suite once |
| `npm run test:watch` | Run Vitest in watch mode |

## Project structure

```text
src/
├── app/                    Next.js pages and API route handlers
│   ├── api/audit/           Synchronous audit endpoint
│   ├── api/auth/github/     GitHub OAuth routes
│   ├── api/github/          Repository and branch routes
│   └── api/mcp/             MCP endpoint and token routes
├── components/              UI components and SCSS modules
└── lib/
    ├── audit/               Runtime, Lighthouse, HTML, and source checks
    ├── audit-store.ts       In-memory MCP audit records
    ├── github.ts             Octokit and OAuth helpers
    ├── mcp-server.ts         MCP tool registration
    ├── session.ts             Encrypted cookie session helpers
    └── env.ts                 Lazy Zod environment validation
docs/
├── architecture.md           Detailed subsystem and data-flow documentation
├── deployment.md             Container deployment guidance
└── claude-connect.md         Claude connection instructions
```

## Deployment

The audit route needs a real Chromium process and is best deployed in the
provided Docker image on Railway, Render, Fly.io, or another container host.
The Dockerfile uses the Playwright image with Chromium and its system
dependencies already installed.

See [docs/deployment.md](docs/deployment.md) for environment configuration,
container deployment, resource requirements, and the optional split-deployment
architecture.

## Development notes

- Server-only modules are marked with `server-only` where they handle secrets,
  cookies, GitHub tokens, or browser execution.
- Session cookies are encrypted with `iron-session` and use `SESSION_SECRET`.
- Audit reports are validated with Zod before they leave the audit engine.
- Lighthouse and Playwright are configured as server externals in
  `next.config.ts` because they rely on native and dynamic runtime modules.
- Tests live beside the modules they cover and use Vitest.

## License

No license file is currently included in the repository.
