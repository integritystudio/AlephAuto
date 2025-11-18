/**
 * Activity Feed Manager
 *
 * Tracks and stores recent system activities for the dashboard.
 * Listens to worker events and broadcasts activity updates via WebSocket.
 */

import { createComponentLogger } from '../sidequest/logger.js';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('ActivityFeed');

export class ActivityFeedManager {
  constructor(broadcaster, options = {}) {
    this.broadcaster = broadcaster;
    this.maxActivities = options.maxActivities || 50; // Keep last 50 activities
    this.activities = [];
    this.activityId = 0;

    logger.info({ maxActivities: this.maxActivities }, 'Activity feed manager initialized');
  }

  /**
   * Add activity to the feed
   * @param {Object} activity - Activity details
   */
  addActivity(activity) {
    try {
      const activityEntry = {
        id: ++this.activityId,
        timestamp: new Date().toISOString(),
        ...activity
      };

      // Add to front of array (newest first)
      this.activities.unshift(activityEntry);

      // Trim to max size
      if (this.activities.length > this.maxActivities) {
        this.activities = this.activities.slice(0, this.maxActivities);
      }

      // Add Sentry breadcrumb for failed jobs
      if (activity.type === 'job:failed') {
        Sentry.addBreadcrumb({
          category: 'activity',
          message: activity.message,
          level: 'error',
          data: {
            jobId: activity.jobId,
            jobType: activity.jobType,
            error: activity.error
          }
        });
      }

      // Broadcast activity update via WebSocket
      if (this.broadcaster) {
        this.broadcaster.broadcast({
          type: 'activity:new',
          activity: activityEntry,
          timestamp: activityEntry.timestamp
        }, 'activity');
      }

      logger.debug({ activity: activityEntry }, 'Activity added to feed');

      return activityEntry;
    } catch (error) {
      logger.error({ error, activity }, 'Failed to add activity to feed');
      Sentry.captureException(error, {
        tags: { component: 'ActivityFeed', operation: 'addActivity' },
        extra: { activity }
      });
      throw error;
    }
  }

  /**
   * Get recent activities
   * @param {number} limit - Maximum number of activities to return
   * @returns {Array} - Recent activities
   */
  getRecentActivities(limit = 20) {
    return this.activities.slice(0, limit);
  }

  /**
   * Clear all activities
   */
  clear() {
    this.activities = [];
    this.activityId = 0;
    logger.info('Activity feed cleared');
  }

  /**
   * Get activity statistics
   * @returns {Object} - Activity statistics
   */
  getStats() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const recentActivities = {
      lastHour: 0,
      lastDay: 0,
      total: this.activities.length
    };

    const typeCount = {};

    for (const activity of this.activities) {
      const activityTime = new Date(activity.timestamp).getTime();

      if (activityTime >= oneHourAgo) {
        recentActivities.lastHour++;
      }
      if (activityTime >= oneDayAgo) {
        recentActivities.lastDay++;
      }

      // Count by type
      const type = activity.type || 'unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
    }

