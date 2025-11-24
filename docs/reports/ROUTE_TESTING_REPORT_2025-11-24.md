# API Route Testing Report
**Date:** 2025-11-24
**Environment:** Development (PM2, localhost:8080)
**Database:** `/Users/alyshialedlie/code/jobs/data/jobs.db`

## Executive Summary

Comprehensive testing of 4 critical API routes revealed **2 major data integrity bugs** affecting dashboard functionality:

1. **E1 (CRITICAL)**: `/api/status` returns only 1 hardcoded pipeline instead of 7 actual pipelines from database
2. **E2 (HIGH)**: `/api/sidequest/pipeline-runners/:id/jobs` returns page size as `total` instead of actual database count

Both issues cause the dashboard to display incomplete/misleading information. Security measures are working correctly.

---

## Database Baseline

**Query:** `SELECT DISTINCT pipeline_id FROM jobs ORDER BY pipeline_id`

```
claude-health
duplicate-detection
git-activity
gitignore-manager
plugin-manager
repomix
unknown
```

**Total Pipelines:** 7
**Total Jobs:** 235

**Job Distribution:**
```
repomix:              201 (80 completed, 121 failed)
unknown:               12 (12 completed)
duplicate-detection:   10 (10 completed)
claude-health:          7 (7 completed)
gitignore-manager:      2 (2 completed)
plugin-manager:         2 (2 completed)
git-activity:           1 (1 completed)
```

---

## Test Results

### 1. GET /api/status

**Purpose:** System status with pipeline stats, queue info, activity feed
**Auth:** Public (no API key required)

**Status:** FAILED (Critical Bug E1)

**Response:**
```json
{
  "timestamp": "2025-11-24T17:58:04.596Z",
  "pipelines": [
    {
      "id": "duplicate-detection",
      "name": "Duplicate Detection",
      "status": "idle",
      "completedJobs": 0,
      "failedJobs": 0,
      "lastRun": null,
      "nextRun": null
    }
  ],
  "queue": { "active": 0, "queued": 0, "capacity": null },
  "retryMetrics": { "activeRetries": 0, ... },
  "recentActivity": []
}
```

**Issues Found:**

- **E1 (CRITICAL)**: Only returns 1 pipeline (`duplicate-detection`) when database contains 7 pipelines
- Hardcoded pipeline definition in `/Users/alyshialedlie/code/jobs/api/server.js` lines 110-120
- Uses single `worker` instance metrics instead of querying database
- Job counts are incorrect (shows 0 completed when database has 10)

**Root Cause:**
```javascript
// api/server.js:110-120
pipelines: [
  {
    id: 'duplicate-detection',
    name: 'Duplicate Detection',
    status: queueStats.activeJobs > 0 ? 'running' : 'idle',
    completedJobs: scanMetrics.totalScans || 0,  // Wrong source
    failedJobs: scanMetrics.failedScans || 0,    // Wrong source
    lastRun: null,
    nextRun: null
  }
]
```

**Expected Behavior:**
- Should query database for all distinct pipeline_id values
- Return stats for all 7 pipelines:
  - claude-health (7 completed)
  - duplicate-detection (10 completed)
  - git-activity (1 completed)
  - gitignore-manager (2 completed)
  - plugin-manager (2 completed)
  - repomix (80 completed, 121 failed)
  - unknown (12 completed)

**Impact:** Dashboard pipeline selector/overview shows incomplete data

---

### 2. GET /api/sidequest/pipeline-runners/:pipelineId/jobs

**Purpose:** Fetch job history for specific pipeline with pagination
**Auth:** Public (no API key required)

**Status:** PARTIAL PASS (Data integrity bug E2)

**Test Cases:**

#### 2.1: duplicate-detection (10 jobs in DB)
```bash
GET /api/sidequest/pipeline-runners/duplicate-detection/jobs?limit=10
```
**Result:** PASS (returns all 10 jobs)
```json
{
  "pipelineId": "duplicate-detection",
  "jobs": [10 job objects],
  "total": 10,
  "hasMore": false
}
```

#### 2.2: git-activity (1 job in DB)
```bash
GET /api/sidequest/pipeline-runners/git-activity/jobs?limit=10
```
**Result:** PASS (returns 1 job)
```json
{
  "pipelineId": "git-activity",
  "jobs": [1 job object],
  "total": 1,
  "hasMore": false
}
```

#### 2.3: repomix (201 jobs in DB)
```bash
GET /api/sidequest/pipeline-runners/repomix/jobs?limit=100
```
**Result:** FAILED (E2 - incorrect total)
```json
{
  "pipelineId": "repomix",
  "jobs": [100 job objects],
  "total": 100,        // BUG: Should be 201
  "hasMore": true
}
```

