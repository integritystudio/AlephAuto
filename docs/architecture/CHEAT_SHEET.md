# Jobs Project - Quick Reference Cheat Sheet

> **Automated Job Management & Code Analysis System** | AlephAuto Framework | Node.js + Python

---

## System Architecture at a Glance

```
CLIENT → EXPRESS API → JOB WORKERS → PROCESSING PIPELINE → REDIS CACHE / FILES
         (Port 3000)   (AlephAuto)   (JS + Python)        (Optional)
                 ↓
            WEBSOCKET → Real-time progress updates
```

**4 Main Pipelines**: Duplicate Detection • Doc Enhancement • Git Activity • Gitignore Manager

---

## Quick Start Commands

```bash
# Start servers
doppler run -- npm start                    # Repomix cron (2 AM daily)
doppler run -- node api/server.js           # REST API + WebSocket (port 3000)
doppler run -- node duplicate-detection-pipeline.js  # Main duplicate scanner

# Development
npm run dev                                 # Dev mode with hot reload

# Testing
npm test                                    # All tests (156 files)
npm run test:api                            # REST API tests (16)
npm run test:websocket                      # WebSocket tests (15)
npm run test:accuracy                       # Duplicate detection accuracy
npm run typecheck                           # TypeScript validation
```

---

## REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scans/start` | POST | Start single repository scan |
| `/api/scans/start-multi` | POST | Start inter-project scan |
| `/api/scans/:scanId/status` | GET | Get scan status |
| `/api/scans/:scanId/results` | GET | Get scan results |
| `/api/repositories` | GET | List all repositories |
| `/api/reports/:reportId` | GET | Get report details |
| `/health` | GET | System health check |
| `/ws/status` | GET | WebSocket connection info |

**WebSocket**: `ws://localhost:3000/ws`

---

## WebSocket Events

| Event Type | Direction | Description |
|------------|-----------|-------------|
| `connected` | Server → Client | Connection established |
| `job:created` | Server → Client | Job added to queue |
| `job:started` | Server → Client | Job processing started |
| `job:progress` | Server → Client | Progress update (0.0-1.0) |
| `job:completed` | Server → Client | Job finished with results |
| `job:failed` | Server → Client | Job failed with error |
| `subscribe` | Client → Server | Subscribe to events |
| `unsubscribe` | Client → Server | Unsubscribe from events |

---

## Duplicate Detection Pipeline (7 Stages)

```
1. Repository Scan      → repomix CLI → Repository JSON
2. Pattern Detection    → ast-grep (18 rules) → Pattern Matches
3. Extract Code Blocks  → Python → CodeBlock objects
4. Semantic Annotation  → Python → Categorized blocks
5. Duplicate Grouping   → Python (2-phase similarity) → DuplicateGroups
6. Generate Suggestions → Python → ConsolidationSuggestions
7. Report Generation    → Python → HTML/JSON/Markdown + Metrics
```

**Duration**: 2-10 minutes depending on repository size
**Cache**: Redis with 30-day TTL (git commit-aware)

---

## Two-Phase Similarity Algorithm

1. **Extract Features** (before normalization): HTTP codes, operators, methods, keywords
2. **Normalize Code**: Remove comments, standardize whitespace, normalize variables
3. **Calculate Base Similarity**: Levenshtein distance on normalized code
4. **Apply Semantic Penalties**:
   - HTTP codes differ (200 vs 201): 0.70× (30% penalty)
   - Operators differ (=== vs !==): 0.80× (20% penalty)
   - Methods differ (max vs min): 0.75× (25% penalty)
5. **Group by Threshold**: Default 0.90 (90% similar)

---

## Key Data Models

### CodeBlock
```typescript
{
  block_id: string,
  source_location: { file_path, line_start, line_end },
  source_code: string,
  language: "javascript" | "typescript" | "python" | ...,
  semantic_category: "utility" | "handler" | "validator" | ...,
  tags: string[],
  hash: string  // SHA256 of normalized code
}
```

### DuplicateGroup
```typescript
{
  group_id: string,
  pattern_id: string,
  member_block_ids: string[],  // Min 2 blocks
  similarity_score: number,     // 0.0-1.0
  similarity_method: "exact" | "structural" | "semantic" | "hybrid",
  canonical_block_id?: string,  // Best representative
  impact_metrics: { total_lines_duplicated, potential_savings, ... }
}
```

### ConsolidationSuggestion
```typescript
{
  suggestion_id: string,
  duplicate_group_id: string,
  title: string,
  strategy: "extract_function" | "extract_module" | "use_existing" | ...,
  priority: "critical" | "high" | "medium" | "low",
  estimated_effort: number,     // Hours
  expected_benefit: number,     // Score 0-100
  migration_steps: MigrationStep[]
}
```

---

## Environment Variables

```bash
# Required
SENTRY_DSN=https://key@sentry.io/project
NODE_ENV=production

# Paths
CODE_BASE_DIR=/Users/username/code
OUTPUT_BASE_DIR=./sidequest/output/condense
LOG_DIR=./logs

# Job Processing
MAX_CONCURRENT=5                    # 1-50 parallel jobs
RUN_ON_STARTUP=false               # Run immediately on start

# Cron Schedules (cron format)
CRON_SCHEDULE="0 2 * * *"          # Daily at 2 AM
DOC_SCHEDULE="0 3 * * *"           # Daily at 3 AM
GIT_SCHEDULE="0 20 * * 0"          # Sunday at 8 PM

# Cache
REDIS_URL=redis://localhost:6379   # Optional
CACHE_TTL=2592000                  # 30 days in seconds
```

