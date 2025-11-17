# Phase 4: Optional Enhancements - Implementation Plan

**Status:** In Progress
**Start Date:** 2025-11-12
**Dependencies:** Phase 2 & 3 Complete

## Overview

Phase 4 adds production-grade features to the duplicate detection system:
1. **Caching Layer** - Git commit hash tracking to avoid redundant scans
2. **MCP Server Integration** - Claude Code integration for AI-assisted duplicate detection
3. **REST API & WebSocket** - Programmatic access and real-time progress updates

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Phase 4 Architecture                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐      ┌──────────────────┐
│   MCP Server     │      │   REST API       │
│   (Claude Code)  │      │   (Express.js)   │
└────────┬─────────┘      └────────┬─────────┘
         │                         │
         │    ┌───────────────────┼────────────────┐
         │    │                   │                │
         ▼    ▼                   ▼                ▼
┌─────────────────────────────────────────────────────────┐
│              Duplicate Detection Pipeline               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  Cache   │  │   Job    │  │  Scanner │            │
│  │  Layer   │→ │  Queue   │→ │  Engine  │            │
│  └──────────┘  └──────────┘  └──────────┘            │
└─────────────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│   Redis Cache    │      │  Report Output   │
│ • Scan results   │      │ • HTML/MD/JSON   │
│ • Git commits    │      │ • WebSocket      │
└──────────────────┘      └──────────────────┘
```

## Task 13: Caching Layer

### Objectives
- Avoid re-scanning unchanged repositories
- Store scan results for quick retrieval
- Track Git commit hashes to detect changes
- Provide cache invalidation mechanism

### Implementation Plan

**13.1 Git Commit Hash Tracker** (`lib/cache/git-tracker.js`)
```javascript
class GitCommitTracker {
  async getRepositoryCommit(repoPath) {
    // Get current HEAD commit hash
  }

  async hasChanged(repoPath, lastCommit) {
    // Compare with cached commit hash
  }

  async getChangedFiles(repoPath, lastCommit) {
    // List files changed since last commit
  }
}
```

**13.2 Scan Result Cache** (`lib/cache/scan-cache.js`)
```javascript
class ScanResultCache {
  constructor(redisClient) {
    this.redis = redisClient;
    this.ttl = 30 * 24 * 60 * 60; // 30 days
  }

  async getCachedScan(repoPath, commitHash) {
    // Retrieve cached scan result
  }

  async cacheScan(repoPath, commitHash, scanResult) {
    // Store scan result in Redis
  }

