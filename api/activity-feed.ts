/**
 * Activity Feed Manager
 *
 * Tracks and stores recent system activities for the dashboard.
 * Listens to worker events and broadcasts activity updates via WebSocket.
 */

import type { SidequestServer, Job } from '../sidequest/core/server.ts';
import { createComponentLogger, logError } from '../sidequest/utils/logger.ts';
import { TIMEOUTS, TIME } from '../sidequest/core/constants.ts';
import * as Sentry from '@sentry/node';
import { safeErrorMessage, toErrorObject } from '../sidequest/pipeline-core/utils/error-helpers.ts';
import type { ScanEventBroadcaster } from './event-broadcaster.ts';

const logger = createComponentLogger('ActivityFeed');

interface ActivityEntry {
  id: number;
  timestamp: string;
  type?: string;
  [key: string]: unknown;
}

interface ActivityStats {
  recentActivities: { lastHour: number; lastDay: number; total: number };
  typeCount: Record<string, number>;
  oldestActivity: string | null;
  newestActivity: string | null;
}

interface RetryInfo {
  attempt?: number;
  maxAttempts?: number;
  reason?: string;
  delay?: number;
}

export class ActivityFeedManager {
  broadcaster: ScanEventBroadcaster | null;
  maxActivities: number;
  activities: ActivityEntry[];
  activityId: number;

  /**
   * Constructor.
   *
   * @param {ScanEventBroadcaster | null} broadcaster - The broadcaster
   * @param {{ maxActivities?: number }} [options={}] - Options dictionary
   */
  constructor(broadcaster: ScanEventBroadcaster | null, options: { maxActivities?: number } = {}) {
    this.broadcaster = broadcaster;
    this.maxActivities = options.maxActivities || 50; // Keep last 50 activities
    this.activities = [];
    this.activityId = 0;

    logger.info({ maxActivities: this.maxActivities }, 'Activity feed manager initialized');
  }