**Database Count:** 201 jobs (80 completed, 121 failed)
**API Response:** `total: 100` (page size, not actual count)

#### 2.4: Pagination Test
```bash
# Page 1 (offset=0)
GET /api/sidequest/pipeline-runners/repomix/jobs?limit=100&offset=0
Response: 100 jobs (44 completed, 56 failed), total: 100, hasMore: true

# Page 2 (offset=100)
GET /api/sidequest/pipeline-runners/repomix/jobs?limit=100&offset=100
Response: 100 jobs (35 completed, 65 failed), total: 100, hasMore: true

# Page 3 (offset=200)
GET /api/sidequest/pipeline-runners/repomix/jobs?limit=100&offset=200
Response: 1 job (1 completed, 0 failed), total: 1, hasMore: false
```

**Issues Found:**

- **E2 (HIGH)**: `total` field returns page size (`jobs.length`) instead of actual database count
- Root cause: `/Users/alyshialedlie/code/jobs/api/routes/pipelines.js` line 53
  ```javascript
  total: jobs.length  // BUG: Should query database for COUNT(*)
  ```
- Pagination works correctly but total count is misleading
- `hasMore` logic is correct (compares `jobs.length === limit`)

**Expected Behavior:**
- `total` should always reflect actual database count (e.g., 201 for repomix)
- Dashboard needs accurate totals for UI indicators (e.g., "Showing 1-100 of 201")

#### 2.5: Status Filter Test
```bash
GET /api/sidequest/pipeline-runners/repomix/jobs?status=failed&limit=50
```
**Result:** PARTIAL PASS
- Returns 50 failed jobs correctly
- `total: 50` (page size) - Should be 121 (actual failed count in DB)

#### 2.6: Non-existent Pipeline
```bash
GET /api/sidequest/pipeline-runners/nonexistent-pipeline/jobs?limit=10
```
**Result:** PASS (graceful handling)
```json
{
  "pipelineId": "nonexistent-pipeline",
  "jobs": [],
  "total": 0,
  "hasMore": false
}
```

#### 2.7: Validation Tests
```bash
# Limit too high
GET /api/sidequest/pipeline-runners/repomix/jobs?limit=1000
Response: 400 Bad Request
{
  "error": "Bad Request",
  "message": "Query parameter validation failed",
  "errors": [
    {
      "field": "limit",
      "message": "Number must be less than or equal to 100",
      "code": "too_big"
    }
  ]
}
```
**Result:** PASS (Zod validation working correctly)

**Impact:** Dashboard pagination shows incorrect totals, misleading users about data volume

---

### 3. GET /api/reports (List reports)

**Purpose:** List available reports with filters
**Auth:** Public (no API key required)

**Status:** PASS

**Test Cases:**

#### 3.1: Basic Listing
```bash
GET /api/reports?limit=10
```
**Result:** PASS
```json
{
  "total": 10,
  "reports": [
    {
      "name": "inter-project-scan-2repos-2025-11-24.json",
      "url": "/api/reports/inter-project-scan-2repos-2025-11-24.json",
      "size": 5144199,
      "created": "2025-11-24T07:00:34.242Z",
      "modified": "2025-11-24T07:00:34.243Z",
      "format": "json",
      "type": "full"
    },
    // ... 9 more reports
  ],
  "timestamp": "2025-11-24T17:58:22.686Z"
}
```

#### 3.2: Format Filter
```bash
GET /api/reports?format=json&limit=5
```
**Result:** PASS
- Returns only JSON reports
- Correct format detection (`.json`, `.html`, `.md`)

#### 3.3: Type Filter
```bash
GET /api/reports?type=summary&limit=5
```
**Result:** PASS
- Correctly filters summary reports (filename contains "summary")
- Type inference working correctly

**Notes:**
- Sorting by `modified` (newest first) is correct
- File stats (size, created, modified) are accurate
- URL encoding is proper (`encodeURIComponent`)

---

### 4. GET /api/reports/:filename (Retrieve specific report)

**Purpose:** Download specific report file
**Auth:** Public (no API key required)

**Status:** PASS (Security validated)

**Test Cases:**

#### 4.1: Valid JSON Report
```bash
GET /api/reports/inter-project-scan-2repos-2025-11-24-summary.json
```
**Result:** PASS
```json
{
  "scan_type": "inter-project",
  "generated_at": "2025-11-24T07:00:34.223Z",
  "summary": {
    "total_duplicate_groups": 933,
    "repositories_scanned": 2,
    ...
  }
}
```
- Content-Type: `application/json`
- File content correct

