/**
 * Activity Feed Integration Tests
 *
 * End-to-end tests with real job events and WebSocket:
 * - Job fails with Error object → activity created correctly
 * - Job fails with null error → activity created with "Unknown error"
 * - Job fails with string error → activity created correctly
 * - Rapid-fire job failures → all activities recorded
 * - Activity Feed survives error handler failures
 *
 * Scenarios:
 * 1. Job fails with Error object → activity created
 * 2. Job fails with null error → "Unknown error" handling
 * 3. Job fails with string error → converted to Error
 * 4. Rapid-fire failures → all activities recorded
 * 5. Error handler failure → activity feed continues
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityFeedManager } from '../../api/activity-feed.ts';
import { SidequestServer } from '../../sidequest/core/server.ts';
import { initDatabase } from '../../sidequest/core/database.ts';
import { waitForQueueDrain } from '../fixtures/test-helpers.ts';

describe('Activity Feed - Integration Tests', () => {
  let activityFeed;
  let worker;
  let broadcaster;
  let broadcastedMessages = [];
  let sentryEvents = [];
  let sentryBreadcrumbs = [];

  beforeEach(async () => {
    // Initialize database FIRST (it's async)
    await initDatabase(':memory:');

    // Mock broadcaster
    broadcastedMessages = [];
    broadcaster = {
      broadcast: (message, channel) => {
        broadcastedMessages.push({ message, channel, timestamp: Date.now() });
      }
    };

    // Create activity feed
    activityFeed = new ActivityFeedManager(broadcaster, { maxActivities: 50 });

    // Create worker (autoStart: false to allow handler setup before job execution)
    worker = new SidequestServer({
      jobType: 'test-worker',
      maxConcurrent: 1,
      maxRetries: 0,
      autoStart: false
    });

    // Connect activity feed to worker
    activityFeed.listenToWorker(worker);
  });

  afterEach(async () => {
    // Drain any remaining in-flight jobs before stopping.
    // This is a no-op if the test body already called waitForQueueDrain.
    // For retry scenarios (Scenario 7), the queue is also drained at this point
    // because the test waited for retry:created (active=0, queued=0).
    await waitForQueueDrain(worker, { timeout: 5000 });
    worker.stop();
  });

  it('Scenario 1: Job fails with Error object → activity created correctly', async () => {
    // Create a job that will fail with Error object
    const jobId = 'test-job-1';
    worker.createJob(jobId, {
      type: 'test-job',
      data: { test: true }
    });

    // Define handler that throws Error
    worker.handleJob = async (job) => {
      const error = new Error('Database connection failed');
      error.code = 'ECONNREFUSED';
      error.retryable = true;
      throw error;
    };

    // Start worker
    worker.start();

    await waitForQueueDrain(worker);

    // Verify activity was created
    const activities = activityFeed.getRecentActivities(10);
    const failedActivity = activities.find(a => a.type === 'job:failed');

    assert(failedActivity, 'Should create job:failed activity');
    assert.equal(failedActivity.jobId, jobId);
    assert.equal(failedActivity.status, 'failed');
    assert.equal(failedActivity.error.message, 'Database connection failed');
    assert.equal(failedActivity.error.code, 'ECONNREFUSED');
    assert.equal(failedActivity.error.retryable, true);
    assert.equal(failedActivity.icon, '❌');

    // Verify WebSocket broadcast
    const failedBroadcast = broadcastedMessages.find(m =>
      m.message.type === 'activity:new' && m.message.activity.type === 'job:failed'
    );
    assert(failedBroadcast, 'Should broadcast job:failed activity');
    assert.equal(failedBroadcast.channel, 'activity');

    // Note: Sentry integration is tested separately via Sentry mocks
    // This test verifies activity feed core functionality
  });

  it('Scenario 2: Job fails with null error → "Unknown error" handling', async () => {
    const jobId = 'test-job-2';
    worker.createJob(jobId, {
      type: 'test-job',
      data: { test: true }
    });

    // Handler that emits job:failed with null error then returns
    // (return instead of throw to avoid server emitting another job:failed)
    worker.handleJob = async (job) => {
      // Simulate internal error where error object is null
      worker.emit('job:failed', job, null);
      // Return to prevent server from emitting its own job:failed
      return { handled: true };
    };

    worker.start();

    await waitForQueueDrain(worker);

    // Verify activity was created with "Unknown error"
    const activities = activityFeed.getRecentActivities(10);
    const failedActivity = activities.find(a => a.type === 'job:failed');

    assert(failedActivity, 'Should create activity even with null error');
    assert.equal(failedActivity.error.message, 'Job failed with no error details', 'Should use fallback message');
    assert.equal(failedActivity.jobId, jobId);
  });

  it('Scenario 3: Job fails with string error → converted correctly', async () => {
    const jobId = 'test-job-3';
    worker.createJob(jobId, {
      type: 'test-job',
      data: { test: true }
    });

    // Handler that emits job:failed with string error then returns
    // (return instead of throw to avoid server emitting another job:failed)
    worker.handleJob = async (job) => {
      worker.emit('job:failed', job, 'Simple string error message');
      // Return to prevent server from emitting its own job:failed
      return { handled: true };
    };

    worker.start();

    await waitForQueueDrain(worker);

    // Verify activity handles string error
    const activities = activityFeed.getRecentActivities(10);
    const failedActivity = activities.find(a => a.type === 'job:failed');

    assert(failedActivity, 'Should create activity from string error');
    assert.equal(failedActivity.error.message, 'Simple string error message');

    // Note: Sentry integration is tested separately via Sentry mocks
    // This test verifies activity feed core functionality
  });

  it('Scenario 4: Rapid-fire job failures → all activities recorded', async () => {
    // Create 10 jobs that will fail rapidly
    const jobIds = [];
    for (let i = 0; i < 10; i++) {
      const jobId = `test-job-rapid-${i}`;
      worker.createJob(jobId, {
        type: 'test-job',
        data: { index: i }
      });
      jobIds.push(jobId);
    }

    let failureCount = 0;
    worker.handleJob = async (job) => {
      failureCount++;
      const error = new Error(`Failure ${failureCount}`);
      error.code = `ERR_${failureCount}`;
      throw error;
    };

    worker.start();

    await waitForQueueDrain(worker);

    // Verify all failures were recorded
    const activities = activityFeed.getRecentActivities(50);
    const failedActivities = activities.filter(a => a.type === 'job:failed');

    assert.equal(failedActivities.length, 10, 'Should record all 10 failures');

    // Verify each job has its activity
    jobIds.forEach((jobId, index) => {
      const activity = failedActivities.find(a => a.jobId === jobId);
      assert(activity, `Should have activity for job ${jobId}`);
    });

    // Verify broadcasts were sent for all
    const failedBroadcasts = broadcastedMessages.filter(m =>
      m.message.type === 'activity:new' && m.message.activity.type === 'job:failed'
    );
    assert.equal(failedBroadcasts.length, 10, 'Should broadcast all failures');

    // Verify activities are in correct order (newest first)
    for (let i = 0; i < failedActivities.length - 1; i++) {
      const current = new Date(failedActivities[i].timestamp);
      const next = new Date(failedActivities[i + 1].timestamp);
      assert(current >= next, 'Activities should be ordered newest first');
    }
  });

  it('Scenario 5: Activity Feed survives error handler failures', async () => {
    const jobId = 'test-job-5';
    worker.createJob(jobId, {
      type: 'test-job',
      data: { test: true }
    });

    // Make broadcaster throw error
    broadcaster.broadcast = () => {
      throw new Error('WebSocket broadcast failed');
    };

    worker.handleJob = async (job) => {
      throw new Error('Job execution failed');
    };

    worker.start();

    await waitForQueueDrain(worker);

    // Verify activity was still created despite broadcast failure
    const activities = activityFeed.getRecentActivities(10);

    // Note: The activity won't be added if addActivity itself throws
    // but we should verify Sentry captured the error handler failure
    const sentryError = sentryEvents.find(e =>
      e.context?.tags?.component === 'ActivityFeed' &&
      e.context?.tags?.operation === 'addActivity'
    );

    // If broadcaster throws, addActivity will throw and Sentry should capture it
    assert(sentryError || activities.length > 0,
      'Should either capture error or successfully add activity');
  });

  it('Scenario 6: Job lifecycle → complete activity flow', async () => {
    const jobId = 'test-job-6';
    worker.createJob(jobId, {
      type: 'test-job',
      data: { operation: 'success-test' }
    });

    // Handler that succeeds
    worker.handleJob = async (job) => {
      return {
        success: true,
        duration_seconds: 1.5,
        result: 'Completed successfully'
      };
    };

    worker.start();

    await waitForQueueDrain(worker);

    // Verify complete lifecycle activities
    const activities = activityFeed.getRecentActivities(20);

    const created = activities.find(a => a.type === 'job:created' && a.jobId === jobId);
    const started = activities.find(a => a.type === 'job:started' && a.jobId === jobId);
    const completed = activities.find(a => a.type === 'job:completed' && a.jobId === jobId);

    assert(created, 'Should have job:created activity');
    assert.equal(created.status, 'created');
    assert.equal(created.icon, '📝');

    assert(started, 'Should have job:started activity');
    assert.equal(started.status, 'running');
    assert.equal(started.icon, '▶️');

    assert(completed, 'Should have job:completed activity');
    assert.equal(completed.status, 'completed');
    assert.equal(completed.icon, '✅');
    assert(completed.duration, 'Should include duration');

    // Verify order: completed → started → created (newest first)
    const activityIds = [created.id, started.id, completed.id];
    assert(completed.id > started.id, 'Completed should have higher ID than started');
    assert(started.id > created.id, 'Started should have higher ID than created');
  });

  it('Scenario 7: Retry activities tracking', async () => {
    // This test needs retries enabled (override the default maxRetries: 0)
    await worker.stop();
    worker = new SidequestServer({
      jobType: 'test-worker',
      maxConcurrent: 1,
      maxRetries: 5,
      autoStart: false
    });
    activityFeed.listenToWorker(worker);

    const jobId = 'test-job-7';
    worker.createJob(jobId, {
      type: 'test-job',
      data: { retry: true }
    });

    let attempts = 0;
    worker.handleJob = async (job) => {
      attempts++;
      if (attempts === 1) {
        const error = new Error('Temporary failure');
        error.code = 'ETIMEDOUT'; // Retryable network error
        throw error;
      }
      return { success: true };
    };

    worker.start();

    // Wait for retry:created event (emitted immediately on first failure, before re-queue delay)
    await new Promise<void>(resolve => worker.once('retry:created', resolve));

    const activities = activityFeed.getRecentActivities(20);

    // Should have retry:created activity
    const retryActivity = activities.find(a => a.type === 'retry:created' && a.jobId === jobId);
    assert(retryActivity, 'Should create retry activity when retryable error occurs');
    assert.equal(retryActivity.icon, '🔄');
    assert.equal(retryActivity.status, 'retry');
    assert.equal(retryActivity.attempt, 1, 'Should be first retry attempt');
    assert.equal(retryActivity.maxAttempts, 5, 'Should have max attempts from RETRY constant');
  });

  it('Scenario 8: Activity stats calculation', async () => {
    // Create multiple activities
    for (let i = 0; i < 5; i++) {
      activityFeed.addActivity({
        type: 'job:completed',
        event: 'Job Completed',
        message: `Job ${i} completed`,
        jobId: `job-${i}`,
        status: 'completed'
      });
    }

    for (let i = 0; i < 3; i++) {
      activityFeed.addActivity({
        type: 'job:failed',
        event: 'Job Failed',
        message: `Job ${i} failed`,
        jobId: `job-fail-${i}`,
        status: 'failed'
      });
    }

    const stats = activityFeed.getStats();

    assert.equal(stats.recentActivities.total, 8, 'Should have 8 total activities');
    assert.equal(stats.typeCount['job:completed'], 5, 'Should count completed jobs');
    assert.equal(stats.typeCount['job:failed'], 3, 'Should count failed jobs');
    assert(stats.newestActivity, 'Should have newest activity timestamp');
    assert(stats.oldestActivity, 'Should have oldest activity timestamp');

    // Verify recent activities count
    assert(stats.recentActivities.lastHour >= 8, 'All activities should be within last hour');
  });

  it('Scenario 9: Max activities limit enforcement', async () => {
    // Create activity feed with small limit
    const smallFeed = new ActivityFeedManager(broadcaster, { maxActivities: 5 });

    // Add more activities than limit
    for (let i = 0; i < 10; i++) {
      smallFeed.addActivity({
        type: 'job:completed',
        event: 'Job Completed',
        message: `Job ${i}`,
        jobId: `job-${i}`
      });
    }

    const activities = smallFeed.getRecentActivities(100);

    assert.equal(activities.length, 5, 'Should trim to max activities');

    // Verify newest activities are kept
    assert.equal(activities[0].jobId, 'job-9', 'Should keep newest activity');
    assert.equal(activities[4].jobId, 'job-5', 'Should trim oldest activities');
  });
});
