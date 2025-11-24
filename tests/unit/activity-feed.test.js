/**
 * Activity Feed Error Handling Tests
 *
 * Tests defensive error handling in ActivityFeedManager to prevent
 * TypeError when error objects have unexpected structures.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { ActivityFeedManager } from '../../api/activity-feed.js';

describe('ActivityFeedManager - Error Handling', () => {
  let activityFeed;
  let mockBroadcaster;
  let mockWorker;

  beforeEach(() => {
    // Mock broadcaster
    mockBroadcaster = {
      broadcast: () => {}
    };

    // Create activity feed instance
    activityFeed = new ActivityFeedManager(mockBroadcaster, {
      maxActivities: 10
    });

    // Create mock worker (EventEmitter)
    mockWorker = new EventEmitter();

    // Setup listeners
    activityFeed.listenToWorker(mockWorker);
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
      assert.strictEqual(activities[0].error.message, 'Unknown error');
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
      assert.strictEqual(activities[0].error.message, 'Unknown error');
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

  describe('retry:created event with various error types', () => {
    it('should handle standard Error objects', () => {
      const jobId = 'retry-job-1';
      const attempt = 1;
      const error = new Error('Retry error');

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', jobId, attempt, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].type, 'retry:created');
      assert.strictEqual(activities[0].error.message, 'Retry error');
    });

    it('should handle undefined error', () => {
      const jobId = 'retry-job-2';
      const attempt = 2;
      const error = undefined;

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', jobId, attempt, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'Unknown error');
    });

    it('should handle null error', () => {
      const jobId = 'retry-job-3';
      const attempt = 1;
      const error = null;

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', jobId, attempt, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'Unknown error');
    });

    it('should handle string error', () => {
      const jobId = 'retry-job-4';
      const attempt = 1;
      const error = 'String retry error';

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', jobId, attempt, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.message, 'String retry error');
    });

    it('should handle error with code property', () => {
      const jobId = 'retry-job-5';
      const attempt = 1;
      const error = new Error('Network timeout');
      error.code = 'ETIMEDOUT';

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', jobId, attempt, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].error.code, 'ETIMEDOUT');
      assert.strictEqual(activities[0].error.message, 'Network timeout');
    });

    it('should handle missing jobId gracefully', () => {
      const jobId = null;
      const attempt = 1;
      const error = new Error('Test error');

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', jobId, attempt, error);
      });

      // Should not add activity when jobId is missing
      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 0);
    });

    it('should handle missing attempt number', () => {
      const jobId = 'retry-job-6';
      const attempt = undefined;
      const error = new Error('Test error');

      assert.doesNotThrow(() => {
        mockWorker.emit('retry:created', jobId, attempt, error);
      });

      const activities = activityFeed.getRecentActivities(1);
      assert.strictEqual(activities.length, 1);
      assert.strictEqual(activities[0].attempt, undefined);
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
      assert.strictEqual(activities[0].error.message, 'Unknown error');
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
