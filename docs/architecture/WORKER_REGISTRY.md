# Worker Registry Architecture

**Version:** 1.8.4 | **Last Updated:** 2026-03-14

**Location:** `api/utils/worker-registry.ts`

## Overview

Centralized singleton managing worker instances for all 11 pipelines. Provides lazy initialization, instance caching, circuit breaker protection, and graceful shutdown.

## Architecture

```
API Routes (pipelines.ts)
  POST /api/pipelines/:id/trigger
         │
         ▼
Worker Registry (singleton)
  getWorker(pipelineId)  →  PIPELINE_CONFIGS map lookup
  isSupported(pipelineId)
  shutdown()
         │
         ▼
Worker Instances (cached Map)
  11 workers, lazy-initialized on first request
```

### Initialization Flow

1. `getWorker(pipelineId)` called
2. Check `_workers` cache -- return if exists
3. Check `_initializing` -- await if in progress (prevents duplicates)
4. Check circuit breaker -- reject if 3+ consecutive init failures
5. Look up `PIPELINE_CONFIGS.get(pipelineId)` and call `createWorker()`
6. Atomic check-and-set: if another concurrent call stored a worker, shut down duplicate
7. Cache and return

### Safety Mechanisms

- **Circuit breaker (3-strike):** After 3 consecutive init failures for a pipeline, `getWorker()` rejects immediately
- **Concurrency limiting:** `MAX_WORKER_INITS = 3` concurrent initializations max
- **Race condition fix (v1.8.1):** Atomic check-and-set after init prevents duplicate worker instances

## Supported Pipelines

| Pipeline ID | Worker Class | Git Workflow | Status |
|------------|--------------|--------------|--------|
| `duplicate-detection` | DuplicateDetectionWorker | Centralized (BranchManager) | Enabled |
| `schema-enhancement` | SchemaEnhancementWorker | Centralized (BranchManager) | Enabled |
| `git-activity` | GitActivityWorker | N/A | Enabled |
| `gitignore-manager` | GitignoreWorker | N/A | Enabled |
| `repo-cleanup` | RepoCleanupWorker | N/A | Enabled |
| `claude-health` | ClaudeHealthWorker | N/A | Enabled |
| `bugfix-audit` | BugfixAuditWorker | N/A | Enabled |
| `dashboard-populate` | DashboardPopulateWorker | N/A | Enabled |
| `plugin-manager` | PluginManagerWorker | N/A | Enabled |
| `repomix` | RepomixWorker | N/A | Disabled |
| `test-refactor` | TestRefactorWorker | N/A | Disabled |

## API Integration

```
POST /api/pipelines/:pipelineId/trigger
Body: { "parameters": { ... } }

Response: { "jobId": "...", "pipelineId": "...", "status": "queued", "timestamp": "..." }
Error:    { "error": "Unknown pipeline: ..." }
```

## Job Status Lifecycle

```
queued → running → completed / failed / cancelled
                ↘ retryPending (backoff) → running
paused ↔ running
```

States: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED, PAUSED

## Event System

Workers emit events consumed by `ActivityFeedManager` for real-time dashboard:

| Event | Dashboard Action |
|-------|------------------|
| `job:created` | Add to job list |
| `job:started` | Update status |
| `job:progress` | Update progress bar |
| `job:completed` | Mark complete |
| `job:failed` | Show error |

## Server Integration

Worker registry shutdown is wired into `setupGracefulShutdown()` in `api/server.ts` -- calls `workerRegistry.shutdown()` which iterates all cached workers.

## Testing

```bash
# Manual trigger test
./tests/manual/test-trigger-endpoint.sh

# Example: trigger pipeline
curl -X POST http://localhost:8080/api/pipelines/schema-enhancement/trigger \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"dryRun": true}}'
```

## References

- `sidequest/core/server.ts` -- SidequestServer base class, createJob(), job execution flow
- `api/routes/pipelines.ts` -- trigger endpoint
- `api/server.ts` -- graceful shutdown integration
- [System Data Flow](./SYSTEM-DATA-FLOW.md) -- full job lifecycle diagrams
- [Error Handling](./ERROR_HANDLING.md) | [Type System](./TYPE_SYSTEM.md)
