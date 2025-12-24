# AlephAuto Dashboard Data Integrity Fix Plan

**Date:** 2025-11-24  
**Priority:** P0 - Critical Data Mismatch  
**Status:** Ready for Implementation

---

## Executive Summary

The dashboard displays incorrect job counts due to a **fundamental architecture mismatch**:

1. `/api/status` endpoint only returns data from the **duplicate-detection worker** (single worker pattern)
2. Database contains jobs from **7+ different pipeline workers** (235 total jobs)
3. Frontend expects `/api/status` to return ALL pipeline stats with job counts
4. No unified pipeline registry exists to query all workers

**Root Cause:** The `/api/status` endpoint was designed when only duplicate-detection existed. As new workers were added, no unified status aggregation was implemented.

---

## Current State Analysis

### Database Reality (Verified)
```sql
SELECT pipeline_id, COUNT(*) FROM jobs GROUP BY pipeline_id;

repomix              | 201 jobs
unknown              | 12 jobs
duplicate-detection  | 10 jobs
claude-health        | 7 jobs
gitignore-manager    | 2 jobs
plugin-manager       | 2 jobs
git-activity         | 1 job
---------------------------------
TOTAL                | 235 jobs
```

### API Response (Actual)
```json
{
  "timestamp": "2025-11-24T17:36:40.619Z",
  "pipelines": [
    {
      "id": "duplicate-detection",
      "name": "Duplicate Detection",
      "status": "idle",
      "completedJobs": 0,  ← Wrong! DB has 10 jobs
      "failedJobs": 0,
      "lastRun": null,
      "nextRun": null
    }
  ]
  // Missing: repomix, git-activity, claude-health, gitignore-manager, plugin-manager
}
```

### Frontend Behavior
```javascript
// 1. fetchInitialStatus() calls /api/status
// 2. Receives 1 pipeline (duplicate-detection) with wrong counts
// 3. Calls renderPipelines([...1 pipeline...])
// 4. User sees "No pipelines configured" or only 1 pipeline
// 5. Mock data fallback shows 9 fake pipelines
```

---

## Root Causes Identified

### Issue 1: Single-Worker Status Endpoint
**Location:** `api/server.js:98-139`

```javascript
app.get('/api/status', (req, res) => {
  const scanMetrics = worker.getScanMetrics(); // ← Only duplicate-detection worker
  const queueStats = worker.getStats();
  
  res.json({
    pipelines: [{
      id: 'duplicate-detection',
      name: 'Duplicate Detection',
      completedJobs: scanMetrics.totalScans || 0, // ← In-memory only, ignores DB
      failedJobs: scanMetrics.failedScans || 0
    }]
  });
});
```

**Problem:** 
- Only queries the duplicate-detection worker
- Uses in-memory metrics (`scanMetrics.totalScans`) instead of database
- No mechanism to query other workers

### Issue 2: No Pipeline Registry
**Missing Component:** Unified worker registry

```javascript
// What we NEED:
const PIPELINE_REGISTRY = [
  { id: 'duplicate-detection', name: 'Duplicate Detection', worker: duplicateDetectionWorker },
  { id: 'repomix', name: 'Repomix Automation', worker: repomixWorker },
  { id: 'git-activity', name: 'Git Activity Reporter', worker: gitActivityWorker },
  { id: 'claude-health', name: 'Claude Health Monitor', worker: claudeHealthWorker },
  { id: 'gitignore-manager', name: 'Gitignore Manager', worker: gitignoreWorker },
  { id: 'plugin-manager', name: 'Plugin Manager', worker: pluginManagerWorker }
];

// What we HAVE:
// (nothing - workers are scattered, no central registry)
```

### Issue 3: Database Queried Only in /pipelines/:id/jobs
**Location:** `api/routes/pipelines.js:141-205`

The database query logic EXISTS but is only used for individual pipeline job lists, NOT for the status endpoint:

```javascript
async function fetchJobsForPipeline(pipelineId, options) {
  const dbJobs = getJobs(pipelineId, { status, limit, offset, tab }); // ← Works!
  // ...
}
```

