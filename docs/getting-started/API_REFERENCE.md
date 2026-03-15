# AlephAuto API Reference

**Base URL:** `http://localhost:8080`
**WebSocket:** `ws://localhost:8080/ws`
**Version:** 2.3.20

## Table of Contents

- [Error Response Format](#error-response-format)
- [Health & Status](#health--status)
- [Pipeline Data Flow](#pipeline-data-flow)
- [Scans](#scans)
- [Jobs](#jobs)
- [Repositories](#repositories)
- [Reports](#reports)
- [Pipelines](#pipelines)
- [WebSocket Events](#websocket-events)

---

## Error Response Format

All API endpoints return standardized error responses (v1.8.1+):

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Human-readable error message",
    "details": { }
  },
  "timestamp": "2026-01-30T12:00:00.000Z"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Validation failed, bad input |
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Authentication required |
| `INTERNAL_ERROR` | 500 | Server error |
| `WORKER_NOT_FOUND` | 404 | Pipeline worker unavailable |
| `CANCEL_FAILED` | 400 | Job cancellation failed |

### Validation Errors

Validation errors include field-level details:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed",
    "details": {
      "errors": [
        { "field": "repositoryPath", "message": "Required", "code": "invalid_type" },
        { "field": "limit", "message": "Must be positive", "code": "too_small" }
      ]
    }
  },
  "timestamp": "2026-01-30T12:00:00.000Z"
}
```

---

## Health & Status

### GET /health

Health check endpoint (no auth required).

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

---

### GET /api/health/doppler

Doppler secrets health check (no auth required).

**Response:**
```json
{
  "status": "healthy",
  "cacheAgeHours": 2.5,
  "cacheAgeMinutes": 150,
  "maxCacheAgeHours": 24,
  "warningThresholdHours": 12,
  "usingFallback": false,
  "severity": "info",
  "lastModified": "2024-01-15T08:00:00.000Z",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/status

System status with pipeline metrics and activity feed.

**Activity Feed Behavior:** The `recentActivity` field returns events from the in-memory `ActivityFeedManager` when available. After a server restart (when the in-memory feed is empty), it falls back to recent jobs from the SQLite database, mapped to the same activity format. This ensures the dashboard always shows job history even after deploys or restarts.

**Response:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "pipelines": [
    {
      "id": "duplicate-detection",
      "name": "Duplicate Detection",
      "status": "idle",
      "completedJobs": 42,
      "failedJobs": 2,
      "lastRun": null,
      "nextRun": null
    }
  ],
  "queue": {
    "active": 0,
    "queued": 3,
    "capacity": 0
  },
  "activeJobs": [
    {
      "@type": "https://schema.org/Action",
      "id": "duplicate-detection-1705312200000",
      "pipelineId": "duplicate-detection",
      "pipelineName": "Duplicate Detection",
      "status": "running",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "startedAt": "2024-01-15T10:00:01.000Z",
      "completedAt": null
    }
  ],
  "queuedJobs": [],
  "retryMetrics": {
    "totalRetries": 5,
    "successfulRetries": 4,
    "failedRetries": 1
  },
  "recentActivity": [
    {
      "id": "duplicate-detection-1705312200000",
      "type": "job:completed",
      "event": "Job Completed",
      "message": "Job duplicate-detection-1705312200000 completed",
      "jobId": "duplicate-detection-1705312200000",
      "jobType": "duplicate-detection",
      "pipelineId": "duplicate-detection",
      "pipelineName": "Duplicate Detection",
      "status": "completed",
      "timestamp": "2024-01-15T10:00:45.000Z"
    }
  ]
}
```

---

### GET /api/pipeline-data-flow

Renders `docs/architecture/SYSTEM-DATA-FLOW.md` as sanitized HTML (no auth required).

**Response:**
- Content-Type: `text/html`
- Body: Markdown parsed to HTML via `marked`, sanitized with DOMPurify (allows `pre`, `code` tags for mermaid blocks)

**Errors:**
- `500`: Failed to load documentation file

---

### GET /ws/status

WebSocket connection status.

**Response:**
```json
{
  "connected_clients": 2,
  "websocket_url": "ws://localhost:8080/ws",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Scans

### POST /api/scans/start

Start a new duplicate detection scan for a single repository.

**Rate Limited:** Yes (strict)
**Validation:** Zod schema (`StartScanRequestSchema`)

**Request Body:**
```json
{
  "repositoryPath": "/path/to/repository",
  "options": {
    "forceRefresh": false
  }
}
```

**Response (201):**
```json
{
  "scanId": "duplicate-detection-1705312200000",
  "repositoryPath": "/path/to/repository",
  "status": "queued",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### POST /api/scans/start-multi

Start an inter-project scan across multiple repositories.

**Rate Limited:** Yes (strict)

**Request Body:**
```json
{
  "repositoryPaths": [
    "/path/to/repo1",
    "/path/to/repo2"
  ],
  "groupName": "my-project-group"
}
```

**Validation:**
- `repositoryPaths` must be an array with at least 2 repositories

**Response (201):**
```json
{
  "success": true,
  "job_id": "api-inter-scan-1705312200000",
  "group_name": "my-project-group",
  "repository_count": 2,
  "status_url": "/api/scans/api-inter-scan-1705312200000/status",
  "results_url": "/api/scans/api-inter-scan-1705312200000/results",
  "message": "Inter-project scan started successfully",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/scans/:scanId/status

Get scan status by ID.

**Parameters:**
- `scanId` (path): Scan identifier

**Response:**
```json
{
  "scan_id": "duplicate-detection-1705312200000",
  "status": "running",
  "active_jobs": 1,
  "queued_jobs": 2,
  "completed_scans": 42,
  "failed_scans": 2,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/scans/:scanId/results

Get scan results by ID.

**Parameters:**
- `scanId` (path): Scan identifier
- `format` (query, optional): Result format (`"summary"` or `"full"`, default: `"summary"`)

**Response (Summary):**
```json
{
  "scanId": "duplicate-detection-1705312200000",
  "status": "completed",
  "startTime": "2024-01-15T10:00:00.000Z",
  "endTime": "2024-01-15T10:00:45.000Z",
  "results": {
    "scanType": "intra-project",
    "totalDuplicates": 5,
    "reportPath": "output/reports/scan-report-1705312200000.html"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response (Full):**
```json
{
  "scanId": "duplicate-detection-1705312200000",
  "status": "completed",
  "startTime": "2024-01-15T10:00:00.000Z",
  "endTime": "2024-01-15T10:00:45.000Z",
  "results": {
    "scanType": "intra-project",
    "totalDuplicates": 5,
    "duplicates": 5,
    "totalBlocks": 220,
    "scanDuration": 45000,
    "suggestions": 3,
    "reportPath": "output/reports/scan-report-1705312200000.html"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Jobs

### GET /api/jobs

List jobs across pipelines (with optional status filter).

**Response:**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": "duplicate-detection-1705312200000",
        "pipelineId": "duplicate-detection",
        "status": "completed"
      }
    ],
    "total": 1,
    "page": 0,
    "limit": 50,
    "hasMore": false
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/jobs/:jobId

Get details for a single job.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "duplicate-detection-1705312200000",
    "pipelineId": "duplicate-detection",
    "status": "completed",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "startedAt": "2024-01-15T10:00:01.000Z",
    "completedAt": "2024-01-15T10:00:45.000Z"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### POST /api/jobs/:jobId/cancel

Cancel a queued or paused job.

Running jobs are not cancellable.

**Parameters:**
- `jobId` (path): Job identifier

**Response:**
```json
{
  "success": true,
  "message": "Job duplicate-detection-1705312200000 cancelled successfully",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### POST /api/jobs/:jobId/retry

Retry a failed job by creating a new retry job.

**Parameters:**
- `jobId` (path): Failed job identifier

**Response:**
```json
{
  "success": true,
  "message": "Job retried successfully",
  "newJobId": "duplicate-detection-retry-1705312200000",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/jobs/:jobId/logs

Get synthesized logs for a specific job (built from job lifecycle data).

**Parameters:**
- `jobId` (path): Job identifier

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "duplicate-detection-1705312200000",
    "logs": [
      "[2024-01-15T10:00:00.000Z] Job created (pipeline: duplicate-detection)",
      "[2024-01-15T10:00:01.000Z] Job started",
      "[2024-01-15T10:00:45.000Z] Job completed successfully"
    ],
    "totalLines": 3
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**
- `400`: Invalid job ID format
- `404`: Job not found

---

### POST /api/jobs/bulk-import

Bulk import jobs (for database migration). Requires `MIGRATION_API_KEY` environment variable.

**Rate Limited:** Yes (bulk import limiter)

**Request Body:**
```json
{
  "jobs": [
    { "id": "job-1", "status": "completed", "pipeline_id": "duplicate-detection" }
  ],
  "apiKey": "migration-key-from-env"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "imported": 10,
    "skipped": 2,
    "errors": []
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**
- `400`: Invalid request (missing jobs array or required fields)
- `401`: Invalid migration API key
- `503`: Migration API not configured

---

## Repositories

### GET /api/repositories

List all configured repositories.

**Validation:** Zod schema (`RepositoryQuerySchema`)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `enabled` | string | Filter by enabled status (`"true"` or `"false"`) |
| `priority` | string | Filter by priority level |
| `tag` | string | Filter by tag |

**Response:**
```json
{
  "total": 5,
  "repositories": [
    {
      "name": "my-repo",
      "path": "/path/to/my-repo",
      "priority": "high",
      "scan_frequency": "daily",
      "enabled": true,
      "last_scanned": "2024-01-14T10:00:00.000Z",
      "tags": ["frontend", "react"],
      "scan_history": []
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/repositories/:name

Get repository details by name.

**Parameters:**
- `name` (path): Repository name

**Response:**
```json
{
  "name": "my-repo",
  "path": "/path/to/my-repo",
  "priority": "high",
  "scanFrequency": "daily",
  "enabled": true,
  "tags": ["frontend", "react"],
  "cache_status": {
    "cached": true,
    "lastCached": "2024-01-14T10:00:00.000Z",
    "cacheAgeHours": 24.5
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**
- `404`: Repository not found

---

### POST /api/repositories/:name/scan

Trigger a scan for a specific repository.

**Rate Limited:** Yes (strict)

**Parameters:**
- `name` (path): Repository name

**Request Body:**
```json
{
  "forceRefresh": false
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "repo-scan-my-repo-1705312200000",
  "repository": "my-repo",
  "status_url": "/api/scans/repo-scan-my-repo-1705312200000/status",
  "results_url": "/api/scans/repo-scan-my-repo-1705312200000/results",
  "message": "Scan started for repository 'my-repo'",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**
- `404`: Repository not found

---

### GET /api/repositories/:name/cache

Get cache status for a repository.

**Parameters:**
- `name` (path): Repository name

**Response:**
```json
{
  "repository": "my-repo",
  "cache_status": {
    "cached": true,
    "lastCached": "2024-01-14T10:00:00.000Z",
    "cacheAgeHours": 24.5
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**
- `404`: Repository not found

---

### DELETE /api/repositories/:name/cache

Invalidate cache for a repository.

**Parameters:**
- `name` (path): Repository name

**Response:**
```json
{
  "success": true,
  "repository": "my-repo",
  "cache_entries_deleted": 15,
  "message": "Cache invalidated successfully",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**
- `404`: Repository not found

---

### GET /api/repositories/groups/list

List repository groups.

**Validation:** Zod schema (`RepositoryGroupQuerySchema`)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `enabled` | string | Filter by enabled status (`"true"` or `"false"`) |

**Response:**
```json
{
  "total": 2,
  "groups": [
    {
      "name": "frontend-apps",
      "description": "All frontend applications",
      "scan_type": "inter-project",
      "enabled": true,
      "repositories": ["app1", "app2", "shared-ui"]
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/repositories/groups/:name

Get repository group details.

**Parameters:**
- `name` (path): Group name

**Response:**
```json
{
  "name": "frontend-apps",
  "description": "All frontend applications",
  "scanType": "inter-project",
  "enabled": true,
  "repositories": ["app1", "app2", "shared-ui"],
  "repository_details": [
    {
      "name": "app1",
      "path": "/path/to/app1",
      "enabled": true
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**
- `404`: Repository group not found

---

## Reports

### GET /api/reports

List available reports.

**Validation:** Zod schema (`ReportQuerySchema`)

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Max reports to return |
| `format` | string | - | Filter by format: `html`, `markdown`, `json` |
| `type` | string | - | Filter by type: `summary`, `full` |

**Response:**
```json
{
  "total": 10,
  "reports": [
    {
      "name": "scan-report-2024-01-15.html",
      "url": "/api/reports/scan-report-2024-01-15.html",
      "size": 45678,
      "created": "2024-01-15T10:00:00.000Z",
      "modified": "2024-01-15T10:00:00.000Z",
      "format": "html",
      "type": "full"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/reports/:filename

Get a specific report file.

**Parameters:**
- `filename` (path): Report filename

**Response:**
- Content-Type based on file extension:
  - `.html` → `text/html`
  - `.md` → `text/markdown`
  - `.json` → `application/json`

**Errors:**
- `400`: Invalid filename (directory traversal attempt)
- `404`: Report not found

---

### DELETE /api/reports/:filename

Delete a report file.

**Parameters:**
- `filename` (path): Report filename

**Response:**
```json
{
  "success": true,
  "message": "Report 'scan-report-2024-01-15.html' deleted successfully",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**
- `400`: Invalid filename
- `404`: Report not found

---

### GET /api/reports/:scanId/summary

Get scan summary by scan ID.

**Parameters:**
- `scanId` (path): Scan identifier

**Response:**
```json
{
  "scanId": "api-scan-1705312200000",
  "totalFiles": 150,
  "duplicatesFound": 12,
  "similarity_threshold": 0.85,
  "duration_ms": 45000
}
```

**Errors:**
- `404`: Summary not found for scan

---

## Pipelines

### GET /api/pipelines/:pipelineId/jobs

Fetch job history for a specific pipeline.

**Validation:** Zod schema (`JobQueryParamsSchema`)

**Parameters:**
- `pipelineId` (path): Pipeline identifier (e.g., `duplicate-detection`)

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | - | Filter by status: `queued`, `running`, `completed`, `failed` |
| `limit` | number | 10 | Max jobs to return (max: 100) |
| `offset` | number | 0 | Pagination offset |
| `tab` | string | - | UI tab context: `recent`, `failed`, `all` |

**Response:**
```json
{
  "pipelineId": "duplicate-detection",
  "jobs": [
    {
      "id": "job-123",
      "pipelineId": "duplicate-detection",
      "status": "completed",
      "startTime": "2024-01-15T09:30:00.000Z",
      "endTime": "2024-01-15T09:33:20.000Z",
      "duration": 200000,
      "parameters": {
        "repositoryPath": "/path/to/repo"
      },
      "result": {
        "output": "Scan completed successfully",
        "stats": {
          "filesScanned": 42,
          "duplicatesFound": 3,
          "reportGenerated": true
        }
      }
    }
  ],
  "total": 1,
  "hasMore": false,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### POST /api/pipelines/:pipelineId/trigger

Manually trigger a pipeline job.

**Validation:** Zod schema (`ManualTriggerRequestSchema`)

**Parameters:**
- `pipelineId` (path): Pipeline identifier

**Request Body:**
```json
{
  "parameters": {
    "repositoryPath": "/path/to/repo",
    "forceRefresh": true
  }
}
```

**Response (201):**
```json
{
  "jobId": "job-1705312200000",
  "pipelineId": "duplicate-detection",
  "status": "queued",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## WebSocket Events

Connect to `ws://localhost:8080/ws` for real-time updates.

### Event Types

| Event | Description |
|-------|-------------|
| `job:created` | New job added to queue |
| `job:started` | Job started processing |
| `job:progress` | Job progress update |
| `job:completed` | Job finished successfully |
| `job:failed` | Job failed with error |
| `activity` | Activity feed update |

### Event Payload

```json
{
  "event": "job:completed",
  "data": {
    "jobId": "job-123",
    "pipelineId": "duplicate-detection",
    "status": "completed",
    "result": {
      "filesScanned": 42,
      "duplicatesFound": 3
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Common Status Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

---

## Authentication

Currently, the API uses basic authentication middleware. Check `api/middleware/auth.ts` for implementation details.

## Rate Limiting

Strict rate limiting is applied to mutation endpoints:
- `POST /api/scans/start`
- `POST /api/scans/start-multi`
- `POST /api/repositories/:name/scan`
- `POST /api/pipelines/:pipelineId/trigger`

Check `api/middleware/rate-limit.ts` for configuration.

---

## Testing Examples

```bash
# Health check
curl http://localhost:8080/health

# List repositories
curl http://localhost:8080/api/repositories

# Get system status
curl http://localhost:8080/api/status

# Start a scan
curl -X POST http://localhost:8080/api/scans/start \
  -H "Content-Type: application/json" \
  -d '{"repositoryPath": "/path/to/repo"}'

# Get pipeline jobs
curl "http://localhost:8080/api/pipelines/duplicate-detection/jobs?limit=5"

# Get job logs
curl http://localhost:8080/api/jobs/duplicate-detection-1705312200000/logs

# List reports
curl "http://localhost:8080/api/reports?format=html&limit=10"

# Trigger pipeline manually
curl -X POST http://localhost:8080/api/pipelines/duplicate-detection/trigger \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"repositoryPath": "/path/to/repo"}}'
```

---

**Last Updated:** 2026-03-09
**Version:** 2.3.20