  async invalidateCache(repoPath) {
    // Remove cached results for repository
  }
}
```

**13.3 Cache-Aware Scanner** (`lib/cache/cached-scanner.js`)
```javascript
class CachedScanner {
  async scanRepository(repoPath, options = {}) {
    const currentCommit = await this.gitTracker.getRepositoryCommit(repoPath);

    // Check cache first
    const cached = await this.cache.getCachedScan(repoPath, currentCommit);
    if (cached && !options.forceRefresh) {
      return { ...cached, fromCache: true };
    }

    // Run scan if cache miss
    const result = await this.scanner.scanRepository(repoPath);

    // Cache result
    await this.cache.cacheScan(repoPath, currentCommit, result);

    return { ...result, fromCache: false };
  }
}
```

**13.4 Cache Configuration**

Add to `config/scan-repositories.json`:
```json
{
  "cacheConfig": {
    "enabled": true,
    "provider": "redis",
    "ttl": 2592000,
    "invalidateOnChange": true,
    "trackGitCommits": true
  }
}
```

**Files to Create:**
- `lib/cache/git-tracker.js` (~200 lines)
- `lib/cache/scan-cache.js` (~250 lines)
- `lib/cache/cached-scanner.js` (~180 lines)
- `test/cache-layer.test.js` (~150 lines)

**Estimated Effort:** 6-8 hours

---

## Task 14: MCP Server Integration

### Objectives
- Expose duplicate detection as MCP tools
- Enable Claude Code to trigger scans and analyze results
- Provide configuration management through MCP
- Real-time scan progress updates

### Implementation Plan

**14.1 MCP Server Definition** (`mcp-servers/duplicate-detection/index.js`)
```javascript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'duplicate-detection',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
    resources: {}
  }
});

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'scan_repository',
      description: 'Scan a repository for duplicate code',
      inputSchema: { ... }
    },
    {
      name: 'scan_multiple_repositories',
      description: 'Inter-project scan across multiple repositories',
      inputSchema: { ... }
    },
    {
      name: 'get_scan_results',
      description: 'Retrieve results from a completed scan',
      inputSchema: { ... }
    },
    {
      name: 'list_repositories',
      description: 'List configured repositories',
      inputSchema: { ... }
    },
    {
      name: 'get_suggestions',
      description: 'Get consolidation suggestions for duplicates',
      inputSchema: { ... }
    }
  ]
}));
```

**14.2 Tool Implementations**

**scan_repository:**
```javascript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'scan_repository') {
    const { repositoryPath, useCache = true } = request.params.arguments;

    const scanner = new CachedScanner();
    const result = await scanner.scanRepository(repositoryPath, {
      forceRefresh: !useCache
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          scan_id: result.scan_metadata.scan_id,
          duplicates: result.metrics.total_duplicate_groups,
          suggestions: result.metrics.total_suggestions,
          from_cache: result.fromCache
        }, null, 2)
      }]
    };
  }
});
```

**14.3 Resource Providers**

Expose scan reports as MCP resources:
```javascript
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'scan://recent',
      name: 'Recent Scans',
      mimeType: 'application/json'
    },
    {
      uri: 'scan://config',
      name: 'Repository Configuration',
      mimeType: 'application/json'
    }
  ]
}));
```

**14.4 MCP Server Configuration**

Add to `~/.claude/mcp_settings.json`:
```json
{
  "mcpServers": {
    "duplicate-detection": {
      "command": "node",
      "args": ["/Users/alyshialedlie/code/jobs/mcp-servers/duplicate-detection/index.js"],
      "env": {
        "DOPPLER_TOKEN": "..."
      }
    }
  }
}
```

**Files to Create:**
- `mcp-servers/duplicate-detection/index.js` (~400 lines)
- `mcp-servers/duplicate-detection/package.json`
- `mcp-servers/duplicate-detection/README.md`
- `test/mcp-server.test.js` (~200 lines)

**Estimated Effort:** 8-10 hours

---

## Task 15: REST API Endpoints

### Objectives
- Programmatic access to duplicate detection
- Trigger scans via HTTP
- Retrieve scan results and reports
- Manage repository configuration
- Authentication and rate limiting

### Implementation Plan

**15.1 Express API Server** (`api/server.js`)
```javascript
import express from 'express';
import { createComponentLogger } from '../sidequest/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rate-limit.js';
import scanRoutes from './routes/scans.js';
import repoRoutes from './routes/repositories.js';
import reportRoutes from './routes/reports.js';

const app = express();
const logger = createComponentLogger('APIServer');

app.use(express.json());
app.use(authMiddleware);
app.use(rateLimiter);

app.use('/api/scans', scanRoutes);
app.use('/api/repositories', repoRoutes);
app.use('/api/reports', reportRoutes);

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'API server started');
});
```

**15.2 API Routes**

**Scan Routes** (`api/routes/scans.js`):
```javascript
// POST /api/scans/start
router.post('/start', async (req, res) => {
  const { repositoryPath, options } = req.body;

  const jobId = await scanOrchestrator.scheduleS can(repositoryPath, options);

  res.json({
    success: true,
    job_id: jobId,
    status_url: `/api/scans/${jobId}/status`
  });
});

// GET /api/scans/:jobId/status
router.get('/:jobId/status', async (req, res) => {
  const status = await scanOrchestrator.getJobStatus(req.params.jobId);
  res.json(status);
});

// GET /api/scans/:jobId/results
router.get('/:jobId/results', async (req, res) => {
  const results = await scanOrchestrator.getJobResults(req.params.jobId);
  res.json(results);
});