#### 4.2: Valid HTML Report
```bash
GET /api/reports/scan-unknown-2025-11-24.html
```
**Result:** PASS
- HTTP/1.1 200 OK
- Content-Type: `text/html; charset=utf-8`
- HTML content rendered correctly

#### 4.3: Security - Directory Traversal (../)
```bash
GET /api/reports/../../../etc/passwd
```
**Result:** PASS (blocked)
```
HTTP Status: 400 Bad Request
{
  "error": "Bad Request",
  "message": "Invalid filename",
  "timestamp": "2025-11-24T17:58:58.197Z"
}
```

#### 4.4: Security - URL-encoded Traversal
```bash
GET /api/reports/..%2F..%2F..%2Fetc%2Fpasswd
```
**Result:** PASS (blocked)
- Same 400 response
- Security check at `/Users/alyshialedlie/code/jobs/api/routes/reports.js` line 98-104

#### 4.5: Security - Dots in Filename
```bash
GET /api/reports/test..test
```
**Result:** PASS (blocked - strict check)
- Blocks any filename containing ".." (even if not for traversal)
- May be too strict (e.g., `report-v1..2.json` would be blocked)

**Recommendation:** Consider relaxing to only block "../" sequences rather than all ".."

#### 4.6: Non-existent File
```bash
GET /api/reports/nonexistent.json
```
**Result:** PASS
```
HTTP Status: 404 Not Found
{
  "error": "Not Found",
  "message": "Report 'nonexistent.json' not found",
  "timestamp": "2025-11-24T17:58:32.210Z"
}
```

**Security Notes:**
- Directory traversal protection is effective (lines 98-104)
- No API key required for reports (design decision - public access)
- Content-Type headers set correctly for all formats

---

## Error Handling Tests

All endpoints return proper error responses:

1. **Validation Errors:** 400 Bad Request with Zod error details
2. **Not Found:** 404 with descriptive message
3. **Security Violations:** 400 Bad Request (directory traversal)
4. **Graceful Degradation:** Empty arrays for non-existent pipelines (not 404)

---

## Data Mismatches Summary

| Endpoint | Database Value | API Response | Issue |
|----------|---------------|--------------|-------|
| `/api/status` pipelines count | 7 pipelines | 1 pipeline | E1 (CRITICAL) |
| `/api/status` duplicate-detection completed | 10 jobs | 0 jobs | E1 (CRITICAL) |
| `/api/.../repomix/jobs` total | 201 jobs | 100 (page size) | E2 (HIGH) |
| `/api/.../repomix/jobs?status=failed` total | 121 jobs | 50 (page size) | E2 (HIGH) |

---

## Security Vulnerabilities

**NONE FOUND**

All security measures are working correctly:
- Directory traversal blocked (strict ".." check)
- Validation prevents malformed requests (Zod schemas)
- Error messages don't leak internal paths
- No unauthorized access to sensitive files

---

## Recommendations

### Fix E1: /api/status Pipeline Discovery (CRITICAL)

**Current Implementation:** `/Users/alyshialedlie/code/jobs/api/server.js` lines 98-140

**Required Changes:**

1. Query database for all distinct pipeline IDs:
   ```sql
   SELECT DISTINCT pipeline_id FROM jobs
   ```

2. For each pipeline, get job counts:
   ```sql
   SELECT
     COUNT(*) as total,
     SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
     SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
     MAX(end_time) as lastRun
   FROM jobs
   WHERE pipeline_id = ?
   ```

3. Map pipeline IDs to human-readable names:
   ```javascript
   const PIPELINE_NAMES = {
     'duplicate-detection': 'Duplicate Detection',
     'repomix': 'Repomix Automation',
     'git-activity': 'Git Activity Reporter',
     'claude-health': 'Claude Health Monitor',
     'gitignore-manager': 'Gitignore Manager',
     'plugin-manager': 'Plugin Manager',
     'unknown': 'Unknown Pipeline'
   };
   ```

4. Remove hardcoded worker-specific metrics

**Impact:** Dashboard will show all 7 pipelines with accurate job counts

---

### Fix E2: Job List Total Count (HIGH)

**Current Implementation:** `/Users/alyshialedlie/code/jobs/api/routes/pipelines.js` lines 50-56

**Required Changes:**

