# Dashboard Data Integrity - Quick Debug Checklist

**Use this checklist to verify data integrity issues before and after fixes.**

---

## Pre-Fix Diagnostics

### 1. Database Verification ✓
```bash
# Check actual job counts in database
sqlite3 /Users/alyshialedlie/code/jobs/data/jobs.db "
SELECT 
  pipeline_id, 
  COUNT(*) as total,
  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
  SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as running
FROM jobs 
GROUP BY pipeline_id 
ORDER BY total DESC;
"
```

**Expected Output:**
```
repomix|201|201|0|0
unknown|12|12|0|0
duplicate-detection|10|10|0|0
claude-health|7|7|0|0
gitignore-manager|2|2|0|0
plugin-manager|2|2|0|0
git-activity|1|1|0|0
```

### 2. API Response Check ✓
```bash
# Test /api/status endpoint
curl -s http://localhost:8080/api/status | jq '{
  pipelineCount: .pipelines | length,
  pipelines: [.pipelines[] | {id, name, completedJobs, failedJobs}]
}'
```

**Current (Broken) Output:**
```json
{
  "pipelineCount": 1,
  "pipelines": [
    {
      "id": "duplicate-detection",
      "name": "Duplicate Detection",
      "completedJobs": 0,
      "failedJobs": 0
    }
  ]
}
```

**Expected (Fixed) Output:**
```json
{
  "pipelineCount": 7,
  "pipelines": [
    {"id": "duplicate-detection", "name": "Duplicate Detection", "completedJobs": 10, "failedJobs": 0},
    {"id": "repomix", "name": "Repomix Automation", "completedJobs": 201, "failedJobs": 0},
    {"id": "git-activity", "name": "Git Activity Reporter", "completedJobs": 1, "failedJobs": 0},
    ...
  ]
}
```

### 3. Individual Pipeline Job Queries ✓
```bash
# Test pipeline-specific job history (should work already)
curl -s "http://localhost:8080/api/sidequest/pipeline-runners/repomix/jobs?limit=5" | jq '{
  pipelineId,
  jobCount: .jobs | length,
  hasMore,
  firstJob: .jobs[0] | {id, status, createdAt}
}'
```

**Expected Output:**
```json
{
  "pipelineId": "repomix",
  "jobCount": 5,
  "hasMore": true,
  "firstJob": {
    "id": "repomix-...",
    "status": "completed",
    "createdAt": "2025-11-..."
  }
}
```

### 4. Browser Console Logs (Dashboard Page)

Open browser console at http://localhost:8080/ and check:

**Current (Broken) Logs:**
```
Status data received: {pipelines: Array(1), ...}
Rendering pipelines from API: (1) [{...}]
Pipelines array length: 1
Rendering 1 pipeline cards
```

**Expected (Fixed) Logs:**
```
Status data received: {pipelines: Array(7), ...}
Rendering pipelines from API: (7) [{...}, {...}, ...]
Pipelines array length: 7
Rendering 7 pipeline cards
```

### 5. Frontend Element Inspection

**Check Pipeline Cards Container:**
```javascript
// Run in browser console
document.getElementById('pipelineCards').children.length
// Current: 1 or "No pipelines configured" message
// Expected: 7 pipeline cards
```

**Check Pipeline IDs:**
```javascript
// Run in browser console
Array.from(document.querySelectorAll('[data-pipeline-id]')).map(el => el.dataset.pipelineId)
// Current: ["duplicate-detection"]
// Expected: ["duplicate-detection", "repomix", "git-activity", "claude-health", "gitignore-manager", "plugin-manager", "unknown"]
```

---

## Post-Fix Verification

### 1. Restart Server
```bash
# Kill existing process
pm2 stop alephalephauto-dashboard alephalephauto-worker

# Or if running manually:
# Ctrl+C

# Start with Doppler
doppler run -- npm run dashboard
```

### 2. Database Integrity Check
```bash
# Verify database wasn't corrupted
sqlite3 /Users/alyshialedlie/code/jobs/data/jobs.db "PRAGMA integrity_check;"
# Expected: ok

# Verify job counts unchanged
sqlite3 /Users/alyshialedlie/code/jobs/data/jobs.db "SELECT COUNT(*) FROM jobs;"
# Expected: 235
```

