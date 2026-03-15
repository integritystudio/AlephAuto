# MCP Servers

Active MCP servers and plugins for the AlephAuto project.

**Updated:** 2026-03-14 | **Config:** `.mcp.json` (project), `~/.claude/.mcp.json` (global), `~/.claude/settings.json` (plugins)

---

## Project Servers (4) — `.mcp.json`

| Server | Transport | Command | Purpose |
|--------|-----------|---------|---------|
| **sentry-mcp** | STDIO | `npx -y @sentry/mcp-server@latest` | Error tracking, performance monitoring, AI root cause analysis |
| **redis-mcp** | STDIO | `uvx --from redis-mcp-server@latest redis-mcp-server --url redis://localhost:6379/0` | Queue management, scan result caching |
| **taskqueue-mcp** | STDIO | `npx -y taskqueue-mcp` | AI task management, workflow structuring with approval checkpoints |
| **filesystem-mcp** | STDIO | `npx -y @modelcontextprotocol/server-filesystem /Users/alyshialedlie/code/jobs` | Scoped file access (project directory only) |

### Notes

- **sentry-mcp**: Requires `SENTRY_ACCESS_TOKEN` env var. Set via Doppler: `doppler secrets get SENTRY_API_TOKEN --plain`.
- **redis-mcp**: Requires Redis running on `localhost:6379`. Start with `brew services start redis`.
- **filesystem-mcp**: Scoped to project root — cannot access files outside `/Users/alyshialedlie/code/jobs`.

---

## Global Servers (5) — `~/.claude/.mcp.json`

| Server | Transport | Command | Purpose |
|--------|-----------|---------|---------|
| **webresearch** | STDIO | `npx -y @mzxrai/mcp-webresearch@latest` | Web page visits, screenshots (`search_google` blocked — CAPTCHA) |
| **discord** | STDIO | `doppler run -- npx -y @missionsquad/mcp-discord` | Send/read Discord messages |
| **cloudflare** | STDIO | `doppler run -- npx -y @cloudflare/mcp-server-cloudflare run <account_id>` | Workers, KV, R2, D1, config, domains, env, secrets, routes, zones, bindings (filtered via `mcp-filter`) |
| **cloudflare-workers** | STDIO | `npx -y mcp-remote https://workers.mcp.cloudflare.com/mcp` | Cloudflare Workers remote MCP |
| **gmail** | STDIO | `doppler run -- env PORT=3002 npx -y @shinzolabs/gmail-mcp` | Read, send, and manage emails |

### Notes

- **webresearch**: Wrapped with `mcp-filter` to deny `search_google` (fails with CAPTCHA). Use `visit_page` and `take_screenshot` only.
- **cloudflare**: Wrapped with `mcp-filter` allow-pattern restricting to `worker_*`, `kv_*`, `r2_*`, `d1_*`, `wrangler_config_*`, `domain_*`, `env_var_*`, `secret_*`, `route_*`, `zones_*`, `service_binding_*`.
- **discord**, **cloudflare**, **gmail**: Auth via Doppler (`integrity-studio` / `dev`).

---

## Plugins with MCP Servers (2)

| Plugin | Source | Purpose |
|--------|--------|---------|
| **repomix-mcp** | `repomix` marketplace | Codebase packing, analysis, skill generation (`pack_codebase`, `pack_remote_repository`, `generate_skill`, `grep_repomix_output`) |
| **chrome-devtools-mcp** | `chrome-devtools-plugins` marketplace | Browser automation — `list_pages`, `navigate_page`, `new_page`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `click` |

Plugin config: `~/.claude/settings.json` → `enabledPlugins`

---

## Archived Servers (7)

Inactive servers kept in `~/.claude/.mcp.json` under `_archived`:

| Server | Reason |
|--------|--------|
| **porkbun** | DNS management (not currently needed) |
| **mindpilot** | Removed |
| **supabase** | HTTP MCP — database queries, migrations, Edge Functions |
| **auth0** | Application/user management |
| **cloudflare-observability** | Remote MCP — observability |
| **cloudflare-ai-gateway** | Remote MCP — AI gateway |
| **cloudflare-dns** | Remote MCP — DNS analytics |
| **github** | Repo management, issues, PRs (using `gh` CLI instead) |

To restore: move the entry from `_archived` back to `mcpServers` in `~/.claude/.mcp.json`.

---

## Managing Servers

```bash
# List configured servers
claude mcp list

# Add server (STDIO)
claude mcp add --transport stdio <name> -- <command> [args]

# Remove server
claude mcp remove <name>

# View tools for a server
claude mcp tools <server-name>
```
