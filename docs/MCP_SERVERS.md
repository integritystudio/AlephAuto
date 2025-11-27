# MCP (Model Context Protocol) Servers

This document provides detailed information about the MCP servers configured for the AlephAuto project, including setup instructions, integration points, and troubleshooting guides.

## Table of Contents

1. [Overview](#overview)
2. [Installed MCP Servers](#installed-mcp-servers)
3. [Server Configuration](#server-configuration)
4. [Integration Points](#integration-points)
5. [Managing MCP Servers](#managing-mcp-servers)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Usage](#advanced-usage)

---

## Overview

Model Context Protocol (MCP) servers provide enhanced AI capabilities for the AlephAuto framework by exposing specialized tools and resources through a standardized protocol.

### What is MCP?

MCP is a protocol that allows AI models to interact with external tools and services. It provides:
- **Standardized Communication**: Consistent interface for tool invocation
- **Type Safety**: Strongly-typed tool parameters and responses
- **Resource Access**: Read/write access to external data sources
- **Event Streaming**: Real-time updates and notifications

### Active MCP Servers (4)

| Server | Status | Transport | Purpose |
|--------|--------|-----------|---------|
| **Sentry MCP** | ⚠️ Needs Auth | HTTP | Error tracking, performance monitoring, root cause analysis |
| **Redis MCP** | ✓ Connected | STDIO | Queue management, scan result caching (30-day TTL) |
| **TaskQueue MCP** | ✓ Connected | STDIO | AI task management, workflow structuring |
| **Filesystem MCP** | ✓ Connected | STDIO | Log file access, report analysis |

---

## Installed MCP Servers

### 1. Sentry MCP (Remote HTTP) ⚠️

**Status:** Configured, requires OAuth authentication

**Connection Details:**
- **URL**: https://mcp.sentry.dev/mcp
- **Transport**: HTTP (Remote)
- **Authentication**: OAuth via Sentry organization

**Purpose:**
Error tracking and performance monitoring integration with Sentry.

**Features:**
- **16+ Tool Calls** for error analysis
  - Search issues by query
  - Get issue details (stack traces, breadcrumbs, tags)
  - Retrieve issue events
  - Fetch project statistics
  - Query performance metrics
  - Get release information

- **Automated Root Cause Analysis** with Seer AI
  - AI-powered error analysis
  - Suggested fixes and solutions
  - Related issues detection
  - Impact assessment

- **Real-time Error Monitoring**
  - Live error stream
  - Alert management
  - Issue assignment and triage
  - Resolution tracking

**Setup Instructions:**

1. **Authenticate with Sentry**
   ```bash
   # MCP server will prompt for OAuth authentication on first use
   claude mcp tools sentry-mcp
   ```

2. **Grant Permissions**
   - Click the OAuth link provided
   - Log in to your Sentry account
   - Authorize the MCP application
   - Grant read access to your organization

3. **Verify Connection**
   ```bash
   # List available tools
   claude mcp tools sentry-mcp

   # Test connection
   # Use a Sentry tool to verify authentication
   ```

**Available Tools:**
- `search_issues` - Search issues by query
- `get_issue` - Get issue details by ID
- `get_issue_events` - Retrieve events for an issue
- `get_project_stats` - Get project statistics
- `get_performance_metrics` - Query performance data
- `get_releases` - List project releases
- `trigger_seer_analysis` - Run AI root cause analysis
- ... and 9 more

**Documentation:**
https://docs.sentry.io/product/sentry-mcp/

---

### 2. Redis MCP ✓

**Status:** Connected to local Redis instance

**Connection Details:**
- **Command**: `uvx --from redis-mcp-server@latest redis-mcp-server --url redis://localhost:6379/0`
- **Transport**: STDIO (Python/uvx)
- **URL**: redis://localhost:6379/0 (database 0)

**Purpose:**
Queue management and scan result caching with Redis data structures.

**Features:**
- **List Operations** for queues and message brokers
  - LPUSH, RPUSH, LPOP, RPOP
  - LRANGE, LLEN
  - Blocking operations (BLPOP, BRPOP)

- **Sorted Sets** for priority queues
  - ZADD, ZREM
  - ZRANGE, ZREVRANGE
  - Score-based ranking

- **Redis Streams** for event management
  - XADD, XREAD, XRANGE
  - Consumer groups
  - Event replay

- **Full Redis Data Structure Support**
  - Strings (GET, SET, INCR, DECR)
  - Hashes (HGET, HSET, HGETALL)
  - Sets (SADD, SMEMBERS, SINTER)
  - JSON (RedisJSON module)
  - HyperLogLog, Bitmaps, Geospatial

**Setup Instructions:**

1. **Install Redis**
   ```bash
   # macOS with Homebrew
   brew install redis

   # Ubuntu/Debian
   sudo apt-get install redis-server

   # Docker
   docker run -d -p 6379:6379 redis:7
   ```

2. **Start Redis Server**
   ```bash
   # macOS with Homebrew
   brew services start redis

   # Ubuntu/Debian
   sudo systemctl start redis-server

   # Docker
   docker start redis
   ```

3. **Verify Redis is Running**
   ```bash
   redis-cli ping  # Should return PONG
   ```

4. **Configure MCP Server**
   ```bash
   # Add to Claude Code MCP configuration
   claude mcp add --transport stdio redis-mcp -- \
     uvx --from redis-mcp-server@latest redis-mcp-server \
     --url redis://localhost:6379/0
   ```

5. **Test Connection**
   ```bash
   # List available tools
   claude mcp tools redis-mcp

   # Test basic operation
   # Use redis_set and redis_get tools
   ```

**Available Tools:**
- `redis_get` - Get value by key
- `redis_set` - Set key-value pair
- `redis_del` - Delete key
- `redis_keys` - List keys by pattern
- `redis_lpush` - Push to list (left)
- `redis_rpush` - Push to list (right)
- `redis_lpop` - Pop from list (left)
- `redis_rpop` - Pop from list (right)
- `redis_zadd` - Add to sorted set
- `redis_zrange` - Get sorted set range
- ... and 30+ more

**Prerequisites:**
- Redis server running on localhost:6379
- Python 3.8+ (for uvx)

**Documentation:**
https://github.com/redis/mcp-redis

---

### 3. TaskQueue MCP ✓

**Status:** Connected

**Connection Details:**
- **Command**: `npx -y taskqueue-mcp`
- **Transport**: STDIO (Node.js)

**Purpose:**
AI task management and workflow structuring with approval checkpoints.

**Features:**
- **Structured Task Queue** for multi-step workflows
  - Create task hierarchies
  - Define dependencies between tasks
  - Track task status (pending, in_progress, completed, failed)

- **User Approval Checkpoints**
  - Pause execution for user review
  - Request approval before proceeding
  - Capture user feedback

- **Task State Management**
  - Persist task state
  - Resume interrupted workflows
  - Rollback on errors

- **AI Agent Workflow Guidance**
  - Break complex tasks into steps
  - Provide context for each step
  - Track progress across sessions

**Setup Instructions:**

1. **Add MCP Server**
   ```bash
   # Add to Claude Code MCP configuration
   claude mcp add --transport stdio taskqueue-mcp -- npx -y taskqueue-mcp
   ```

2. **Verify Connection**
   ```bash
   # List available tools
   claude mcp tools taskqueue-mcp
   ```

3. **Test Task Creation**
   ```bash
   # Create a test task
   # Use create_task tool
   ```

**Available Tools:**
- `create_task` - Create a new task
- `get_task` - Get task details
- `update_task_status` - Update task status
- `add_task_dependency` - Link tasks
- `request_approval` - Request user approval
- `list_tasks` - List all tasks
- `delete_task` - Remove task

**Use Cases:**
- Multi-step refactoring workflows
- Complex analysis tasks requiring approval
- Long-running operations with checkpoints
- Collaborative AI-human workflows

**Documentation:**
https://www.npmjs.com/package/taskqueue-mcp

---

### 4. Filesystem MCP ✓

**Status:** Connected

**Connection Details:**
- **Command**: `npx -y @modelcontextprotocol/server-filesystem /Users/alyshialedlie/code/jobs`
- **Transport**: STDIO (Node.js)
- **Scope**: Limited to `/Users/alyshialedlie/code/jobs` directory

**Purpose:**
Log file access and filesystem operations for analysis and debugging.

**Features:**
- **Read/Write Access** to project directory
  - Read files (logs, reports, configs)
  - Write new files
  - Update existing files
  - Delete files (with confirmation)

- **Log File Analysis**
  - Parse JSON logs
  - Search log entries
  - Filter by severity level
  - Extract error patterns

- **Directory Traversal**
  - List directory contents
  - Find files by pattern
  - Calculate directory sizes
  - Detect file changes

**Setup Instructions:**

1. **Add MCP Server**
   ```bash
   # Add to Claude Code MCP configuration
   claude mcp add --transport stdio filesystem-mcp -- \
     npx -y @modelcontextprotocol/server-filesystem \
     /Users/alyshialedlie/code/jobs
   ```

2. **Verify Connection**
   ```bash
   # List available tools
   claude mcp tools filesystem-mcp
   ```

3. **Test File Access**
   ```bash
   # Read a log file
   # Use read_file tool
   ```

**Available Tools:**
- `read_file` - Read file contents
- `write_file` - Write file contents
- `list_directory` - List directory contents
- `search_files` - Search files by pattern
- `get_file_info` - Get file metadata
- `create_directory` - Create new directory
- `delete_file` - Delete file (with confirmation)

**Security:**
- **Scoped Access**: Only `/Users/alyshialedlie/code/jobs` directory
- **No Parent Directory Access**: Cannot access `../` outside scope
- **Confirmation Required**: Destructive operations require confirmation

**Use Cases:**
- Analyze job logs for errors
- Generate reports from scan results
- Validate output files
- Debug pipeline issues
- Monitor disk usage

---

## Server Configuration

### Configuration Files

MCP server configurations are stored in:

**Global Configuration:**
```
~/.claude.json
```

**Project Configuration:**
```
/Users/alyshialedlie/code/jobs/.claude/settings.local.json
```

### Example Configuration

```json
{
  "mcpServers": {
    "sentry-mcp": {
      "transport": "http",
      "url": "https://mcp.sentry.dev/mcp",
      "auth": {
        "type": "oauth",
        "organization": "your-org-slug"
      }
    },
    "redis-mcp": {
      "transport": "stdio",
      "command": "uvx",
      "args": [
        "--from",
        "redis-mcp-server@latest",
        "redis-mcp-server",
        "--url",
        "redis://localhost:6379/0"
      ]
    },
    "taskqueue-mcp": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "taskqueue-mcp"]
    },
    "filesystem-mcp": {
      "transport": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/alyshialedlie/code/jobs"
      ]
    }
  }
}
```

---

## Integration Points

### Sentry MCP Integration

**Integrated with:**
- `sidequest/logger.js` - Error tracking and logging
- `api/server.js` - API error handling
- All pipeline workers - Job failure tracking

**Example Usage:**
```javascript
import * as Sentry from '@sentry/node';
import { logger } from './sidequest/logger.js';

// Capture error with context
try {
  await processJob(job);
} catch (error) {
  logger.error('Job failed', { jobId: job.id, error });

  // Sentry automatically captures via logger
  // Additional context can be added:
  Sentry.setContext('job', {
    id: job.id,
    type: job.type,
    data: job.data
  });
}
```

**Benefits:**
- Automatic error grouping
- Stack trace analysis
- Performance monitoring
- Root cause analysis with AI

---

### Redis MCP Integration

**Integrated with:**
- `lib/caching/cached-scanner.js` - Scan result caching
- `sidequest/server.js` - Job queue state (future)

**Scan Result Caching:**
```javascript
import { ScanResultCache } from './lib/caching/cached-scanner.js';

const cache = new ScanResultCache({
  ttl: 2592000,  // 30 days
  keyPrefix: 'scan:'
});

// Cache key: repository path + commit hash
const cacheKey = `${repoPath}:${commitHash}`;

// Check cache
const cached = await cache.get(cacheKey);
if (cached) {
  console.log('Cache hit!');
  return cached;
}

// Perform scan
const result = await performScan(repoPath);

// Store in cache
await cache.set(cacheKey, result, {
  metadata: {
    cachedAt: new Date(),
    duplicateCount: result.duplicates.length,
    scanType: 'inter-project'
  }
});
```

**Cache Features:**
- **Git Commit-Based Caching**: Automatic cache key generation using commit hash
- **30-Day TTL**: Configurable cache expiration
- **Automatic Invalidation**: Cache invalidated on repository changes
- **Metadata Tracking**: Store scan metadata (date, counts, type)
- **Cache Hit/Miss Tracking**: Monitor cache effectiveness

**Benefits:**
- Faster scan results for unchanged repositories
- Reduced CPU usage
- Lower disk I/O
- Better performance for repeated scans

---

### TaskQueue MCP Integration

**Usage Scenarios:**

1. **Multi-Step Refactoring**
   ```javascript
   // Create task hierarchy
   const refactorTask = await taskqueue.createTask({
     name: 'Refactor authentication system',
     steps: [
       { name: 'Analyze current implementation', status: 'pending' },
       { name: 'Design new architecture', status: 'pending' },
       { name: 'Implement changes', status: 'pending', requiresApproval: true },
       { name: 'Update tests', status: 'pending' },
       { name: 'Deploy to staging', status: 'pending', requiresApproval: true }
     ]
   });
   ```

2. **Complex Analysis with Checkpoints**
   ```javascript
   // Create analysis task
   const analysisTask = await taskqueue.createTask({
     name: 'Analyze codebase for security issues',
     checkpoints: [
       { name: 'Scan for SQL injection', status: 'pending' },
       { name: 'Check authentication flows', status: 'pending' },
       { name: 'Review API endpoints', status: 'pending', requiresApproval: true }
     ]
   });
   ```

**Benefits:**
- Break complex tasks into manageable steps
- User approval at critical points
- Resume interrupted workflows
- Track progress across sessions

---

### Filesystem MCP Integration

**Usage Scenarios:**

1. **Log Analysis**
   ```javascript
   // Read recent error logs
   const errorLogs = await filesystem.readFile('logs/app.error.json');
   const errors = JSON.parse(errorLogs);

   // Analyze error patterns
   const errorsByType = errors.reduce((acc, error) => {
     acc[error.type] = (acc[error.type] || 0) + 1;
     return acc;
   }, {});
   ```

2. **Report Generation**
   ```javascript
   // Read scan results
   const scanData = await filesystem.readFile('output/reports/scan-123.json');
   const scan = JSON.parse(scanData);

   // Generate markdown report
   const report = generateMarkdownReport(scan);

   // Write report
   await filesystem.writeFile('output/reports/scan-123.md', report);
   ```

**Benefits:**
- Direct access to logs and reports
- No need for manual file reading
- Automated analysis and reporting
- Quick debugging and troubleshooting

---

## Managing MCP Servers

### List All MCP Servers

```bash
claude mcp list
```

**Example Output:**
```
MCP Servers:
  sentry-mcp (http) - ⚠️ Needs authentication
  redis-mcp (stdio) - ✓ Connected
  taskqueue-mcp (stdio) - ✓ Connected
  filesystem-mcp (stdio) - ✓ Connected
```

### View Available Tools

```bash
# List tools for specific server
claude mcp tools <server-name>

# Example
claude mcp tools redis-mcp
```

**Example Output:**
```
Redis MCP Tools:
  redis_get - Get value by key
  redis_set - Set key-value pair
  redis_del - Delete key
  redis_keys - List keys by pattern
  ... (30+ more tools)
```

### Add New MCP Server

**STDIO Transport:**
```bash
claude mcp add --transport stdio <name> -- <command> [args]

# Example: Add custom MCP server
claude mcp add --transport stdio custom-mcp -- \
  npx -y my-custom-mcp-server
```

**HTTP Transport:**
```bash
claude mcp add --transport http <name> <url>

# Example: Add remote MCP server
claude mcp add --transport http api-mcp https://api.example.com/mcp
```

### Remove MCP Server

```bash
claude mcp remove <name>

# Example
claude mcp remove redis-mcp
```

### Update MCP Server

```bash
# Remove old version
claude mcp remove <name>

# Add new version
claude mcp add --transport stdio <name> -- <new-command>
```

---

## Troubleshooting

### Common Issues

#### 1. Server Not Connecting

**Symptom:**
```
Error: MCP server connection failed
```

**Diagnosis:**
```bash
# Check server health
claude mcp list

# View server logs
# Logs are typically in ~/.claude/logs/
tail -f ~/.claude/logs/mcp-*.log
```

**Solutions:**

1. **Check server command**
   ```bash
   # Test command manually
   npx -y taskqueue-mcp  # Should start without errors
   ```

2. **Verify dependencies**
   ```bash
   # Check Node.js version
   node --version  # Should be v18+

   # Check Python version (for Redis MCP)
   python3 --version  # Should be v3.8+
   ```

3. **Restart MCP servers**
   ```bash
   # Remove and re-add server
   claude mcp remove <server-name>
   claude mcp add --transport stdio <server-name> -- <command>
   ```

#### 2. Authentication Issues (Sentry MCP)

**Symptom:**
```
Error: Unauthorized - OAuth authentication required
```

**Solution:**

1. **Authenticate with Sentry**
   ```bash
   # MCP server will prompt for OAuth
   claude mcp tools sentry-mcp
   ```

2. **Grant Permissions**
   - Click the OAuth link
   - Log in to Sentry
   - Authorize the application
   - Grant read access

3. **Verify Token**
   ```bash
   # Check if token is stored
   cat ~/.claude/mcp-tokens.json | jq '.["sentry-mcp"]'
   ```

4. **Re-authenticate if Needed**
   ```bash
   # Remove old token
   claude mcp remove sentry-mcp

   # Re-add and re-authenticate
   claude mcp add --transport http sentry-mcp https://mcp.sentry.dev/mcp
   ```

#### 3. Redis Connection Errors

**Symptom:**
```
Error: Redis connection to localhost:6379 failed
```

**Diagnosis:**
```bash
# Check if Redis is running
redis-cli ping  # Should return PONG

# Check Redis process
ps aux | grep redis-server

# Check Redis port
lsof -i :6379
```

**Solutions:**

1. **Start Redis Server**
   ```bash
   # macOS with Homebrew
   brew services start redis

   # Ubuntu/Debian
   sudo systemctl start redis-server

   # Docker
   docker start redis
   ```

2. **Install Redis if Missing**
   ```bash
   # macOS
   brew install redis

   # Ubuntu/Debian
   sudo apt-get install redis-server

   # Docker
   docker run -d -p 6379:6379 --name redis redis:7
   ```

3. **Configure Redis URL**
   ```bash
   # Update MCP server configuration
   claude mcp remove redis-mcp
   claude mcp add --transport stdio redis-mcp -- \
     uvx --from redis-mcp-server@latest redis-mcp-server \
     --url redis://localhost:6379/0
   ```

4. **Test Connection**
   ```bash
   # Test Redis connection
   redis-cli ping

   # Test MCP server
   claude mcp tools redis-mcp
   ```

#### 4. Filesystem Access Denied

**Symptom:**
```
Error: Permission denied accessing /path/to/file
```

**Diagnosis:**
```bash
# Check file permissions
ls -la /Users/alyshialedlie/code/jobs/logs/

# Check filesystem MCP scope
claude mcp list | grep filesystem-mcp
```

**Solutions:**

1. **Ensure File is Within Scope**
   ```bash
   # Filesystem MCP is scoped to /Users/alyshialedlie/code/jobs
   # Cannot access files outside this directory
   ```

2. **Fix File Permissions**
   ```bash
   # Grant read access
   chmod 644 /Users/alyshialedlie/code/jobs/logs/*.json

   # Grant directory access
   chmod 755 /Users/alyshialedlie/code/jobs/logs/
   ```

3. **Verify MCP Configuration**
   ```bash
   # Check configured path
   cat ~/.claude.json | jq '.mcpServers["filesystem-mcp"]'
   ```

---

## Advanced Usage

### Custom MCP Server Development

Create your own MCP server for AlephAuto:

```javascript
// custom-mcp-server.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'alephauto-custom-mcp',
  version: '1.0.0'
});

// Define tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'custom_tool',
        description: 'Custom tool for AlephAuto',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          },
          required: ['input']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'custom_tool') {
    const { input } = request.params.arguments;
    const result = await processInput(input);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Add to Claude Code:**
```bash
claude mcp add --transport stdio alephauto-custom-mcp -- \
  node custom-mcp-server.js
```

### Multi-Server Workflows

Combine multiple MCP servers for complex workflows:

```javascript
// 1. Use TaskQueue MCP to create workflow
const task = await taskqueue.createTask({
  name: 'Analyze and fix errors',
  steps: [
    { name: 'Fetch errors from Sentry', requiresApproval: false },
    { name: 'Analyze error patterns', requiresApproval: false },
    { name: 'Generate fix recommendations', requiresApproval: true },
    { name: 'Apply fixes', requiresApproval: true }
  ]
});

// 2. Use Sentry MCP to fetch errors
const errors = await sentry.searchIssues({
  query: 'is:unresolved level:error',
  limit: 10
});

// 3. Analyze errors (custom logic)
const analysis = analyzeErrors(errors);

// 4. Use Filesystem MCP to write report
await filesystem.writeFile('reports/error-analysis.json', JSON.stringify(analysis, null, 2));

// 5. Update task status
await taskqueue.updateTaskStatus(task.id, 'step-1', 'completed');
```

### MCP Server Monitoring

Monitor MCP server health and usage:

```bash
# Watch MCP server logs
tail -f ~/.claude/logs/mcp-*.log

# Monitor Redis operations
redis-cli monitor

# Check Sentry API usage
curl -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  https://sentry.io/api/0/organizations/your-org/stats/

# Monitor filesystem access
fswatch -o /Users/alyshialedlie/code/jobs/logs/
```

---

## Additional Resources

- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- [Sentry MCP Documentation](https://docs.sentry.io/product/sentry-mcp/)
- [Redis MCP GitHub](https://github.com/redis/mcp-redis)
- [TaskQueue MCP npm](https://www.npmjs.com/package/taskqueue-mcp)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