### 3. API Response Validation
```bash
# Test /api/status returns all pipelines
curl -s http://localhost:8080/api/status | jq '.pipelines | length'
# Expected: 7

# Verify job counts match database
curl -s http://localhost:8080/api/status | jq '.pipelines[] | select(.id == "repomix") | .completedJobs'
# Expected: 201

curl -s http://localhost:8080/api/status | jq '.pipelines[] | select(.id == "duplicate-detection") | .completedJobs'
# Expected: 10
```

### 4. Frontend Verification (Browser)

**Open Dashboard:** http://localhost:8080/

**Checklist:**
- [ ] 7 pipeline cards visible (not 1, not mock data)
- [ ] "Repomix Automation" card shows 201 completed jobs
- [ ] "Duplicate Detection" card shows 10 completed jobs
- [ ] "Git Activity Reporter" card shows 1 completed job
- [ ] "Claude Health Monitor" card shows 7 completed jobs
- [ ] "Gitignore Manager" card shows 2 completed jobs
- [ ] "Plugin Manager" card shows 2 completed jobs
- [ ] "Unknown Pipeline" card shows 12 completed jobs (if displayed)
- [ ] No "No pipelines configured" message
- [ ] No mock data fallback

**Browser Console Logs:**
```
✅ Status data received: {pipelines: Array(7), ...}
✅ Rendering pipelines from API: (7) [{...}, {...}, ...]
✅ Rendering 7 pipeline cards
❌ No "showMockData() called" message
❌ No "No pipelines to render" warning
```

### 5. Pipeline Details Modal Test

**Steps:**
1. Click on "Repomix Automation" card
2. Modal opens with job history
3. Check job list loads (should show 201 jobs paginated)

**Expected:**
- [ ] Modal title: "Repomix Automation"
- [ ] "Recent Jobs" tab shows 10 most recent jobs
- [ ] "Failed Jobs" tab shows 0 jobs
- [ ] "All Jobs" tab shows paginated list
- [ ] Job counts accurate

### 6. WebSocket Real-Time Updates

**Trigger a manual job:**
```bash
# Example: Trigger duplicate detection
curl -X POST http://localhost:8080/api/sidequest/pipeline-runners/duplicate-detection/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "repositoryPath": "/Users/alyshialedlie/code/jobs"
    }
  }'
```

**Check Dashboard:**
- [ ] Job appears in "Active Jobs" section
- [ ] Pipeline card updates status to "running"
- [ ] Job completes → card updates to "idle"
- [ ] Completed jobs count increments by 1

### 7. Polling Fallback Test

**Disable WebSocket (simulate connection loss):**
```javascript
// In browser console
dashboardController.ws.close();
```

**Expected:**
- [ ] Console shows "Polling mode active (30s interval)"
- [ ] Dashboard continues updating every 30 seconds
- [ ] No data loss or corruption
- [ ] Accurate pipeline counts maintained

---

## Common Issues & Solutions

### Issue: "No pipelines configured" still appears

**Debug:**
```bash
# Check API response
curl -s http://localhost:8080/api/status | jq '.pipelines'

# If empty array:
# - Check database has jobs: sqlite3 data/jobs.db "SELECT COUNT(*) FROM jobs;"
# - Check getAllPipelineIds() function added to database.js
# - Check imports: grep "getAllPipelineIds" api/server.js
```

### Issue: Job counts are 0 but database has jobs

**Debug:**
```bash
# Test getJobCounts() function
sqlite3 data/jobs.db "
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
FROM jobs 
WHERE pipeline_id = 'repomix';
"
# Expected: total=201, completed=201, failed=0

# Check API uses getJobCounts()
grep -A10 "getJobCounts" api/server.js
```

### Issue: Pipeline names show as IDs (e.g., "repomix" instead of "Repomix Automation")