// GET /api/scans/recent
router.get('/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const scans = await scanOrchestrator.getRecentScans(limit);
  res.json(scans);
});
```

**Repository Routes** (`api/routes/repositories.js`):
```javascript
// GET /api/repositories
router.get('/', async (req, res) => {
  const repos = await configLoader.getEnabledRepositories();
  res.json(repos);
});

// GET /api/repositories/:name
router.get('/:name', async (req, res) => {
  const repo = await configLoader.getRepository(req.params.name);
  res.json(repo);
});

// POST /api/repositories/:name/scan
router.post('/:name/scan', async (req, res) => {
  const repo = await configLoader.getRepository(req.params.name);
  const jobId = await scanOrchestrator.scheduleScan(repo.path, req.body.options);

  res.json({
    success: true,
    job_id: jobId
  });
});
```

**Report Routes** (`api/routes/reports.js`):
```javascript
// GET /api/reports/:scanId
router.get('/:scanId', async (req, res) => {
  const format = req.query.format || 'json';
  const report = await reportCoordinator.getReport(req.params.scanId, format);

  if (format === 'html') {
    res.type('html').send(report);
  } else if (format === 'markdown') {
    res.type('text/markdown').send(report);
  } else {
    res.json(report);
  }
});

// GET /api/reports
router.get('/', async (req, res) => {
  const reports = await reportCoordinator.listReports();
  res.json(reports);
});
```

**15.3 Authentication Middleware** (`api/middleware/auth.js`)
```javascript
export function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  if (!validateApiKey(apiKey)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}
```

**15.4 Rate Limiting** (`api/middleware/rate-limit.js`)
```javascript
import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests, please try again later'
});
```

**Files to Create:**
- `api/server.js` (~200 lines)
- `api/routes/scans.js` (~250 lines)
- `api/routes/repositories.js` (~180 lines)
- `api/routes/reports.js` (~150 lines)
- `api/middleware/auth.js` (~100 lines)
- `api/middleware/rate-limit.js` (~50 lines)
- `test/api-endpoints.test.js` (~300 lines)

**Estimated Effort:** 10-12 hours

---

## Task 16: WebSocket Support

### Objectives
- Real-time scan progress updates
- Live duplicate detection notifications
- Progress bars for long-running scans
- Event streaming for monitoring

### Implementation Plan

**16.1 WebSocket Server** (`api/websocket.js`)
```javascript
import { WebSocketServer } from 'ws';
import { createComponentLogger } from '../sidequest/logger.js';

const logger = createComponentLogger('WebSocketServer');

export function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const clientId = generateClientId();
    logger.info({ clientId }, 'Client connected');

    ws.on('message', (data) => {
      const message = JSON.parse(data);
      handleClientMessage(ws, message);
    });

    ws.on('close', () => {
      logger.info({ clientId }, 'Client disconnected');
    });
  });

  return wss;
}
```

**16.2 Event Broadcaster**
```javascript
class ScanEventBroadcaster {
  constructor(wss) {
    this.wss = wss;
  }

  broadcastProgress(scanId, progress) {
    this.broadcast({
      type: 'scan:progress',
      scan_id: scanId,
      progress: {
        stage: progress.stage,
        percent: progress.percent,
        message: progress.message
      }
    });
  }

  broadcastDuplicateFound(scanId, duplicate) {
    this.broadcast({
      type: 'duplicate:found',
      scan_id: scanId,
      duplicate: {
        group_id: duplicate.group_id,
        impact_score: duplicate.impact_score
      }
    });
  }