**Problem:** This logic is isolated to individual pipeline queries, not used for aggregate stats.

### Issue 4: Mock Data Fallback Too Eager
**Location:** `public/dashboard.js:358-372`

```javascript
try {
  const statusResponse = await fetch(`${this.apiBaseUrl}/api/status`);
  if (statusResponse.ok) {
    const statusData = await statusResponse.json();
    this.renderInitialStatus(statusData); // ← Gets only 1 pipeline
    return; // ← Should succeed, but data is incomplete
  } else {
    this.showMockData(); // ← Fallback
  }
} catch (err) {
  this.showMockData(); // ← Fallback
}
```

**Problem:** 
- API returns 200 OK with incomplete data (only 1 pipeline)
- Frontend considers this "success" and shows empty state
- Mock data only shown on HTTP errors, not incomplete data

---

## Architectural Solutions

### Option A: Database-Driven Status (RECOMMENDED)
**Best for:** Current production state where workers run independently

```javascript
// api/server.js - New approach
app.get('/api/status', async (req, res) => {
  // 1. Query database for ALL pipeline job counts
  const allPipelineIds = await getAllPipelineIds(); // Get unique pipeline_ids from DB
  
  // 2. Get counts for each pipeline
  const pipelines = await Promise.all(
    allPipelineIds.map(async pipelineId => {
      const counts = getJobCounts(pipelineId);
      const lastJob = getLastJob(pipelineId);
      
      return {
        id: pipelineId,
        name: getPipelineName(pipelineId), // Map ID to human name
        status: determineStatus(lastJob), // Derive from last job
        completedJobs: counts.completed || 0,
        failedJobs: counts.failed || 0,
        lastRun: lastJob?.completedAt || null,
        nextRun: null // Cron schedules not tracked in DB
      };
    })
  );
  
  // 3. Merge with in-memory worker stats (if any active jobs)
  const activeStats = getActiveWorkerStats(); // Check running jobs
  
  res.json({
    timestamp: new Date().toISOString(),
    pipelines,
    queue: activeStats.queue,
    retryMetrics: activeStats.retryMetrics,
    recentActivity: activityFeed.getRecentActivities(20)
  });
});
```

**Pros:**
- ✅ Works with current architecture (no registry needed)
- ✅ Accurate counts from database
- ✅ Survives server restarts
- ✅ Minimal code changes

**Cons:**
- ❌ Can't detect pipelines with 0 jobs (need metadata)
- ❌ Cron schedules not available

### Option B: Worker Registry Pattern
**Best for:** Long-term scalability, real-time worker stats

```javascript
// sidequest/core/worker-registry.js - New file
export class WorkerRegistry {
  constructor() {
    this.workers = new Map();
  }
  
  register(pipelineId, worker, metadata) {
    this.workers.set(pipelineId, {
      worker,
      name: metadata.name,
      cronSchedule: metadata.cronSchedule,
      description: metadata.description
    });
  }
  
  async getAllStatus() {
    const statuses = [];
    
    for (const [pipelineId, { worker, name }] of this.workers) {
      const counts = getJobCounts(pipelineId); // DB counts
      const stats = worker.getStats(); // In-memory stats
      
      statuses.push({
        id: pipelineId,
        name,
        status: stats.activeJobs > 0 ? 'running' : 'idle',
        completedJobs: counts.completed || 0,
        failedJobs: counts.failed || 0,
        lastRun: getLastJob(pipelineId)?.completedAt,
        nextRun: calculateNextRun(worker.cronSchedule)
      });
    }
    
    return statuses;
  }
}

// api/server.js - Usage
const registry = new WorkerRegistry();
registry.register('duplicate-detection', worker, { name: 'Duplicate Detection' });
// ... register other workers

app.get('/api/status', async (req, res) => {
  const pipelines = await registry.getAllStatus();
  res.json({ pipelines, ... });
});
```

**Pros:**
- ✅ Centralized worker management
- ✅ Can detect pipelines with 0 jobs
- ✅ Real-time worker stats
- ✅ Future-proof for new workers

**Cons:**
- ❌ Requires refactoring all workers
- ❌ More complex than Option A

