# Worker Registry Architecture

**Version:** 1.8.2
**Last Updated:** 2026-02-01

## Overview

The Worker Registry is a centralized singleton that manages worker instances for all pipelines in the AlephAuto job queue framework. It provides lazy initialization, instance caching, and graceful shutdown for pipeline workers.

## Purpose

### Problems Solved

1. **Manual Job Triggering** - Enables API-based pipeline job creation without hardcoded worker instances
2. **Resource Management** - Lazy initialization only creates workers when needed
3. **Instance Reuse** - Caches worker instances to prevent duplicate initialization
4. **Graceful Shutdown** - Coordinates shutdown of all active workers

## Architecture

### File Location

```
jobs/
└── api/
    └── utils/
        └── worker-registry.js  # Worker registry singleton
```

### Worker Registry Pattern

```
┌──────────────────────────────────────────┐
│ API Routes (pipelines.ts)                │
│  - POST /api/pipelines/:id/trigger       │
└────────────────┬─────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────┐
│ Worker Registry (singleton)              │
│  - getWorker(pipelineId)                 │
│  - isSupported(pipelineId)               │
│  - shutdown()                            │
└────────────────┬─────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────┐
│ Worker Instances (cached)                │
│  - DuplicateDetectionWorker              │
│  - SchemaEnhancementWorker               │
│  - GitActivityWorker                     │
│  - RepoCleanupWorker                     │
│  - etc.                                  │
└──────────────────────────────────────────┘
```

### Lazy Initialization Flow

```
1. API Request
   ↓
2. workerRegistry.getWorker('schema-enhancement')
   ↓
3. Check cache - Worker exists?
   ├─ YES → Return cached instance
   └─ NO  → Continue
   ↓
4. Check initializing - Currently initializing?
   ├─ YES → Wait for initialization promise
   └─ NO  → Continue
   ↓
5. Initialize worker
   ├─ Create worker instance
   ├─ Call worker.initialize() if method exists
   └─ Cache instance
   ↓
6. Return worker instance
```

## Implementation

### Worker Registry Class

```javascript
class WorkerRegistry {
  constructor() {
    this._workers = new Map();      // Cached instances
    this._initializing = new Map(); // In-progress initializations
  }

  async getWorker(pipelineId) {
    // Return cached instance if exists
    if (this._workers.has(pipelineId)) {
      return this._workers.get(pipelineId);
    }

    // Wait for in-progress initialization
    if (this._initializing.has(pipelineId)) {
      return this._initializing.get(pipelineId);
    }

    // Initialize worker
    const initPromise = this._initializeWorker(pipelineId);
    this._initializing.set(pipelineId, initPromise);

    try {
      const worker = await initPromise;
      this._workers.set(pipelineId, worker);
      this._initializing.delete(pipelineId);
      return worker;
    } catch (error) {
      this._initializing.delete(pipelineId);
      throw error;
    }
  }

  async _initializeWorker(pipelineId) {
    // Switch based on pipeline ID
    switch (pipelineId) {
      case 'schema-enhancement':
        return new SchemaEnhancementWorker({ ... });
      case 'git-activity':
        return new GitActivityWorker({ ... });
      // ... etc
      default:
        throw new Error(`Unknown pipeline ID: ${pipelineId}`);
    }
  }

  isSupported(pipelineId) {
    const supported = [
      'duplicate-detection',
      'schema-enhancement',
      // ... etc
    ];
    return supported.includes(pipelineId);
  }

  async shutdown() {
    // Shutdown all workers
    for (const [id, worker] of this._workers.entries()) {
      if (worker.shutdown) {
        await worker.shutdown();
      }
    }
    this._workers.clear();
  }
}

// Export singleton
export const workerRegistry = new WorkerRegistry();
```

### Trigger Job Implementation

**Location:** `api/routes/pipelines.ts`

```typescript
async function triggerPipelineJob(
  pipelineId: string,
  parameters: Record<string, unknown>
): Promise<string> {
  // Validate pipeline is supported
  if (!workerRegistry.isSupported(pipelineId)) {
    throw new Error(`Unknown pipeline: ${pipelineId}`);
  }

  // Get or create worker instance
  const worker = await workerRegistry.getWorker(pipelineId);

  // Generate job ID
  const jobId = `${pipelineId}-manual-${Date.now()}`;

  // Create job with worker
  const job = worker.createJob(jobId, {
    ...parameters,
    triggeredBy: 'api',
    triggeredAt: new Date().toISOString()
  });

  return job.id;
}
```

## Supported Pipelines

| Pipeline ID | Worker Class | Job Type | Git Workflow |
|------------|--------------|----------|--------------|
| `duplicate-detection` | DuplicateDetectionWorker | duplicate-detection | Custom PR Creator |
| `schema-enhancement` | SchemaEnhancementWorker | schema-enhancement | ✓ Enabled |
| `git-activity` | GitActivityWorker | git-activity | N/A |
| `gitignore-manager` | GitignoreWorker | gitignore-update | Not supported |
| `repomix` | RepomixWorker | repomix | N/A |
| `claude-health` | ClaudeHealthWorker | claude-health | N/A |
| `repo-cleanup` | RepoCleanupWorker | repo-cleanup | N/A |
| `test-refactor` | TestRefactorWorker | test-refactor | N/A |