**Debug:**
```bash
# Check pipeline-names.js exists
ls -la api/utils/pipeline-names.js

# Check import in server.js
grep "pipeline-names" api/server.js

# Test name mapping
curl -s http://localhost:8080/api/status | jq '.pipelines[] | {id, name}'
```

### Issue: Mock data still appears randomly

**Debug:**
```javascript
// Browser console - check for errors
// Look for:
// - "showMockData() called" message
// - API fetch errors
// - renderPipelines called with empty array

// Check API response format
fetch('http://localhost:8080/api/status')
  .then(r => r.json())
  .then(d => console.log('Pipelines:', d.pipelines))
```

### Issue: Database shows jobs but API returns empty pipelines

**Debug:**
```bash
# Check database connection
doppler run -- node -e "
import { getAllPipelineIds } from './sidequest/core/database.js';
console.log('Pipeline IDs:', getAllPipelineIds());
"

# Check server logs
tail -f sidequest/logs/*.log | grep -i "pipeline"
```

---

## Performance Benchmarks

### API Response Time
```bash
# Measure /api/status response time
time curl -s http://localhost:8080/api/status > /dev/null

# Expected: < 50ms
```

### Database Query Performance
```bash
# Measure getAllPipelineIds query
sqlite3 data/jobs.db ".timer on" "SELECT DISTINCT pipeline_id FROM jobs;"

# Expected: < 5ms for 235 jobs
```

### Frontend Render Time
```javascript
// Browser console
performance.mark('render-start');
// ... wait for renderPipelines to complete
performance.mark('render-end');
performance.measure('render-pipelines', 'render-start', 'render-end');
console.log(performance.getEntriesByName('render-pipelines'));

// Expected: < 100ms for 7 pipeline cards
```

---

## Data Integrity Validation Script

**Create:** `scripts/verify-dashboard-data-integrity.sh`

```bash
#!/bin/bash
set -e

echo "=== Dashboard Data Integrity Check ==="

# 1. Database counts
echo -e "\n1. Database Pipeline Counts:"
sqlite3 data/jobs.db "
SELECT 
  pipeline_id, 
  COUNT(*) as total,
  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
FROM jobs 
GROUP BY pipeline_id 
ORDER BY total DESC;
"

# 2. API response
echo -e "\n2. API /api/status Response:"
curl -s http://localhost:8080/api/status | jq '{
  pipelineCount: .pipelines | length,
  totalCompleted: [.pipelines[].completedJobs] | add,
  pipelines: [.pipelines[] | {id, completedJobs}]
}'

# 3. Compare totals
DB_TOTAL=$(sqlite3 data/jobs.db "SELECT COUNT(*) FROM jobs WHERE status='completed';")
API_TOTAL=$(curl -s http://localhost:8080/api/status | jq '[.pipelines[].completedJobs] | add')

echo -e "\n3. Data Integrity Check:"
echo "Database total completed jobs: $DB_TOTAL"
echo "API total completed jobs: $API_TOTAL"

if [ "$DB_TOTAL" -eq "$API_TOTAL" ]; then
  echo "✅ Data integrity verified: counts match"
else
  echo "❌ Data integrity ERROR: counts mismatch"
  exit 1
fi

echo -e "\n=== All checks passed ==="
```

**Usage:**
```bash
chmod +x scripts/verify-dashboard-data-integrity.sh
./scripts/verify-dashboard-data-integrity.sh
```

---

## Monitoring & Alerts

### Sentry Monitoring

**Check for errors:**
```bash
# Filter Sentry errors for /api/status endpoint
# Go to: https://sentry.io/organizations/.../issues/
# Filter: endpoint:/api/status
```

**Key metrics to monitor:**
- Error rate for /api/status < 1%
- Response time p95 < 100ms
- No "Failed to get system status" errors

### PM2 Monitoring

```bash
# Watch process health
pm2 monit

# Check logs for errors
pm2 logs alephalephauto-dashboard --err --lines 50

# Memory usage
pm2 show alephalephauto-dashboard | grep memory
# Expected: < 150MB
```

---

**Last Updated:** 2025-11-24  
**Version:** 1.0.0  
**Status:** Ready for Use