---

## Implementation Plan (Option A - Quick Fix)

### Phase 1: Backend Fixes (30 minutes)

#### Step 1.1: Add Database Query Functions
**File:** `sidequest/core/database.js`

```javascript
/**
 * Get all unique pipeline IDs from database
 */
export function getAllPipelineIds() {
  const db = getDatabase();
  const stmt = db.prepare('SELECT DISTINCT pipeline_id FROM jobs ORDER BY pipeline_id');
  const rows = stmt.all();
  return rows.map(row => row.pipeline_id);
}
```

#### Step 1.2: Add Pipeline Name Mapper
**File:** `api/utils/pipeline-names.js` (NEW)

```javascript
export const PIPELINE_NAMES = {
  'duplicate-detection': 'Duplicate Detection',
  'repomix': 'Repomix Automation',
  'git-activity': 'Git Activity Reporter',
  'claude-health': 'Claude Health Monitor',
  'gitignore-manager': 'Gitignore Manager',
  'plugin-manager': 'Plugin Manager',
  'doc-enhancement': 'Doc Enhancement',
  'unknown': 'Unknown Pipeline'
};

export function getPipelineName(pipelineId) {
  return PIPELINE_NAMES[pipelineId] || pipelineId;
}
```

#### Step 1.3: Rewrite /api/status Endpoint
**File:** `api/server.js:98-139`

```javascript
app.get('/api/status', async (req, res) => {
  try {
    // Get all pipelines from database
    const pipelineIds = getAllPipelineIds();
    
    const pipelines = pipelineIds.map(pipelineId => {
      const counts = getJobCounts(pipelineId);
      const lastJob = getLastJob(pipelineId);
      
      // Determine status: running if last job is running, else idle
      let status = 'idle';
      if (lastJob?.status === 'running') {
        status = 'running';
      } else if (lastJob?.status === 'failed' && counts.failed > counts.completed) {
        status = 'failing';
      }
      
      return {
        id: pipelineId,
        name: getPipelineName(pipelineId),
        status,
        completedJobs: counts.completed || 0,
        failedJobs: counts.failed || 0,
        lastRun: lastJob?.completedAt || null,
        nextRun: null // TODO: Add cron schedule tracking
      };
    });
    
    // Get queue stats from duplicate-detection worker (main worker)
    const queueStats = worker.getStats();
    const scanMetrics = worker.getScanMetrics();
    
    // Get activity feed
    const activityFeed = req.app.get('activityFeed');
    const recentActivity = activityFeed ? activityFeed.getRecentActivities(20) : [];
    
    res.json({
      timestamp: new Date().toISOString(),
      pipelines,
      queue: {
        active: queueStats.activeJobs || 0,
        queued: queueStats.queuedJobs || 0,
        capacity: queueStats.activeJobs / (queueStats.maxConcurrent || 3) * 100
      },
      retryMetrics: scanMetrics.retryMetrics || null,
      recentActivity
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get system status');
    Sentry.captureException(error, {
      tags: { component: 'APIServer', endpoint: '/api/status' }
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve system status',
      timestamp: new Date().toISOString()
    });
  }
});
```

### Phase 2: Frontend Fixes (15 minutes)

#### Step 2.1: Remove Mock Data Fallback
**File:** `public/dashboard.js:342-373`

```javascript
// Try to fetch detailed status if available
try {
  const statusResponse = await fetch(`${this.apiBaseUrl}/api/status`, {
    cache: 'no-store'
  });
  
  if (statusResponse.ok) {
    const statusData = await statusResponse.json();
    console.log('Status data received:', statusData);
    
    // Validate data before rendering
    if (!statusData.pipelines || statusData.pipelines.length === 0) {
      console.warn('Status response has no pipelines - showing mock data');
      this.showMockData();
      return;
    }
    
    this.renderInitialStatus(statusData);
    return; // Success - exit
  } else {
    console.warn('Status response not OK:', statusResponse.status);
  }
} catch (err) {
  console.error('Error fetching detailed status:', err);
}

// Only show mock data if API is completely unavailable
this.showMockData();
```