## API Integration

### Endpoint

```
POST /api/pipelines/:pipelineId/trigger
```

### Request Body

```json
{
  "parameters": {
    "key": "value"
    // Pipeline-specific parameters
  }
}
```

### Response

```json
{
  "jobId": "schema-enhancement-manual-1732567890123",
  "pipelineId": "schema-enhancement",
  "status": "queued",
  "timestamp": "2025-11-25T12:34:56.789Z"
}
```

### Error Handling

```json
{
  "error": "Unknown pipeline: unknown-pipeline. Supported pipelines: duplicate-detection, schema-enhancement, git-activity, ..."
}
```

## Server Integration

### Graceful Shutdown

The worker registry is integrated into the server shutdown process:

**Location:** `api/server.js`

```javascript
setupGracefulShutdown(httpServer, {
  timeout: 10000,
  onShutdown: async (signal) => {
    // Stop Doppler health monitoring
    dopplerMonitor.stopMonitoring();

    // Shutdown all workers
    await workerRegistry.shutdown();

    // Close WebSocket server
    wss.close();
  }
});
```

## Testing

### Manual Testing

**Location:** `tests/manual/test-trigger-endpoint.sh`

```bash
# Start server
doppler run -- npm run dashboard

# Run manual tests
./tests/manual/test-trigger-endpoint.sh
```

### Test Scenarios

1. **Trigger Valid Pipeline**
   ```bash
   curl -X POST http://localhost:8080/api/pipelines/schema-enhancement/trigger \
     -H "Content-Type: application/json" \
     -d '{"parameters": {"dryRun": true}}'
   ```

2. **Trigger Unknown Pipeline**
   ```bash
   curl -X POST http://localhost:8080/api/pipelines/unknown/trigger \
     -H "Content-Type: application/json" \
     -d '{"parameters": {}}'
   # Expected: 400 Bad Request with error message
   ```

3. **Verify Job Creation**
   ```bash
   curl http://localhost:8080/api/pipelines/schema-enhancement/jobs?limit=5
   ```

## Error Handling

### Worker Initialization Failures

```javascript
try {
  worker = new DuplicateDetectionWorker({ ... });
} catch (error) {
  logger.error({ error, pipelineId }, 'Failed to create worker');
  throw new Error(`Failed to initialize ${pipelineId} worker: ${error.message}`);
}
```

### Concurrent Initialization Prevention

```javascript
// Multiple simultaneous requests for same worker
// → Only ONE initialization occurs
// → Other requests wait for initialization promise

if (this._initializing.has(pipelineId)) {
  return this._initializing.get(pipelineId);
}
```

### Race Condition Fix (v1.8.1)

The worker registry implements an atomic check-and-set pattern to prevent race conditions:

```javascript
const initPromise = (async () => {
  const worker = await this._initializeWorker(pipelineId);

  // Atomic check-and-set: another concurrent call may have stored a worker
  const existing = this._workers.get(pipelineId);
  if (existing) {
    // Duplicate detected - shut down the extra instance
    await worker.shutdown?.();
    return existing;
  }

  this._workers.set(pipelineId, worker);
  return worker;
})();
```

**Problem solved:** Without this fix, multiple concurrent `getWorker()` calls could create duplicate worker instances, causing:
- Memory leaks from unclosed workers
- Undefined behavior when multiple workers process the same job
- Resource exhaustion

**Solution:** After initialization completes, check if another concurrent call already stored a worker. If so, shut down the duplicate and return the existing instance.

## Benefits

1. **Centralized Management** - All worker initialization logic in one place
2. **Resource Efficiency** - Workers only created when needed
3. **Instance Reuse** - No duplicate worker instances
4. **Maintainability** - Easy to add new pipelines (add to switch statement)
5. **Type Safety** - TypeScript support via JSDoc annotations
6. **Graceful Shutdown** - Coordinated cleanup of all workers

## Migration from TODO

### Before (Mock Implementation)

```typescript
async function triggerPipelineJob(
  pipelineId: string,
  parameters: Record<string, unknown>
): Promise<string> {
  // TODO: Implement actual job triggering with worker
  const jobId = `job-${Date.now()}`;
  return jobId;
}
```

### After (Real Implementation)

```typescript
async function triggerPipelineJob(
  pipelineId: string,
  parameters: Record<string, unknown>
): Promise<string> {
  // Validate pipeline is supported
  if (!workerRegistry.isSupported(pipelineId)) {
    throw new Error(`Unknown pipeline: ${pipelineId}`);
  }

  // Get or create worker instance
  const worker = await workerRegistry.getWorker(pipelineId);

  // Create job with worker
  const jobId = `${pipelineId}-manual-${Date.now()}`;
  const job = worker.createJob(jobId, {
    ...parameters,
    triggeredBy: 'api',
    triggeredAt: new Date().toISOString()
  });

  return job.id;
}
```

## Job Triggering Internals