---

## Cache Strategy

**Cache Key Format**: `scan:{repo_path_hash}:{git_commit_hash}`

**Cache Invalidation**:
- Git commit changes → Cache MISS
- Uncommitted changes detected → Bypass cache
- 30 days elapsed → TTL expired

**Cache Hit Rate**: Typically 70-90% in production

---

## Configuration Files

| File | Purpose |
|------|---------|
| `sidequest/config.js` | Central configuration |
| `config/scan-repositories.json` | Repository scan settings |
| `.ast-grep/rules/*.yml` | 18 pattern detection rules |
| `.env` | Environment variables |

---

## Cron Schedules

```
0 2 * * *    Daily at 2 AM     Duplicate detection (10 repos/night)
0 3 * * *    Daily at 3 AM     Documentation enhancement
0 20 * * 0   Sunday at 8 PM    Git activity reports
```

**Cron Syntax**: `minute hour day month dayOfWeek`

---

## Job Queue Behavior

- **Max Concurrent**: Configurable 1-50 (default 5)
- **Queue**: FIFO (First In, First Out)
- **States**: `queued → in_progress → completed/failed`
- **Retry**: Configurable attempts with delay
- **Timeout**: 10 minutes per scan (configurable)

---

## AST-Grep Pattern Categories (18 Rules)

1. **Database**: Prisma operations, raw SQL
2. **API Handlers**: Express routes (GET, POST, PUT, DELETE, PATCH)
3. **Async Patterns**: Promises, async/await
4. **Utilities**: Helper functions, formatters
5. **Validation**: Input validation, type checking
6. **Logging**: console.log, logger calls
7. **Config**: Configuration access
8. **Error Handling**: try-catch, error handlers
9. **API Clients**: External API calls
10. **Middleware**: Express middleware

---

## File Locations

```
sidequest/output/
├── condense/           # Duplicate detection reports (HTML/JSON/MD)
├── git-activity/       # Git reports (weekly/monthly)
├── doc-enhancement/    # Documentation logs
└── repomix/           # Repomix outputs

logs/
├── duplicate-detection/  # Pipeline logs
├── git-activity/        # Git report logs
├── doc-enhancement/     # Doc logs
└── combined.log         # All logs

config/
└── scan-repositories.json  # Repo configuration
```

---

## External Integrations

| System | Purpose | Required? |
|--------|---------|-----------|
| **Sentry v8** | Error tracking & monitoring | Yes |
| **Redis** | Scan result caching | Optional |
| **repomix** | Code consolidation | Yes |
| **ast-grep** | Pattern detection | Yes |
| **Python 3.14** | Data processing | Yes |
| **Schema.org MCP** | Structured data generation | Optional |

---

## Common Tasks

### Start a Manual Scan
```bash
curl -X POST http://localhost:3000/api/scans/start \
  -H "Content-Type: application/json" \
  -d '{"repositoryPath": "/Users/user/code/project"}'
```

### Check Scan Status
```bash
curl http://localhost:3000/api/scans/{scanId}/status
```

### Subscribe to WebSocket Events
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'job:progress') {
    console.log(`Progress: ${data.progress * 100}%`);
  }
};
ws.send(JSON.stringify({ action: 'subscribe', events: ['job:*'] }));
```

### Clear Redis Cache
```bash
redis-cli FLUSHDB
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Jobs stuck in queue | Check `MAX_CONCURRENT` setting, restart worker |
| Cache always misses | Verify Redis connection, check git status |
| Python errors | Ensure Python 3.14+, check dependencies |
| Timeout errors | Increase `scanTimeout` in config |
| High memory usage | Reduce `maxConcurrent`, check for large repos |
| WebSocket disconnects | Check firewall, verify port 3000 accessible |

---

## Performance Metrics

- **Test Pass Rate**: 97.7% (129/132 passing)
- **Duplicate Detection Accuracy**:
  - Precision: 100% (no false positives)
  - Recall: 87.5% (catches most duplicates)
  - F1-Score: 93.33%
- **Average Scan Time**: 2-10 minutes
- **Cache Hit Rate**: 70-90%
- **Codebase Size**: ~4,244 lines

---

## Key Classes & Files

| File | Class/Component | Purpose |
|------|----------------|---------|
| `sidequest/server.js` | `SidequestServer` | Base job queue manager |
| `duplicate-detection-pipeline.js` | `DuplicateDetectionWorker` | Main duplicate scanner |
| `lib/scan-orchestrator.js` | `ScanOrchestrator` | 7-stage pipeline coordinator |
| `lib/similarity/structural.py` | Similarity algorithm | 2-phase duplicate detection |
| `api/server.js` | Express app | REST API + WebSocket |
| `api/websocket.js` | WebSocket server | Real-time event broadcasting |

---

## Documentation

- **Full Diagrams**: `DATAFLOW_DIAGRAMS.md`
- **This Cheat Sheet**: `CHEAT_SHEET.md`
- **API Docs**: Check `/api/routes/` for endpoint details
- **Configuration**: See `sidequest/config.js`

---

*Last Updated: 2024-01-17 | Version 1.0 | AlephAuto Framework*