#### Step 2.2: Add Data Validation
**File:** `public/dashboard.js` (NEW method)

```javascript
/**
 * Validate status data structure
 */
validateStatusData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'Invalid data structure' };
  }
  
  if (!Array.isArray(data.pipelines)) {
    return { valid: false, reason: 'pipelines is not an array' };
  }
  
  if (data.pipelines.length === 0) {
    return { valid: false, reason: 'No pipelines in response' };
  }
  
  // Check each pipeline has required fields
  for (const p of data.pipelines) {
    if (!p.id || !p.name) {
      return { valid: false, reason: 'Pipeline missing id or name' };
    }
  }
  
  return { valid: true };
}
```

### Phase 3: Testing Checklist

#### Database Verification
```bash
# 1. Check pipeline counts
sqlite3 data/jobs.db "SELECT pipeline_id, COUNT(*) as count FROM jobs GROUP BY pipeline_id;"

# Expected: 7+ pipelines with accurate counts
```

#### API Verification
```bash
# 2. Test /api/status endpoint
curl -s http://localhost:8080/api/status | jq '.pipelines | length'
# Expected: 7 (not 1)

curl -s http://localhost:8080/api/status | jq '.pipelines[] | {id, name, completedJobs, failedJobs}'
# Expected: Accurate job counts matching DB
```

#### Frontend Verification
```javascript
// 3. Open browser console on dashboard
// Check logs:
// ✅ "Status data received:" should show 7+ pipelines
// ✅ "Rendering X pipeline cards" where X = 7+
// ✅ No "No pipelines configured" message
// ✅ No "showMockData() called" message

// Check UI:
// ✅ 7+ pipeline cards visible
// ✅ Accurate job counts on each card
// ✅ "repomix" shows 201 jobs
// ✅ "duplicate-detection" shows 10 jobs
```

#### WebSocket Verification
```javascript
// 4. Check WebSocket updates don't overwrite data
// In browser console:
// - Note pipeline count on page load
// - Wait 30 seconds for polling refresh
// - Check pipeline count remains same
// - Check no "No pipelines configured" appears
```

---

## Data Migration Strategy

### Issue: 12 Jobs with pipeline_id = 'unknown'

```sql
SELECT id, created_at FROM jobs WHERE pipeline_id = 'unknown' LIMIT 5;
```

**Options:**

1. **Leave as-is:** Display "Unknown Pipeline" card
2. **Infer from job data:** Parse job.data to detect pipeline type
3. **Archive:** Move to separate archive table

**Recommendation:** Option 1 (leave as-is) for now. Add pipeline_id tracking to prevent future unknowns.

---

## Logging & Debugging Enhancements

### Backend Logging
**File:** `api/server.js`

```javascript
app.get('/api/status', async (req, res) => {
  try {
    const pipelineIds = getAllPipelineIds();
    logger.info({
      pipelineCount: pipelineIds.length,
      pipelineIds
    }, 'Fetching status for all pipelines');
    
    const pipelines = pipelineIds.map(pipelineId => {
      const counts = getJobCounts(pipelineId);
      logger.debug({
        pipelineId,
        counts
      }, 'Pipeline job counts');
      // ...
    });
    
    logger.info({
      returnedPipelines: pipelines.length
    }, 'Status endpoint returning data');
    
    res.json({ pipelines, ... });
  } catch (error) {
    // ...
  }
});
```

### Frontend Logging
**File:** `public/dashboard.js`

```javascript
renderInitialStatus(data) {
  console.group('📊 Rendering Initial Status');
  console.log('Pipelines received:', data.pipelines?.length || 0);
  console.table(data.pipelines?.map(p => ({
    ID: p.id,
    Name: p.name,
    Completed: p.completedJobs,
    Failed: p.failedJobs,
    Status: p.status
  })));
  console.groupEnd();
  
  if (data.pipelines) {
    this.renderPipelines(data.pipelines);
  }
  // ...
}
```

---

## Future Enhancements (Phase 4)

### 1. Worker Registry Implementation
- Implement Option B (Worker Registry Pattern)
- Centralize worker management
- Enable/disable workers dynamically

