# Duplicate Detection MCP Server

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "Duplicate Detection MCP Server",
  "description": "Model Context Protocol server for duplicate code detection and consolidation.",
  "dateModified": "2026-01-19T02:09:57.686Z",
  "inLanguage": "en-US"
}
</script>


Model Context Protocol server for duplicate code detection and consolidation.

## Overview

This MCP server exposes duplicate detection capabilities to Claude Code, enabling AI-assisted code analysis and consolidation.

## Installation

### 1. Install Dependencies

```bash
cd mcp-servers/duplicate-detection
npm install
```

### 2. Add to Claude Code Configuration

Add to `~/.claude/mcp_settings.json`:

```json
{
  "mcpServers": {
    "duplicate-detection": {
      "command": "node",
      "args": ["/Users/alyshialedlie/code/jobs/mcp-servers/duplicate-detection/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 3. Restart Claude Code

```bash
# Restart Claude Code to load the new MCP server
```

## Available Tools

### scan_repository

Scan a single repository for duplicate code.

**Parameters:**
- `repositoryPath` (string, required): Absolute path to repository
- `useCache` (boolean, optional): Use cached results if available (default: true)
- `forceRefresh` (boolean, optional): Force fresh scan, ignore cache (default: false)

**Returns:**
- Scan ID
- Metrics (duplicates, suggestions, lines)
- Top 5 consolidation suggestions
- Cache status

**Example:**

```javascript
{
  "repositoryPath": "/Users/username/code/myproject",
  "useCache": true
}
```

### scan_multiple_repositories

Perform inter-project scan across multiple repositories.

**Parameters:**
- `repositoryPaths` (array, required): Array of repository paths
- `groupName` (string, optional): Name for this repository group

**Returns:**
- Scan ID
- Cross-repository duplicate metrics
- Top duplicates across repositories

**Example:**

```javascript
{
  "repositoryPaths": [
    "/Users/username/code/project-a",
    "/Users/username/code/project-b"
  ],
  "groupName": "internal-tools"
}
```

### get_scan_results

Retrieve results from a completed scan.

**Parameters:**
- `scanId` (string, required): Scan ID from previous scan
- `format` (string, optional): `json` or `summary` (default: summary)

**Returns:**
- Full or summary scan results

### list_repositories

List all configured repositories.

**Parameters:**
- `enabledOnly` (boolean, optional): Show only enabled (default: true)
- `priority` (string, optional): Filter by priority (critical, high, medium, low)

**Returns:**
- List of repositories with metadata

### get_suggestions

Get consolidation suggestions for duplicates.

**Parameters:**
- `scanId` (string, required): Scan ID
- `minImpactScore` (number, optional): Minimum impact score (default: 50)
- `strategy` (string, optional): Filter by strategy (local_util, shared_package, mcp_server, autonomous_agent)

**Returns:**
- Filtered list of consolidation suggestions

### get_cache_status

Check if repository scan is cached.

**Parameters:**
- `repositoryPath` (string, required): Repository path

**Returns:**
- Cache status and metadata

### invalidate_cache

Invalidate cached scan results.

**Parameters:**
- `repositoryPath` (string, required): Repository path

**Returns:**
- Number of cache entries deleted

### get_repository_groups

List configured repository groups for inter-project scanning.

**Parameters:**
- `enabledOnly` (boolean, optional): Show only enabled (default: true)

**Returns:**
- List of repository groups

## Available Resources

### scan://recent

List of recent duplicate detection scans (last 10).

### scan://config

Current repository scanning configuration.

### scan://stats

Duplicate detection scanner statistics including cache stats.

## Usage Examples

### Scan a Repository

```
Use the duplicate-detection MCP server to scan /Users/username/code/myproject for duplicates.
```

### Find Cross-Repository Duplicates

```
Scan these repositories for cross-repository duplicates:
- /Users/username/code/project-a
- /Users/username/code/project-b
```

### Get High-Impact Suggestions

```
Get all consolidation suggestions with impact score > 75 from scan abc123.
```

### Check Cache Status

```
Check if /Users/username/code/myproject has cached scan results.
```

## Architecture

```
Claude Code
     │
     ├─ MCP Client
     │
     ▼
[MCP Server]
     │
     ├─ Tools (8)
     │  ├─ scan_repository
     │  ├─ scan_multiple_repositories
     │  ├─ get_scan_results
     │  ├─ list_repositories
     │  ├─ get_suggestions
     │  ├─ get_cache_status
     │  ├─ invalidate_cache
     │  └─ get_repository_groups
     │
     ├─ Resources (3)
     │  ├─ scan://recent
     │  ├─ scan://config
     │  └─ scan://stats
     │
     ▼
[Duplicate Detection Pipeline]
     │
     ├─ Cached Scanner
     ├─ Inter-Project Scanner
     ├─ Configuration Loader
     └─ Report Coordinator
```

## Error Handling

All tool calls return structured responses:

**Success:**
```json
{
  "success": true,
  "scan_id": "...",
  "metrics": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message",
  "stack": "..."
}
```

## Logging

All MCP server operations are logged using the component logger:

- Tool calls
- Resource reads
- Errors and warnings

Logs are sent to Sentry for monitoring.

## Development

### Testing

```bash
# Test the MCP server manually
echo '{"method":"tools/list"}' | node index.js
```

### Debugging

Set environment variable for debug logging:

```bash
NODE_ENV=development node index.js
```

## Security

- All file paths must be absolute
- Repository paths are validated before scanning
- No shell command injection vectors
- Read-only operations for most tools

## Performance

- Scans use caching by default (30-day TTL)
- Cache keys based on Git commit hashes
- Concurrent repository scanning (max 3)
- Results returned as streaming JSON

## License

MIT