### Complete Flow: API Request → Job Execution

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. API Request                                                          │
│    POST /api/pipelines/:pipelineId/trigger                              │
│    Body: { parameters: { ... } }                                        │
└────────────────────────────┬────────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. Worker Resolution (workerRegistry.getWorker)                         │
│    ├── Check cache → Return if exists                                   │
│    ├── Check initializing → Wait if in progress                         │
│    ├── Circuit breaker → Reject if failed 3+ times                      │
│    └── Initialize → Create worker, cache, connect activity feed         │
└────────────────────────────┬────────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. Job Creation (worker.createJob)                                      │
│    ├── Create job object with status: 'queued'                          │
│    ├── Store in worker.jobs Map                                         │
│    ├── Add to worker.queue                                              │
│    ├── Persist to SQLite (jobRepository)                                │
│    ├── Emit 'job:created' event                                         │
│    └── Trigger processQueue()                                           │
└────────────────────────────┬────────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. Queue Processing (worker.processQueue)                               │
│    ├── Check: isRunning && activeJobs < maxConcurrent                   │
│    ├── Dequeue next job                                                 │
│    └── Call executeJob(jobId)                                           │
└────────────────────────────┬────────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. Job Execution (worker.executeJob)                                    │
│    ├── Set status: 'running', emit 'job:started'                        │
│    ├── Create git branch (if gitWorkflowEnabled)                        │
│    ├── Run handler (implemented by worker subclass)                     │
│    ├── Handle result:                                                   │
│    │   ├── Success → status: 'completed', emit 'job:completed'          │
│    │   └── Failure → status: 'failed', emit 'job:failed'                │
│    ├── Commit changes, create PR (if git workflow)                      │
│    ├── Persist final state to SQLite                                    │
│    └── Decrement activeJobs, call processQueue()                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### createJob() Implementation

**Location:** `sidequest/core/server.js:74-111`

```javascript
createJob(jobId, jobData) {
  const job = {
    id: jobId,
    status: 'queued',           // Initial status
    data: jobData,              // User-provided parameters
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
    git: {                      // Git workflow metadata
      branchName: null,
      originalBranch: null,
      commitSha: null,
      prUrl: null,
      changedFiles: []
    }
  };

  this.jobs.set(jobId, job);    // In-memory store
  this.queue.push(jobId);       // Add to processing queue
  this._persistJob(job);        // SQLite persistence

  Sentry.addBreadcrumb({ ... }); // Observability
  this.emit('job:created', job); // Event for activity feed
  this.processQueue();           // Trigger processing

  return job;
}
```

### Job Status Lifecycle

```
queued → running → completed
                 ↘ failed
```

| Status | Description | Transitions To |
|--------|-------------|----------------|
| `queued` | Job created, waiting for worker slot | `running` |
| `running` | Job actively executing | `completed`, `failed` |
| `completed` | Job finished successfully | (terminal) |
| `failed` | Job encountered error | (terminal) |

### Event System

Workers emit events that the ActivityFeedManager listens to for real-time dashboard updates:

| Event | Payload | Dashboard Action |
|-------|---------|------------------|
| `job:created` | `{ id, status, data, createdAt }` | Add to job list |
| `job:started` | `{ id, status, startedAt }` | Update status pill |
| `job:progress` | `{ id, progress, message }` | Update progress bar |
| `job:completed` | `{ id, status, result, completedAt }` | Mark complete |
| `job:failed` | `{ id, status, error, completedAt }` | Show error |

### Concurrency Control

```javascript
// Worker processes up to maxConcurrent jobs simultaneously
this.maxConcurrent = options.maxConcurrent ?? 5;  // Default: 5
this.activeJobs = 0;  // Currently executing

// processQueue() respects the limit:
while (this.queue.length > 0 && this.activeJobs < this.maxConcurrent) {
  // Dequeue and execute
}
```

### Persistence Layer

Jobs are persisted to SQLite for dashboard visibility and crash recovery:

```javascript
// Immediate persistence on creation
this._persistJob(job);

// Update on status changes
await jobRepository.saveJob(job);

// Query for dashboard
const jobs = await jobRepository.getJobsByPipeline(pipelineId, { limit, offset });
```

## Future Enhancements

1. **Worker Warm-up** - Pre-initialize frequently used workers on server startup
2. **Worker Pool** - Multiple instances per pipeline for higher concurrency
3. **Health Checks** - Monitor worker health status
4. **Metrics** - Track worker initialization time, job throughput
5. **Dynamic Loading** - Load workers from configuration file
6. **Worker Versioning** - Support multiple worker versions

## References

- **Worker Base Class:** `sidequest/core/server.js` (SidequestServer)
- **API Routes:** `api/routes/pipelines.ts`
- **Server Integration:** `api/server.js`
- **Manual Tests:** `tests/manual/test-trigger-endpoint.sh`
- **Pipeline Names:** `sidequest/utils/pipeline-names.js`

---

**Related Documentation:**
- [Error Handling](./ERROR_HANDLING.md)
- [Type System](./TYPE_SYSTEM.md)
- [API Reference](../API_REFERENCE.md)
- [Git Workflow](../CLAUDE.md#git-workflow-automation)