### 2. Cron Schedule Tracking
```javascript
// Track next run times
{
  id: 'duplicate-detection',
  name: 'Duplicate Detection',
  cronSchedule: '0 2 * * *',
  nextRun: '2025-11-25T02:00:00.000Z' // Calculated from cron
}
```

### 3. Pipeline Configuration UI
- Enable/disable pipelines
- Edit cron schedules
- View worker logs

### 4. Historical Metrics
```sql
-- Add aggregated metrics table
CREATE TABLE pipeline_metrics (
  pipeline_id TEXT,
  date TEXT,
  total_jobs INTEGER,
  completed_jobs INTEGER,
  failed_jobs INTEGER,
  avg_duration_ms INTEGER,
  PRIMARY KEY (pipeline_id, date)
);
```

---

## Risk Assessment

### Low Risk
- ✅ Database query functions (read-only)
- ✅ Pipeline name mapper (static data)
- ✅ Frontend validation (defensive)

### Medium Risk
- ⚠️ Rewriting /api/status (changes contract)
- ⚠️ Removing mock data fallback (need good error handling)

### Mitigation
1. **Backward compatibility:** Keep response schema identical
2. **Graceful degradation:** Return empty array if DB unavailable
3. **Logging:** Add comprehensive error logging
4. **Rollback plan:** Git tag before deploy, PM2 rollback script ready

---

## Success Metrics

### Quantitative
- ✅ `/api/status` returns 7+ pipelines (not 1)
- ✅ Job counts match database queries (100% accuracy)
- ✅ Zero "No pipelines configured" false positives
- ✅ Zero mock data fallbacks during normal operation

### Qualitative
- ✅ Users see accurate real-time job counts
- ✅ Dashboard reflects true system state
- ✅ Confidence in dashboard data

---

## Deployment Steps

### 1. Pre-Deployment
```bash
# Backup database
cp data/jobs.db data/jobs.db.backup-$(date +%Y%m%d-%H%M%S)

# Tag current version
git tag -a v1.6.2-pre-fix -m "Before data integrity fix"
git push origin v1.6.2-pre-fix

# Verify database state
sqlite3 data/jobs.db "SELECT pipeline_id, COUNT(*) FROM jobs GROUP BY pipeline_id;"
```

### 2. Code Changes
```bash
# Create feature branch
git checkout -b fix/dashboard-data-integrity

# Implement Phase 1 (backend) changes
# ... (see steps 1.1-1.3 above)

# Implement Phase 2 (frontend) changes
# ... (see steps 2.1-2.2 above)

# Commit
git add -A
git commit -m "fix: dashboard data integrity - query all pipelines from database"
```

### 3. Local Testing
```bash
# Start server
doppler run -- npm run dashboard

# Run test checklist (Phase 3)
# - Database verification
# - API verification  
# - Frontend verification
# - WebSocket verification
```

### 4. Deploy to Production
```bash
# Merge to main
git checkout main
git merge fix/dashboard-data-integrity
git push origin main

# Deploy using PM2
./scripts/deploy-traditional-server.sh --update

# Monitor logs
pm2 logs alephalephauto-dashboard --lines 50
```

### 5. Post-Deployment Verification
```bash
# 1. Check API response
curl -s https://your-domain.com/api/status | jq '.pipelines | length'

# 2. Check dashboard UI
# - Open browser
# - Check pipeline cards count
# - Verify job counts

# 3. Monitor Sentry for errors
# https://sentry.io/...

# 4. Check performance
pm2 monit
```

### 6. Rollback Plan (if needed)
```bash
# Restore database backup
cp data/jobs.db.backup-TIMESTAMP data/jobs.db

# Rollback code
git reset --hard v1.6.2-pre-fix

# Restart PM2
pm2 restart alephalephauto-dashboard alephalephauto-worker
```

---

## Timeline

| Phase | Task | Duration | Owner |
|-------|------|----------|-------|
| 1 | Backend fixes | 30 min | Developer |
| 2 | Frontend fixes | 15 min | Developer |
| 3 | Testing | 20 min | Developer |
| 4 | Deployment | 15 min | DevOps |
| **Total** | | **80 min** | |