1. Add separate COUNT query before fetching jobs:
   ```javascript
   // Get total count (respecting filters)
   const totalCount = await countJobsForPipeline(pipelineId, { status, tab });

   // Then fetch paginated jobs
   const jobs = await fetchJobsForPipeline(pipelineId, {
     status, limit, offset, tab
   });

   const response = {
     pipelineId,
     jobs,
     total: totalCount,  // Actual database count
     hasMore: jobs.length === limit,
     timestamp: new Date().toISOString()
   };
   ```

2. Implement `countJobsForPipeline()` helper:
   ```javascript
   async function countJobsForPipeline(pipelineId, options) {
     const { status, tab } = options;

     let query = 'SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?';
     const params = [pipelineId];

     if (status) {
       query += ' AND status = ?';
       params.push(status);
     }

     if (tab === 'failed') {
       query += ' AND status = "failed"';
     }

     const result = await db.get(query, params);
     return result.count;
   }
   ```

**Impact:** Dashboard pagination will show "Showing 1-100 of 201" instead of "Showing 1-100 of 100"

---

### Optional: Relax Directory Traversal Check

**Current:** Blocks any filename containing ".." (even `report-v1..2.json`)
**Consideration:** Only block "../" sequences:

```javascript
// More precise check (optional)
if (filename.includes('../') || filename.includes('/')) {
  return res.status(400).json({ ... });
}
```

**Trade-off:** Slightly less paranoid but more permissive for legitimate filenames

---

## Code Review Notes

### Positive Patterns

1. **Type Safety:** Zod schemas with TypeScript inference (no duplication)
2. **Validation Middleware:** Centralized request validation
3. **Sentry Integration:** Comprehensive error tracking with context
4. **Logging:** Structured logging with pino
5. **Security:** Proactive directory traversal prevention
6. **Error Responses:** Consistent format with timestamps

### Areas for Improvement

1. **Mock Data in TypeScript:** `pipelines.ts` still has mock data (lines 186-260)
   - Compiled `.js` version has real implementation
   - TypeScript source should match compiled output

2. **Hardcoded Pipelines:** `/api/status` should be dynamic

3. **Total Count:** Pagination needs separate COUNT query

4. **Database Access:** Direct SQL queries in route handlers
   - Consider repository/service layer abstraction
   - Would make COUNT queries easier to optimize

5. **Caching:** No caching for expensive queries
   - Pipeline lists change infrequently (could cache 30s)
   - Job counts could benefit from Redis cache

---

## Performance Notes

All routes responded in < 100ms (localhost, no load):
- `/api/status`: ~15ms
- `/api/sidequest/pipeline-runners/:id/jobs`: ~20-50ms (depends on job count)
- `/api/reports`: ~10ms (file system scan)
- `/api/reports/:filename`: ~5ms (single file read)

No performance issues detected at current scale (235 jobs).

---

## Files Analyzed

1. `/Users/alyshialedlie/code/jobs/api/server.js` (lines 98-140) - Status endpoint
2. `/Users/alyshialedlie/code/jobs/api/routes/pipelines.ts` (mock data version)
3. `/Users/alyshialedlie/code/jobs/api/routes/pipelines.js` (actual implementation, lines 35-82, 141-179)
4. `/Users/alyshialedlie/code/jobs/api/routes/reports.js` (complete file)
5. `/Users/alyshialedlie/code/jobs/data/jobs.db` (SQLite database queries)

---

## Test Environment

- **Server:** PM2 process `aleph-dashboard` (PID 36830, 24m uptime, 19 restarts)
- **Port:** 8080
- **Health:** Responding correctly (`/health` returns 200)
- **Database:** SQLite at `/Users/alyshialedlie/code/jobs/data/jobs.db`
- **OS:** macOS (Darwin 25.1.0)

---

## Conclusion

**2 MAJOR BUGS** identified that directly impact dashboard functionality:

1. **E1 (CRITICAL):** System status shows only 1/7 pipelines
2. **E2 (HIGH):** Job pagination shows incorrect totals

Both bugs are caused by implementation shortcuts (hardcoded data, missing COUNT queries) rather than fundamental architecture issues. Fixes are straightforward.

**Security:** No vulnerabilities found. All defensive measures working correctly.

**Next Steps:**
1. Fix E1 by querying database for pipeline list
2. Fix E2 by adding COUNT query before job fetch
3. Update TypeScript source to match compiled JavaScript
4. Add integration tests for these endpoints
5. Consider caching for frequently-accessed data

---

**Report Generated:** 2025-11-24T18:00:00Z
**Testing Duration:** 30 minutes
**Routes Tested:** 4 endpoints, 20+ test cases
**Database Queries:** 10+ validation queries