  /**
   * Add activity to the feed
   */
  /**
   * Add activity.
   *
   * @param {Record<string} activity - The activity
   * @param {*} unknown> - The unknown>
   *
   * @returns {ActivityEntry} The ActivityEntry
   */
  addActivity(activity: Record<string, unknown>): ActivityEntry {
    try {
      const activityEntry: ActivityEntry = {
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
          message: activity.message as string,
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
   */
  /**
   * Get the recent activities.
   *
   * @param {number} [limit=20] - The limit
   *
   * @returns {ActivityEntry[]} The recent activities
   */
  getRecentActivities(limit: number = 20): ActivityEntry[] {
    return this.activities.slice(0, limit);
  }

  /**
   * Clear all activities
   */
  /**
   * Clear.
   */
  clear(): void {
    this.activities = [];
    this.activityId = 0;
    logger.info('Activity feed cleared');
  }

  /**
   * Get activity statistics
   */
  /**
   * Get the stats.
   *
   * @returns {ActivityStats} The stats
   */
  getStats(): ActivityStats {
    const now = Date.now();
    const oneHourAgo = now - TIMEOUTS.ONE_HOUR_MS;
    const oneDayAgo = now - TIMEOUTS.ONE_DAY_MS;

    const recentActivities = {
      lastHour: 0,
      lastDay: 0,
      total: this.activities.length
    };

    const typeCount: Record<string, number> = {};

    for (const activity of this.activities) {
      const activityTime = new Date(activity.timestamp).getTime();

      if (activityTime >= oneHourAgo) {
        recentActivities.lastHour++;
      }
      if (activityTime >= oneDayAgo) {
        recentActivities.lastDay++;
      }

      // Count by type
      const type = (activity.type as string) || 'unknown';
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
   */
  /**
   * Listen to worker.
   *
   * @param {SidequestServer} worker - The worker
   */
  listenToWorker(worker: SidequestServer): void {
    try {
      logger.info('Setting up worker event listeners');

      // Job created
      worker.on('job:created', (job: Job) => {
        try {
          this.addActivity({
            type: 'job:created',
            event: 'Job Created',
            message: `Job ${job.id} created`,
            jobId: job.id,
            jobType: (job.data?.type as string) || 'unknown',
            status: 'created',
            icon: '\u{1f4dd}'
          });

          // Broadcast job event directly for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'job:created',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: (job.data?.pipelineId as string) || worker.jobType,
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
      worker.on('job:started', (job: Job) => {
        try {
          this.addActivity({
            type: 'job:started',
            event: 'Job Started',
            message: `Job ${job.id} started processing`,
            jobId: job.id,
            jobType: (job.data?.type as string) || 'unknown',
            status: 'running',
            icon: '\u25b6\ufe0f'
          });

          // Broadcast job event directly for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'job:started',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: (job.data?.pipelineId as string) || worker.jobType,
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
      worker.on('job:completed', (job: Job) => {
        try {
          // Calculate duration from timestamps, fallback to result.duration_seconds
          const jobResult = job.result as Record<string, unknown> | null | undefined;
          let durationSeconds = (jobResult as Record<string, unknown> | null | undefined)?.duration_seconds as number | undefined;
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
            jobType: (job.data?.type as string) || 'unknown',
            status: 'completed',
            duration: durationSeconds,
            icon: '\u2705'
          });

          // Broadcast job event directly for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'job:completed',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: (job.data?.pipelineId as string) || worker.jobType,
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
      worker.on('job:failed', (job: Job, error: unknown) => {
        // Hoist activeError so catch block can reference it
        let activeError: unknown = error;
        try {
          if (activeError === undefined || activeError === null) {
            logger.warn({
              jobId: job?.id || 'unknown',
              errorType: typeof activeError
            }, 'job:failed event received with undefined/null error');
            activeError = new Error('Job failed with no error details');
          }

          // Defensive: ensure job object exists
          if (!job) {
            logger.warn({
              error: safeErrorMessage(activeError)
            }, 'job:failed event received with no job object');
            return;
          }

          const errorObj = toErrorObject(activeError, {
            fallbackMessage: 'Unknown error',
            metadata: { jobId: job.id }
          });

          // Defensive: ensure errorObj has required properties
          const errorMessage = errorObj?.message || 'Unknown error';
          const activeErrorRecord = activeError as Record<string, unknown>;
          const errorCode = activeErrorRecord?.code as string | undefined;
          const errorRetryable = (activeErrorRecord?.retryable as boolean) || false;

          this.addActivity({
            type: 'job:failed',
            event: 'Job Failed',
            message: `Job ${job.id} failed: ${errorMessage}`,
            jobId: job.id,
            jobType: (job.data?.type as string) || 'unknown',
            status: 'failed',
            error: {
              message: errorMessage,
              code: errorCode,
              retryable: errorRetryable
            },
            icon: '\u274c'
          });

          // Broadcast job event directly for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'job:failed',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: (job.data?.pipelineId as string) || worker.jobType,
                completedAt: job.completedAt,
                error: { message: errorMessage, code: errorCode },
                data: job.data
              }
            }, 'jobs');
          }

          // Capture job failure in Sentry
          const sentryError = activeError instanceof Error
            ? activeError
            : new Error(errorMessage);

          Sentry.captureException(sentryError, {
            tags: {
              component: 'ActivityFeed',
              event: 'job:failed',
              jobId: job.id,
              jobType: (job.data?.type as string) || 'unknown',
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
              originalError: safeErrorMessage(activeError)
            }
          });
        }
      });

      // Retry created
      worker.on('retry:created', (job: Job, retryInfo: RetryInfo) => {
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
            jobType: (job.data?.type as string) || 'unknown',
            attempt,
            maxAttempts,
            delay,
            reason,
            status: 'retry',
            icon: '\u{1f504}'
          });

          // Broadcast retry event for dashboard real-time updates
          if (this.broadcaster) {
            this.broadcaster.broadcast({
              type: 'retry:created',
              job: {
                id: job.id,
                status: job.status,
                pipelineId: (job.data?.pipelineId as string) || worker.jobType,
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
      worker.on('retry:max-attempts', (jobId: string, attempts: number) => {
        try {
          this.addActivity({
            type: 'retry:max-attempts',
            event: 'Max Retries Reached',
            message: `Job ${jobId} exceeded max retry attempts (${attempts})`,
            jobId,
            attempts,
            status: 'failed',
            icon: '\u26d4'
          });

          // Capture max retries as error in Sentry
          Sentry.captureMessage(`Job ${jobId} exceeded max retry attempts`, {
            level: 'error',
            tags: {
              component: 'ActivityFeed',
              event: 'retry:max-attempts',
              jobId: String(jobId),
              attempts: String(Number(attempts))
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