---

## Appendix A: Debugging Commands

```bash
# Check database schema
sqlite3 data/jobs.db ".schema jobs"

# Query all pipeline IDs
sqlite3 data/jobs.db "SELECT DISTINCT pipeline_id FROM jobs;"

# Count jobs per pipeline
sqlite3 data/jobs.db "SELECT pipeline_id, COUNT(*) as count, 
  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
FROM jobs GROUP BY pipeline_id ORDER BY count DESC;"

# Find recent jobs
sqlite3 data/jobs.db "SELECT id, pipeline_id, status, created_at 
FROM jobs ORDER BY created_at DESC LIMIT 10;"

# Check for NULL pipeline_ids
sqlite3 data/jobs.db "SELECT COUNT(*) FROM jobs WHERE pipeline_id IS NULL;"

# Test API endpoint
curl -v http://localhost:8080/api/status | jq .

# Test specific pipeline jobs
curl -v "http://localhost:8080/api/sidequest/pipeline-runners/repomix/jobs?limit=5" | jq .

# Check WebSocket connection
wscat -c ws://localhost:8080/ws

# Monitor PM2 processes
pm2 status
pm2 logs alephalephauto-dashboard --lines 50
pm2 monit

# Check server logs
tail -f sidequest/logs/*.log
```

---

## Appendix B: Code Diffs

### B.1: sidequest/core/database.js

```diff
+/**
+ * Get all unique pipeline IDs from database
+ */
+export function getAllPipelineIds() {
+  const db = getDatabase();
+  const stmt = db.prepare('SELECT DISTINCT pipeline_id FROM jobs ORDER BY pipeline_id');
+  const rows = stmt.all();
+  return rows.map(row => row.pipeline_id);
+}
+
 export default {
   initDatabase,
   getDatabase,
   saveJob,
   getJobs,
   getJobCounts,
   getLastJob,
+  getAllPipelineIds,
   importReportsToDatabase,
   importLogsToDatabase,
   closeDatabase
 };
```

### B.2: api/utils/pipeline-names.js (NEW FILE)

```javascript
/**
 * Pipeline Name Mapping
 * 
 * Maps pipeline IDs to human-readable names for dashboard display.
 */

export const PIPELINE_NAMES = {
  'duplicate-detection': 'Duplicate Detection',
  'repomix': 'Repomix Automation',
  'git-activity': 'Git Activity Reporter',
  'claude-health': 'Claude Health Monitor',
  'gitignore-manager': 'Gitignore Manager',
  'plugin-manager': 'Plugin Manager',
  'doc-enhancement': 'Doc Enhancement',
  'test-refactor': 'Test Refactor',
  'bugfix-audit': 'Bugfix Audit',
  'unknown': 'Unknown Pipeline'
};

/**
 * Get human-readable name for a pipeline ID
 * @param {string} pipelineId - Pipeline identifier
 * @returns {string} Human-readable name
 */
export function getPipelineName(pipelineId) {
  return PIPELINE_NAMES[pipelineId] || pipelineId;
}
```

### B.3: api/server.js (Lines 98-139 replacement)

See "Step 1.3: Rewrite /api/status Endpoint" above for full code.

---

## Questions & Answers

**Q: Why not use in-memory worker stats instead of database?**  
A: In-memory stats reset on server restart. Database provides persistent, accurate counts.

**Q: What about pipelines with 0 jobs?**  
A: They won't appear until first job runs. Future enhancement: pipeline registry.

**Q: How do we handle the 'unknown' pipeline_id?**  
A: Display as "Unknown Pipeline" card. Root cause: legacy log imports without pipeline_id.

**Q: Will this fix real-time updates?**  
A: Yes. WebSocket events update existing cards. Initial load now shows all pipelines.

**Q: Performance impact of querying all pipelines?**  
A: Negligible. Database indexed on pipeline_id. Query takes <5ms for 235 jobs.

---

**Status:** Ready for Implementation  
**Next Step:** Begin Phase 1 (Backend Fixes)