  broadcast(message) {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}
```

**16.3 Integration with Scanner**

Update `duplicate-detection-pipeline.js`:
```javascript
class DuplicateDetectionWorker extends SidequestServer {
  async _runIntraProjectScan(job, repositoryConfig) {
    // Emit progress events
    this.broadcastProgress(job.id, { stage: 'scanning', percent: 10 });

    const result = await this.orchestrator.scanRepository(repoPath);

    this.broadcastProgress(job.id, { stage: 'analyzing', percent: 50 });

    // Continue...
  }
}
```

**Files to Create:**
- `api/websocket.js` (~200 lines)
- `api/event-broadcaster.js` (~150 lines)
- `test/websocket.test.js` (~180 lines)

**Estimated Effort:** 4-6 hours

---

## Implementation Timeline

| Task | Description | Est. Hours | Dependencies |
|------|-------------|-----------|--------------|
| 13.1 | Git Commit Tracker | 2h | - |
| 13.2 | Scan Result Cache | 3h | Redis MCP |
| 13.3 | Cached Scanner | 2h | 13.1, 13.2 |
| 13.4 | Cache Tests | 1h | 13.3 |
| 14.1 | MCP Server Setup | 3h | - |
| 14.2 | MCP Tools | 4h | 14.1 |
| 14.3 | MCP Resources | 2h | 14.2 |
| 14.4 | MCP Tests | 2h | 14.3 |
| 15.1 | Express API Setup | 2h | - |
| 15.2 | API Routes | 5h | 15.1 |
| 15.3 | Auth & Rate Limiting | 2h | 15.1 |
| 15.4 | API Tests | 3h | 15.2 |
| 16.1 | WebSocket Server | 2h | 15.1 |
| 16.2 | Event Broadcasting | 2h | 16.1 |
| 16.3 | Scanner Integration | 1h | 16.2 |
| 16.4 | WebSocket Tests | 2h | 16.3 |

**Total Estimated Effort:** 38-46 hours

---

## Testing Strategy

### Unit Tests
- Cache layer: Git tracking, Redis operations
- MCP tools: Tool invocation, response formatting
- API routes: Request/response handling, validation
- WebSocket: Connection, message handling

### Integration Tests
- End-to-end scan with caching
- MCP server with Claude Code
- API + WebSocket real-time updates
- Multi-repository inter-project scans

### Performance Tests
- Cache hit/miss ratios
- API response times under load
- WebSocket message throughput
- Concurrent scan handling

---

## Configuration Updates

### Environment Variables

```bash
# Caching
CACHE_ENABLED=true
CACHE_TTL=2592000
REDIS_URL=redis://localhost:6379

# API Server
API_PORT=3000
API_KEY=your-secure-api-key-here

# WebSocket
WS_PORT=3001
WS_HEARTBEAT_INTERVAL=30000

# MCP Server
MCP_LOG_LEVEL=info
```

### Package Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "express-rate-limit": "^7.1.5",
    "jsonwebtoken": "^9.0.2"
  }
}
```

---

## Success Criteria

### Task 13: Caching Layer
- ✅ Cache hit rate > 80% for unchanged repositories
- ✅ Git commit tracking accurate
- ✅ Cache invalidation working correctly
- ✅ Redis integration stable

### Task 14: MCP Server
- ✅ All tools callable from Claude Code
- ✅ Scan results retrievable via MCP
- ✅ Configuration manageable through MCP
- ✅ Error handling robust

### Task 15: REST API
- ✅ All endpoints functional
- ✅ Authentication working
- ✅ Rate limiting effective
- ✅ API documentation complete

### Task 16: WebSocket
- ✅ Real-time updates working
- ✅ Multiple clients supported
- ✅ Connection stability
- ✅ Event broadcasting reliable

---

## Documentation Requirements

1. **API Documentation** - OpenAPI/Swagger spec
2. **MCP Server Guide** - Tool usage examples
3. **Caching Guide** - Cache management, invalidation
4. **WebSocket Protocol** - Message formats, events
5. **Deployment Guide** - Production setup with all features

---

## Next Steps

1. Start with Task 13 (Caching Layer) - foundational feature
2. Move to Task 14 (MCP Server) - enables AI integration
3. Implement Task 15 (REST API) - programmatic access
4. Add Task 16 (WebSocket) - real-time features
5. Comprehensive testing and documentation

**Estimated Total Timeline:** 5-6 days (full-time equivalent)
