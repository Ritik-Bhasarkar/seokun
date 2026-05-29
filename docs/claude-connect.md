# Connecting Claude to seokun

seokun runs an [MCP](https://modelcontextprotocol.io) server. Once connected,
Claude (Desktop or Code) can list your audits, inspect findings, and request
new audits — all from the chat.

## Prerequisites

- A seokun account with a connected GitHub repo.
- Claude Desktop **or** Claude Code installed.

## Steps

### 1. Generate a connection token

In seokun, click **Connect Claude** in the top nav. If you haven't connected
GitHub yet, you'll be prompted to do that first.

Click **Generate connection token**. A token starting with `seokun_mcp.` will
appear, alongside config snippets for Claude Desktop and Claude Code.

> The token is tied to your account. Anyone with the token can read your
> audits via MCP — treat it like a password.

### 2. Add seokun to your Claude client

#### Claude Desktop

1. Open `~/Library/Application Support/Claude/claude_desktop_config.json`
   (macOS) or the equivalent on your platform.
2. Paste the snippet shown in the modal under the `mcpServers` key:

   ```jsonc
   {
     "mcpServers": {
       "seokun": {
         "url": "https://your-seokun-instance/api/mcp",
         "headers": { "Authorization": "Bearer seokun_mcp.<TOKEN>" }
       }
     }
   }
   ```

3. Restart Claude Desktop.
4. In a new chat, type "What tools do you have from seokun?" — Claude should
   list 4 tools.

#### Claude Code

Run the command shown in the modal:

```bash
claude mcp add seokun https://your-seokun-instance/api/mcp \
  --header "Authorization: Bearer seokun_mcp.<TOKEN>"
```

Verify with `claude mcp list`.

## Available tools

| Tool | Purpose | Status |
|---|---|---|
| `list_audits` | List your recent audits | Stub (returns empty list) |
| `get_audit` | Get details for one audit | Stub (returns not_found) |
| `get_finding` | Get one finding with source mapping + diff | Stub (returns not_found) |
| `run_audit` | Queue a new audit for a URL | Stub (no engine yet) |

> All tools are currently backed by an in-memory stub — they respond with
> empty or `not_found` results. The audit engine ships in a separate release;
> the wire protocol won't change.

## Troubleshooting

**Claude says "no tools available"** — Check that the URL in your config
points to a reachable seokun instance and the `Authorization` header is
present.

**MCP requests return 401** — Your token is invalid or the seokun server
rotated its `MCP_TOKEN_SECRET`. Generate a new token from the **Connect
Claude** modal and update your config.

**Tool returns empty / not_found** — Expected for now. The audit engine
is the next milestone.

## Revoking access

Click **Disconnect** in the Connect Claude modal. This removes the token
from the seokun UI, but the token remains valid on the server until
`MCP_TOKEN_SECRET` is rotated. To force-revoke immediately, contact the team.