    return {
      recentActivities,
      typeCount,
      oldestActivity: this.activities[this.activities.length - 1]?.timestamp || null,
      newestActivity: this.activities[0]?.timestamp || null
    };
  }

  /**
   * Listen to worker events and populate activity feed
   * @param {SidequestServer} worker - Worker instance
   */
  listenToWorker(worker) {
    try {
      logger.info('Setting up worker event listeners');

      // Job created
      worker.on('job:created', (job) => {
        try {
          this.addActivity({
            type: 'job:created',
            event: 'Job Created',
            message: `Job ${job.id} created`,
            jobId: job.id,
            jobType: job.data?.type || 'unknown',
            status: 'created',
            icon: '📝'
          });
        } catch (error) {
          logger.error({ error, job }, 'Failed to add job:created activity');
          Sentry.captureException(error, {
            tags: { component: 'ActivityFeed', event: 'job:created' },
            extra: { jobId: job.id }
          });
        }
      });

      // Job started
      worker.on('job:started', (job) => {
        try {
          this.addActivity({
            type: 'job:started',
            event: 'Job Started',
            message: `Job ${job.id} started processing`,
            jobId: job.id,
            jobType: job.data?.type || 'unknown',
            status: 'running',
            icon: '▶️'
          });
        } catch (error) {
          logger.error({ error, job }, 'Failed to add job:started activity');
          Sentry.captureException(error, {
            tags: { component: 'ActivityFeed', event: 'job:started' },
            extra: { jobId: job.id }
          });
        }
      });

      // Job completed
      worker.on('job:completed', (job) => {
        try {
          const duration = job.result?.duration_seconds
            ? `${job.result.duration_seconds.toFixed(2)}s`
            : 'unknown duration';

          this.addActivity({
            type: 'job:completed',
            event: 'Job Completed',
            message: `Job ${job.id} completed successfully (${duration})`,
            jobId: job.id,
            jobType: job.data?.type || 'unknown',
            status: 'completed',
            duration: job.result?.duration_seconds,
            icon: '✅'
          });
        } catch (error) {
          logger.error({ error, job }, 'Failed to add job:completed activity');
          Sentry.captureException(error, {
            tags: { component: 'ActivityFeed', event: 'job:completed' },
            extra: { jobId: job.id }
          });
        }
      });

      // Job failed
      worker.on('job:failed', (job, error) => {
        try {
          this.addActivity({
            type: 'job:failed',
            event: 'Job Failed',
            message: `Job ${job.id} failed: ${error.message}`,
            jobId: job.id,
            jobType: job.data?.type || 'unknown',
            status: 'failed',
            error: {
              message: error.message,
              code: error.code,
              retryable: error.retryable || false
            },
            icon: '❌'
          });

          // Capture job failure in Sentry
          Sentry.captureException(error, {
            tags: {
              component: 'ActivityFeed',
              event: 'job:failed',
              jobId: job.id,
              jobType: job.data?.type || 'unknown',
              retryable: error.retryable || false
            },
            extra: {
              jobData: job.data,
              errorCode: error.code
            }
          });
        } catch (activityError) {
          logger.error({ error: activityError, job }, 'Failed to add job:failed activity');
          Sentry.captureException(activityError, {
            tags: { component: 'ActivityFeed', event: 'job:failed:activity-error' },
            extra: { jobId: job.id, originalError: error.message }
          });
        }
      });

      // Retry created
      worker.on('retry:created', (jobId, attempt, error) => {
        try {
          this.addActivity({
            type: 'retry:created',
            event: 'Retry Scheduled',
            message: `Job ${jobId} scheduled for retry (attempt ${attempt})`,
            jobId,
            attempt,
            status: 'retry',
            error: {
              message: error.message,
              code: error.code
            },
            icon: '🔄'
          });

          // Add breadcrumb for retry
          Sentry.addBreadcrumb({
            category: 'retry',
            message: `Job ${jobId} retry attempt ${attempt}`,
            level: 'warning',
            data: { jobId, attempt, errorCode: error.code }
          });
        } catch (activityError) {
          logger.error({ error: activityError, jobId }, 'Failed to add retry:created activity');
          Sentry.captureException(activityError, {
            tags: { component: 'ActivityFeed', event: 'retry:created' },
            extra: { jobId, attempt }
          });
        }
      });

      // Retry max attempts
      worker.on('retry:max-attempts', (jobId, attempts) => {
        try {
          this.addActivity({
            type: 'retry:max-attempts',
            event: 'Max Retries Reached',
            message: `Job ${jobId} exceeded max retry attempts (${attempts})`,
            jobId,
            attempts,
            status: 'failed',
            icon: '⛔'
          });

          // Capture max retries as error in Sentry
          Sentry.captureMessage(`Job ${jobId} exceeded max retry attempts`, {
            level: 'error',
            tags: {
              component: 'ActivityFeed',
              event: 'retry:max-attempts',
              jobId,
              attempts
            }
          });
        } catch (activityError) {
          logger.error({ error: activityError, jobId }, 'Failed to add retry:max-attempts activity');
          Sentry.captureException(activityError, {
            tags: { component: 'ActivityFeed', event: 'retry:max-attempts' },
            extra: { jobId, attempts }
          });
        }
      });

      logger.info('Worker event listeners configured');

      // Add breadcrumb for successful setup
      Sentry.addBreadcrumb({
        category: 'activity-feed',
        message: 'Worker event listeners configured',
        level: 'info'
      });
    } catch (error) {
      logger.error({ error }, 'Failed to set up worker event listeners');
      Sentry.captureException(error, {
        tags: { component: 'ActivityFeed', operation: 'listenToWorker' }
      });
      throw error;
    }
  }
}
