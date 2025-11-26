# Activity Feed Integration Test Issues

## Status
Tests updated with correct `createJob(jobId, data)` API but still fail due to architectural mismatches.

## Problems Identified

### 1. API Mismatch - createJob ✅ FIXED
**Issue:** Tests called `worker.createJob({ type, data })` with object parameter
**Fix Applied:** Changed to `worker.createJob(jobId, { type, data })` with explicit jobId

### 2. Missing start() and stop() methods ❌ NEEDS FIX
**Issue:** Tests call `worker.start()` and `worker.stop()` which don't exist on SidequestServer
**Reality:** SidequestServer processes jobs automatically via queue when job is created
**Fix Needed:** Remove `worker.start()` calls - jobs start automatically

### 3. handleJob vs runJobHandler ❌ NEEDS FIX
**Issue:** Tests set `worker.handleJob = async (job) => { ... }`
**Reality:** Should override `worker.runJobHandler = async (job) => { ... }`
**Fix Needed:** Rename all `handleJob` to `runJobHandler`

### 4. Missing Sentry mock setup ❌ NEEDS FIX
**Issue:** Tests reference `sentryEvents` and `sentryBreadcrumbs` arrays that don't exist
**Fix Needed:** Either:
- Mock Sentry module to capture calls
- Remove Sentry assertions from tests
- Import and configure Sentry test utilities

### 5. Timing Issues ⚠️ PARTIAL
**Issue:** Tests use arbitrary `setTimeout` delays (500ms, 1500ms)
**Reality:** Jobs may process faster/slower than expected
**Fix Needed:** Use event listeners or job completion promises instead of timeouts

## Recommended Approach

### Option A: Minimal Fix (Quickest)
1. Remove `worker.start()` and `worker.stop()` calls
2. Change `handleJob` to `runJobHandler`
3. Remove Sentry assertions
4. Keep timeout-based waits

### Option B: Proper Fix (Best Practice)
1. Extend SidequestServer properly with test worker class
2. Use event-driven assertions (listen to `job:completed`, `job:failed`)
3. Add proper Sentry mocking or test fixtures
4. Replace timeouts with promise-based waits

## Example Fix for Scenario 1

```javascript
it('Scenario 1: Job fails with Error object → activity created correctly', async () => {
  // Create test worker that implements runJobHandler
  class TestWorker extends SidequestServer {
    async runJobHandler(job) {
      const error = new Error('Database connection failed');
      error.code = 'ECONNREFUSED';
      error.retryable = true;
      throw error;
    }
  }

  const worker = new TestWorker({
    jobType: 'test-worker',
    maxConcurrent: 1
  });

  // Connect activity feed
  activityFeed.listenToWorker(worker);

  // Create job (starts automatically)
  const jobId = 'test-job-1';
  worker.createJob(jobId, {
    type: 'test-job',
    data: { test: true }
  });

  // Wait for job:failed event (better than setTimeout)
  await new Promise((resolve) => {
    worker.once('job:failed', resolve);
  });

  // Verify activity was created
  const activities = activityFeed.getRecentActivities(10);
  const failedActivity = activities.find(a => a.type === 'job:failed');

  assert(failedActivity, 'Should create job:failed activity');
  assert.equal(failedActivity.jobId, jobId);
  assert.equal(failedActivity.status, 'failed');
  assert.equal(failedActivity.error.message, 'Database connection failed');
});
```

## Files to Update
- `/Users/alyshialedlie/code/jobs/tests/integration/activity-feed.integration.test.js`

## Related Documentation
- Error Handling Documentation: `/Users/alyshialedlie/code/jobs/docs/architecture/ERROR_HANDLING.md`
- SidequestServer API: `/Users/alyshialedlie/code/jobs/sidequest/core/server.js`
- Activity Feed Manager: `/Users/alyshialedlie/code/jobs/api/activity-feed.js`
