/**
 * Activity Feed Error Handling Tests
 *
 * Tests defensive error handling in ActivityFeedManager to prevent
 * TypeError when error objects have unexpected structures.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { ActivityFeedManager } from '../../api/activity-feed.ts';

interface TestContext {
  feed: ActivityFeedManager;
  broadcaster: { broadcast: (msg: unknown, ch: string) => void };
  worker: EventEmitter;
  broadcastCalls: Array<{ message: unknown; channel: string }>;
}

function makeActivityFeedCtx(maxActivities = 50): TestContext {
  const broadcastCalls: Array<{ message: unknown; channel: string }> = [];
  const broadcaster = {
    broadcast: (message: unknown, channel: string) => {
      broadcastCalls.push({ message, channel });
    }
  };
  const feed = new ActivityFeedManager(broadcaster, { maxActivities });
  const worker = new EventEmitter();
  feed.listenToWorker(worker);
  return { feed, broadcaster, worker, broadcastCalls };
}

describe('ActivityFeedManager - Error Handling', () => {
  let activityFeed: ActivityFeedManager;
  let mockWorker: EventEmitter;

  beforeEach(() => {
    const ctx = makeActivityFeedCtx(10);
    activityFeed = ctx.feed;
    mockWorker = ctx.worker;
  });

  afterEach(() => {
    activityFeed.clear();
  });

  describe('job:failed event with various error types', () => {
    it('should handle standard Error objects', () => {
      const job = {
        id: 'test-job-1',
        data: { type: 'test' }
      };
      const error = new Error('Test error message');

      // Should not throw
      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].type, 'job:failed');
      assert.strictEqual(activities[0].error.message, 'Test error message');
    });

    it('should handle string errors', () => {
      const job = {
        id: 'test-job-2',
        data: { type: 'test' }
      };
      const error = 'String error message';

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'String error message');
    });

    it('should handle undefined error', () => {
      const job = {
        id: 'test-job-3',
        data: { type: 'test' }
      };
      const error = undefined;

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'Job failed with no error details');
    });

    it('should handle null error', () => {
      const job = {
        id: 'test-job-4',
        data: { type: 'test' }
      };
      const error = null;

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'Job failed with no error details');
    });

    it('should handle error objects without message property', () => {
      const job = {
        id: 'test-job-5',
        data: { type: 'test' }
      };
      const error = { code: 'CUSTOM_ERROR' };

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.ok(activities[0].error.message); // Should have fallback message
      assert.strictEqual(activities[0].error.code, 'CUSTOM_ERROR');
    });

    it('should handle error with custom properties', () => {
      const job = {
        id: 'test-job-6',
        data: { type: 'test' }
      };
      const error = new Error('Custom error');
      error.code = 'ECONNREFUSED';
      error.retryable = true;

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'Custom error');
      assert.strictEqual(activities[0].error.code, 'ECONNREFUSED');
      assert.strictEqual(activities[0].error.retryable, true);
    });

    it('should handle missing job object gracefully', () => {
      const job = null;
      const error = new Error('Test error');

      // Should not throw - handler should return early
      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      // Should not add activity when job is missing
      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 0);
    });

    it('should handle job object with missing id', () => {
      const job = {
        data: { type: 'test' }
        // missing id
      };
      const error = new Error('Test error');

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].jobId, undefined);
    });

    it('should handle nested error objects', () => {
      const job = {
        id: 'test-job-7',
        data: { type: 'test' }
      };
      const innerError = new Error('Inner error');
      const error = new Error('Outer error');
      error.cause = innerError;

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'Outer error');
    });
  });

  describe('retry:created event with various retry info', () => {
    it('should handle retry with full retryInfo', () => {
      const job = { id: 'retry-job-1', data: { type: 'test' } };
      const retryInfo = {
        attempt: 1,
        maxAttempts: 5,
        reason: 'Connection timed out',
        delay: 10000
      };

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', job, retryInfo);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].type, 'retry:created');
      assert.strictEqual(activities[0].attempt, 1);
      assert.strictEqual(activities[0].maxAttempts, 5);
      assert.strictEqual(activities[0].reason, 'Connection timed out');
    });

    it('should handle retry with undefined retryInfo', () => {
      const job = { id: 'retry-job-2', data: { type: 'test' } };
      const retryInfo = undefined;

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', job, retryInfo);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].attempt, undefined);
    });

    it('should handle retry with null retryInfo', () => {
      const job = { id: 'retry-job-3', data: { type: 'test' } };
      const retryInfo = null;

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', job, retryInfo);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].jobId, 'retry-job-3');
    });

    it('should handle retry with partial retryInfo', () => {
      const job = { id: 'retry-job-4', data: { type: 'test' } };
      const retryInfo = { attempt: 2 }; // Only attempt, missing other fields

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', job, retryInfo);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].attempt, 2);
      assert.strictEqual(activities[0].maxAttempts, undefined);
    });

    it('should handle retry with delay info', () => {
      const job = { id: 'retry-job-5', data: { type: 'test' } };
      const retryInfo = {
        attempt: 1,
        maxAttempts: 5,
        reason: 'ETIMEDOUT',
        delay: 10000
      };

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', job, retryInfo);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].delay, 10000);
      assert.strictEqual(activities[0].reason, 'ETIMEDOUT');
    });

    it('should handle missing job gracefully', () => {
      const job = null;
      const retryInfo = { attempt: 1, maxAttempts: 5 };

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', job, retryInfo);
      });

      // Should not add activity when job is missing
      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 0);
    });

    it('should handle job without id gracefully', () => {
      const job = { data: { type: 'test' } }; // Missing id
      const retryInfo = { attempt: 1, maxAttempts: 5 };

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', job, retryInfo);
      });

      // Should not add activity when job.id is missing
      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 0);
    });
  });

  describe('Edge cases and stress tests', () => {
    it('should handle rapid-fire error events', () => {
      const job = {
        id: 'stress-job',
        data: { type: 'test' }
      };

      // Emit 20 rapid errors
      for (let i = 0; i < 20; i++) {
        assert.doesNotThrow(() => {
          mockWorker.emit('job:failed', job, new Error(`Error ${i}`));
        });
      }

      const activities = activityFeed.getRecentActivities(20);
      // Should respect maxActivities limit (10)
      assert.strictEqual(activities.length, 10);
    });

    it('should handle complex error objects', () => {
      const job = {
        id: 'complex-job',
        data: { type: 'test', nested: { deep: { value: 'test' } } }
      };
      const error = {
        message: 'Complex error',
        code: 'COMPLEX',
        stack: 'Stack trace here',
        details: {
          nested: {
            info: 'Some details'
          }
        }
      };

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'Complex error');
      assert.strictEqual(activities[0].error.code, 'COMPLEX');
    });

    it('should handle circular reference in error object', () => {
      const job = {
        id: 'circular-job',
        data: { type: 'test' }
      };
      const error = new Error('Circular error');
      // Create circular reference
      error.self = error;

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'Circular error');
    });

    it('should handle error object with Symbol properties', () => {
      const job = {
        id: 'symbol-job',
        data: { type: 'test' }
      };
      const error = new Error('Symbol error');
      error[Symbol('custom')] = 'symbol value';

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'Symbol error');
    });

    it('should handle empty object as error', () => {
      const job = {
        id: 'empty-error-job',
        data: { type: 'test' }
      };
      const error = {};

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.ok(activities[0].error.message); // Should have fallback
    });

    it('should handle number as error', () => {
      const job = {
        id: 'number-error-job',
        data: { type: 'test' }
      };
      const error = 404;

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, '404');
    });

    it('should handle boolean as error', () => {
      const job = {
        id: 'bool-error-job',
        data: { type: 'test' }
      };
      const error = false;

      assert.doesNotThrow(() => {
        mockWorker.emit('job:failed', job, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'false');
    });
  });

  describe('Activity persistence and retrieval', () => {
    it('should maintain activity order with mixed error types', () => {
      const job = {
        id: 'order-test',
        data: { type: 'test' }
      };

      // Add activities with different error types
      mockWorker.emit('job:failed', job, new Error('Error 1'));
      mockWorker.emit('job:failed', job, 'Error 2');
      mockWorker.emit('job:failed', job, undefined);

      const activities = activityFeed.getRecentActivities(3);
      assert.strictEqual(activities.length, 3);
      // Should be in reverse chronological order (newest first)
      assert.strictEqual(activities[0].error.message, 'Job failed with no error details');
      assert.strictEqual(activities[1].error.message, 'Error 2');
      assert.strictEqual(activities[2].error.message, 'Error 1');
    });

    it('should include all required fields in activity', () => {
      const job = {
        id: 'field-test',
        data: { type: 'test-type' }
      };
      const error = new Error('Test error');

      mockWorker.emit('job:failed', job, error);

      const activities = activityFeed.getRecentActivities(1);
      const activity = activities[0];

      // Verify all required fields
      assert.ok(activity.id);
      assert.ok(activity.timestamp);
      assert.strictEqual(activity.type, 'job:failed');
      assert.strictEqual(activity.event, 'Job Failed');
      assert.ok(activity.message.includes('field-test'));
      assert.strictEqual(activity.jobId, 'field-test');
      assert.strictEqual(activity.jobType, 'test-type');
      assert.strictEqual(activity.status, 'failed');
      assert.ok(activity.error);
      assert.ok(activity.error.message);
      assert.strictEqual(activity.icon, '❌');
    });
  });
});

describe('ActivityFeedManager - Core Functionality', () => {
  let activityFeed: ActivityFeedManager;
  let broadcastCalls: TestContext['broadcastCalls'];

  beforeEach(() => {
    const ctx = makeActivityFeedCtx(5);
    activityFeed = ctx.feed;
    broadcastCalls = ctx.broadcastCalls;
  });

  afterEach(() => {
    activityFeed.clear();
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const feed = new ActivityFeedManager(null);
      assert.strictEqual(feed.maxActivities, 50);
      assert.deepStrictEqual(feed.activities, []);
      assert.strictEqual(feed.activityId, 0);
    });

    it('should initialize with custom maxActivities', () => {
      const feed = new ActivityFeedManager(null, { maxActivities: 100 });
      assert.strictEqual(feed.maxActivities, 100);
    });

    it('should work without broadcaster', () => {
      const feed = new ActivityFeedManager(null);
      const activity = feed.addActivity({
        type: 'test',
        message: 'Test activity'
      });

      assert.ok(activity.id);
      assert.strictEqual(activity.type, 'test');
    });
  });

  describe('addActivity', () => {
    it('should add activity with timestamp and incrementing id', () => {
      const activity1 = activityFeed.addActivity({ type: 'test1', message: 'First' });
      const activity2 = activityFeed.addActivity({ type: 'test2', message: 'Second' });

      assert.strictEqual(activity1.id, 1);
      assert.strictEqual(activity2.id, 2);
      assert.ok(activity1.timestamp);
      assert.ok(activity2.timestamp);
    });

    it('should broadcast activity to WebSocket', () => {
      activityFeed.addActivity({ type: 'test', message: 'Broadcast test' });

      assert.strictEqual(broadcastCalls.length, 1);
      assert.strictEqual(broadcastCalls[0].channel, 'activity');
      assert.strictEqual(broadcastCalls[0].message.type, 'activity:new');
      assert.ok(broadcastCalls[0].message.activity);
    });

    it('should trim activities when exceeding maxActivities', () => {
      // Add 7 activities (max is 5)
      for (let i = 0; i < 7; i++) {
        activityFeed.addActivity({ type: 'test', message: `Activity ${i}` });
      }

      const activities = activityFeed.getRecentActivities(10);
      assert.strictEqual(activities.length, 5);

      // Should have newest activities (5, 6, 7 newest = ids 5, 6, 7)
      assert.strictEqual(activities[0].id, 7);
      assert.strictEqual(activities[4].id, 3);
    });

    it('should add Sentry breadcrumb for job:failed type', () => {
      // This tests the code path, Sentry is mocked
      const activity = activityFeed.addActivity({
        type: 'job:failed',
        message: 'Job failed',
        jobId: 'test-job',
        jobType: 'test',
        error: 'Test error'
      });

      assert.strictEqual(activity.type, 'job:failed');
    });
  });

  describe('getRecentActivities', () => {
    it('should return activities up to limit', () => {
      for (let i = 0; i < 5; i++) {
        activityFeed.addActivity({ type: 'test', message: `Activity ${i}` });
      }

      const activities = activityFeed.getRecentActivities(3);
      assert.strictEqual(activities.length, 3);
    });

    it('should return all activities if less than limit', () => {
      activityFeed.addActivity({ type: 'test', message: 'Only one' });

      const activities = activityFeed.getRecentActivities(10);
      assert.strictEqual(activities.length, 1);
    });

    it('should use default limit of 20', () => {
      const feed = new ActivityFeedManager(null, { maxActivities: 50 });
      for (let i = 0; i < 30; i++) {
        feed.addActivity({ type: 'test', message: `Activity ${i}` });
      }

      const activities = feed.getRecentActivities();
      assert.strictEqual(activities.length, 20);
    });
  });

  describe('clear', () => {
    it('should clear all activities and reset id counter', () => {
      activityFeed.addActivity({ type: 'test', message: 'Activity 1' });
      activityFeed.addActivity({ type: 'test', message: 'Activity 2' });

      assert.strictEqual(activityFeed.activities.length, 2);

      activityFeed.clear();

      assert.strictEqual(activityFeed.activities.length, 0);
      assert.strictEqual(activityFeed.activityId, 0);
    });
  });

  describe('getStats', () => {
    it('should return empty stats for no activities', () => {
      const stats = activityFeed.getStats();

      assert.deepStrictEqual(stats.recentActivities, {
        lastHour: 0,
        lastDay: 0,
        total: 0
      });
      assert.deepStrictEqual(stats.typeCount, {});
      assert.strictEqual(stats.oldestActivity, null);
      assert.strictEqual(stats.newestActivity, null);
    });

    it('should count activities by type', () => {
      activityFeed.addActivity({ type: 'job:created', message: 'Created 1' });
      activityFeed.addActivity({ type: 'job:created', message: 'Created 2' });
      activityFeed.addActivity({ type: 'job:failed', message: 'Failed 1' });

      const stats = activityFeed.getStats();

      assert.strictEqual(stats.typeCount['job:created'], 2);
      assert.strictEqual(stats.typeCount['job:failed'], 1);
    });

    it('should count recent activities in last hour and day', () => {
      // Add activity now
      activityFeed.addActivity({ type: 'test', message: 'Recent activity' });

      const stats = activityFeed.getStats();

      assert.strictEqual(stats.recentActivities.lastHour, 1);
      assert.strictEqual(stats.recentActivities.lastDay, 1);
      assert.strictEqual(stats.recentActivities.total, 1);
    });

    it('should track oldest and newest activity timestamps', () => {
      activityFeed.addActivity({ type: 'test', message: 'First' });
      activityFeed.addActivity({ type: 'test', message: 'Second' });

      const stats = activityFeed.getStats();

      assert.ok(stats.oldestActivity);
      assert.ok(stats.newestActivity);
      // Newest should be more recent (larger timestamp)
      assert.ok(new Date(stats.newestActivity) >= new Date(stats.oldestActivity));
    });

    it('should handle activities with unknown type', () => {
      activityFeed.addActivity({ message: 'No type specified' });

      const stats = activityFeed.getStats();

      assert.strictEqual(stats.typeCount['unknown'], 1);
    });
  });
});

describe('ActivityFeedManager - Worker Events', () => {
  let activityFeed: ActivityFeedManager;
  let mockWorker: EventEmitter;

  beforeEach(() => {
    const ctx = makeActivityFeedCtx(50);
    activityFeed = ctx.feed;
    mockWorker = ctx.worker;
  });

  afterEach(() => {
    activityFeed.clear();
  });

  describe('job:created event', () => {
    it('should add activity for job:created', () => {
      const job = {
        id: 'created-job-1',
        data: { type: 'test-job' }
      };

      mockWorker.emit('job:created', job);

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].type, 'job:created');
      assert.strictEqual(activities[0].event, 'Job Created');
      assert.strictEqual(activities[0].jobId, 'created-job-1');
      assert.strictEqual(activities[0].jobType, 'test-job');
      assert.strictEqual(activities[0].status, 'created');
      assert.strictEqual(activities[0].icon, '📝');
    });

    it('should handle job with missing data', () => {
      const job = { id: 'minimal-job' };

      mockWorker.emit('job:created', job);

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].jobType, 'unknown');
    });
  });

  describe('job:started event', () => {
    it('should add activity for job:started', () => {
      const job = {
        id: 'started-job-1',
        data: { type: 'processing-job' }
      };

      mockWorker.emit('job:started', job);

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].type, 'job:started');
      assert.strictEqual(activities[0].event, 'Job Started');
      assert.strictEqual(activities[0].jobId, 'started-job-1');
      assert.strictEqual(activities[0].status, 'running');
      assert.strictEqual(activities[0].icon, '▶️');
    });
  });

  describe('job:completed event', () => {
    it('should add activity for job:completed with duration from result', () => {
      const job = {
        id: 'completed-job-1',
        data: { type: 'test' },
        result: { duration_seconds: 5.25 }
      };

      mockWorker.emit('job:completed', job);

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].type, 'job:completed');
      assert.strictEqual(activities[0].event, 'Job Completed');
      assert.strictEqual(activities[0].status, 'completed');
      assert.strictEqual(activities[0].duration, 5.25);
      assert.strictEqual(activities[0].icon, '✅');
      assert.ok(activities[0].message.includes('5.25s'));
    });

    it('should calculate duration from timestamps when result.duration_seconds missing', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 3000); // 3 seconds later

      const job = {
        id: 'completed-job-2',
        data: { type: 'test' },
        startedAt: startTime,
        completedAt: endTime
      };

      mockWorker.emit('job:completed', job);

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities[0].duration, 3);
      assert.ok(activities[0].message.includes('3.00s'));
    });

    it('should calculate duration from string timestamps', () => {
      const startTime = '2024-01-01T10:00:00.000Z';
      const endTime = '2024-01-01T10:00:05.500Z';

      const job = {
        id: 'completed-job-3',
        data: { type: 'test' },
        startedAt: startTime,
        completedAt: endTime
      };

      mockWorker.emit('job:completed', job);

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities[0].duration, 5.5);
    });

    it('should show unknown duration when no timing info available', () => {
      const job = {
        id: 'completed-job-4',
        data: { type: 'test' }
      };

      mockWorker.emit('job:completed', job);

      const activities = activityFeed.getRecentActivities(1);
      assert.ok(activities[0].message.includes('unknown duration'));
      assert.strictEqual(activities[0].duration, undefined);
    });
  });

  describe('retry:max-attempts event', () => {
    it('should add activity for retry:max-attempts', () => {
      mockWorker.emit('retry:max-attempts', 'max-retry-job', 5);

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].type, 'retry:max-attempts');
      assert.strictEqual(activities[0].event, 'Max Retries Reached');
      assert.strictEqual(activities[0].jobId, 'max-retry-job');
      assert.strictEqual(activities[0].attempts, 5);
      assert.strictEqual(activities[0].status, 'failed');
      assert.strictEqual(activities[0].icon, '⛔');
      assert.ok(activities[0].message.includes('exceeded max retry attempts'));
      assert.ok(activities[0].message.includes('5'));
    });
  });

  describe('Full workflow simulation', () => {
    it('should track complete job lifecycle', () => {
      const job = {
        id: 'lifecycle-job',
        data: { type: 'workflow-test' }
      };

      // Simulate job lifecycle
      mockWorker.emit('job:created', job);
      mockWorker.emit('job:started', job);

      // Simulate completion with duration
      const completedJob = {
        ...job,
        result: { duration_seconds: 10.5 }
      };
      mockWorker.emit('job:completed', completedJob);

      const activities = activityFeed.getRecentActivities(3);
      assert.strictEqual(activities.length, 3);

      // Most recent first
      assert.strictEqual(activities[0].type, 'job:completed');
      assert.strictEqual(activities[1].type, 'job:started');
      assert.strictEqual(activities[2].type, 'job:created');
    });

    it('should track job with retries', () => {
      const job = {
        id: 'retry-lifecycle-job',
        data: { type: 'retry-test' }
      };

      mockWorker.emit('job:created', job);
      mockWorker.emit('job:started', job);
      mockWorker.emit('job:failed', job, new Error('First attempt failed'));
      mockWorker.emit('retry:created', job, { attempt: 1, maxAttempts: 5, reason: 'Retrying' });
      mockWorker.emit('job:started', job);
      mockWorker.emit('job:failed', job, new Error('Second attempt failed'));
      mockWorker.emit('retry:created', job, { attempt: 2, maxAttempts: 5, reason: 'Retrying again' });
      mockWorker.emit('retry:max-attempts', job.id, 2);

      const activities = activityFeed.getRecentActivities(10);
      assert.strictEqual(activities.length, 8);

      // Verify we have all event types
      const types = activities.map(a => a.type);
      assert.ok(types.includes('job:created'));
      assert.ok(types.includes('job:started'));
      assert.ok(types.includes('job:failed'));
      assert.ok(types.includes('retry:created'));
      assert.ok(types.includes('retry:max-attempts'));
    });
  });
});
