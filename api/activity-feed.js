/**
 * Activity Feed Manager
 *
 * Tracks and stores recent system activities for the dashboard.
 * Listens to worker events and broadcasts activity updates via WebSocket.
 */

// @ts-check
/** @typedef {import('../sidequest/core/server.js').SidequestServer} SidequestServer */

/**
 * @typedef {Object} Job
 * @property {string} id - Unique job identifier
 * @property {string} status - Job status (queued, running, completed, failed)
 * @property {number} [retryCount] - Number of retry attempts
 * @property {Object} [data] - Job data payload
 * @property {string} [data.type] - Job type identifier
 * @property {string} [data.pipelineId] - Pipeline identifier
 */

/**
 * @typedef {Object} RetryInfo
 * @property {number} attempt - Current retry attempt number
 * @property {number} maxAttempts - Maximum allowed attempts
 * @property {string} [reason] - Reason for retry
 * @property {number} [delay] - Delay in ms before retry
 */

import { createComponentLogger, logError } from '../sidequest/utils/logger.js';
import { TIMEOUTS, TIME } from '../sidequest/core/constants.js';
import * as Sentry from '@sentry/node';
import { safeErrorMessage, toErrorObject } from '../sidequest/pipeline-core/utils/error-helpers.js';

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
      logError(logger, error, 'Failed to add activity to feed', { activity });
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
    const oneHourAgo = now - TIMEOUTS.ONE_HOUR_MS;
    const oneDayAgo = now - TIMEOUTS.ONE_DAY_MS;

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

          // Broadcast job event directly for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'job:created',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: job.data?.pipelineId || worker.jobType,
                createdAt: job.createdAt,
                data: job.data
              }
            }, 'jobs');
          }
        } catch (error) {
          logError(logger, error, 'Failed to add job:created activity', { job });
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

          // Broadcast job event directly for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'job:started',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: job.data?.pipelineId || worker.jobType,
                startedAt: job.startedAt,
                data: job.data
              }
            }, 'jobs');
          }
        } catch (error) {
          logError(logger, error, 'Failed to add job:started activity', { job });
          Sentry.captureException(error, {
            tags: { component: 'ActivityFeed', event: 'job:started' },
            extra: { jobId: job.id }
          });
        }
      });

      // Job completed
      worker.on('job:completed', (job) => {
        try {
          // Calculate duration from timestamps, fallback to result.duration_seconds
          let durationSeconds = job.result?.duration_seconds;
          if (!durationSeconds && job.startedAt && job.completedAt) {
            const startTime = job.startedAt instanceof Date ? job.startedAt : new Date(job.startedAt);
            const endTime = job.completedAt instanceof Date ? job.completedAt : new Date(job.completedAt);
            durationSeconds = (endTime.getTime() - startTime.getTime()) / TIME.SECOND;
          }

          const duration = durationSeconds != null
            ? `${durationSeconds.toFixed(2)}s`
            : 'unknown duration';

          this.addActivity({
            type: 'job:completed',
            event: 'Job Completed',
            message: `Job ${job.id} completed successfully (${duration})`,
            jobId: job.id,
            jobType: job.data?.type || 'unknown',
            status: 'completed',
            duration: durationSeconds,
            icon: '✅'
          });

          // Broadcast job event directly for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'job:completed',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: job.data?.pipelineId || worker.jobType,
                completedAt: job.completedAt,
                result: job.result,
                data: job.data
              }
            }, 'jobs');
          }
        } catch (error) {
          logError(logger, error, 'Failed to add job:completed activity', { job });
          Sentry.captureException(error, {
            tags: { component: 'ActivityFeed', event: 'job:completed' },
            extra: { jobId: job.id }
          });
        }
      });

      // Job failed
      worker.on('job:failed', (job, error) => {
        try {
          // Defensive: validate error parameter FIRST (before any usage)
          if (error === undefined || error === null) {
            logger.warn({
              jobId: job?.id || 'unknown',
              errorType: typeof error
            }, 'job:failed event received with undefined/null error');
            error = new Error('Job failed with no error details');
          }

          // Defensive: ensure job object exists
          if (!job) {
            logger.warn({
              error: safeErrorMessage(error)
            }, 'job:failed event received with no job object');
            return;
          }

          const errorObj = toErrorObject(error, {
            fallbackMessage: 'Unknown error',
            metadata: { jobId: job.id }
          });

          // Defensive: ensure errorObj has required properties
          const errorMessage = errorObj?.message || 'Unknown error';
          /** @type {any} */
          const errorAny = error;
          const errorCode = errorAny?.code;
          const errorRetryable = errorAny?.retryable || false;

          this.addActivity({
            type: 'job:failed',
            event: 'Job Failed',
            message: `Job ${job.id} failed: ${errorMessage}`,
            jobId: job.id,
            jobType: job.data?.type || 'unknown',
            status: 'failed',
            error: {
              message: errorMessage,
              code: errorCode,
              retryable: errorRetryable
            },
            icon: '❌'
          });

          // Broadcast job event directly for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'job:failed',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: job.data?.pipelineId || worker.jobType,
                completedAt: job.completedAt,
                error: { message: errorMessage, code: errorCode },
                data: job.data
              }
            }, 'jobs');
          }

          // Capture job failure in Sentry
          // Defensive: ensure we always pass an Error object to Sentry
          const sentryError = error instanceof Error
            ? error
            : new Error(errorMessage);

          Sentry.captureException(sentryError, {
            tags: {
              component: 'ActivityFeed',
              event: 'job:failed',
              jobId: job.id,
              jobType: job.data?.type || 'unknown',
              retryable: errorRetryable
            },
            extra: {
              jobData: job.data,
              errorCode: errorCode,
              errorType: errorObj?.type || 'unknown',
              errorMessage: errorMessage
            }
          });
        } catch (activityError) {
          logError(logger, activityError, 'Failed to add job:failed activity', { job });
          Sentry.captureException(activityError, {
            tags: { component: 'ActivityFeed', event: 'job:failed:activity-error' },
            extra: {
              jobId: job?.id || 'unknown',
              originalError: safeErrorMessage(error)
            }
          });
        }
      });

      // Retry created
      worker.on('retry:created', (
        /** @type {Job} */ job,
        /** @type {RetryInfo} */ retryInfo
      ) => {
        try {
          // Defensive: ensure required parameters exist
          if (!job?.id) {
            logger.warn('retry:created event received with no job');
            return;
          }

          const { attempt, maxAttempts, reason, delay } = retryInfo ?? {};

          this.addActivity({
            type: 'retry:created',
            event: 'Retry Scheduled',
            message: `Job ${job.id} scheduled for retry (attempt ${attempt}/${maxAttempts})`,
            jobId: job.id,
            jobType: job.data?.type || 'unknown',
            attempt,
            maxAttempts,
            delay,
            reason,
            status: 'retry',
            icon: '🔄'
          });

          // Broadcast retry event for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'retry:created',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: job.data?.pipelineId || worker.jobType,
                retryCount: job.retryCount,
                data: job.data
              },
              retryInfo: { attempt, maxAttempts, reason, delay }
            }, 'jobs');
          }

          // Add breadcrumb for retry
          Sentry.addBreadcrumb({
            category: 'retry',
            message: `Job ${job.id} retry attempt ${attempt}/${maxAttempts}`,
            level: 'warning',
            data: {
              jobId: job.id,
              attempt,
              maxAttempts,
              reason,
              delay
            }
          });
        } catch (activityError) {
          logError(logger, activityError, 'Failed to add retry:created activity', { jobId: job?.id });
          Sentry.captureException(activityError, {
            tags: { component: 'ActivityFeed', event: 'retry:created' },
            extra: {
              jobId: job?.id || 'unknown',
              retryInfo
            }
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
              jobId: String(jobId),
              attempts: Number(attempts)
            }
          });
        } catch (activityError) {
          logError(logger, activityError, 'Failed to add retry:max-attempts activity', { jobId });
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
      logError(logger, error, 'Failed to set up worker event listeners');
      Sentry.captureException(error, {
        tags: { component: 'ActivityFeed', operation: 'listenToWorker' }
      });
      throw error;
    }
  }
}
