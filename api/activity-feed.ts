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
  private broadcaster: ScanEventBroadcaster | null;
  private maxActivities: number;
  activities: ActivityEntry[];
  activityId: number;

  constructor(broadcaster: ScanEventBroadcaster | null, options: { maxActivities?: number } = {}) {
    this.broadcaster = broadcaster;
    this.maxActivities = options.maxActivities ?? 50; // Keep last 50 activities
    this.activities = [];
    this.activityId = 0;

    logger.info({ maxActivities: this.maxActivities }, 'Activity feed manager initialized');
  }

  addActivity(activity: Record<string, unknown>): ActivityEntry {
    try {
      const activityEntry: ActivityEntry = {
        id: ++this.activityId,
        timestamp: new Date().toISOString(),
        ...activity
      };

      this.activities.unshift(activityEntry);
      if (this.activities.length > this.maxActivities) {
        this.activities = this.activities.slice(0, this.maxActivities);
      }

      if (activity.type === 'job:failed') {
        Sentry.addBreadcrumb({
          category: 'activity',
          message: activity.message as string,
          level: 'error',
          data: { jobId: activity.jobId, jobType: activity.jobType, error: activity.error }
        });
      }

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

  getRecentActivities(limit: number = 20): ActivityEntry[] {
    return this.activities.slice(0, limit);
  }

  clear(): void {
    this.activities = [];
    this.activityId = 0;
    logger.info('Activity feed cleared');
  }

  getStats(): ActivityStats {
    const now = Date.now();
    const oneHourAgo = now - TIMEOUTS.ONE_HOUR_MS;
    const oneDayAgo = now - TIMEOUTS.ONE_DAY_MS;

    const recentActivities = { lastHour: 0, lastDay: 0, total: this.activities.length };
    const typeCount: Record<string, number> = {};

    for (const activity of this.activities) {
      const activityTime = new Date(activity.timestamp).getTime();
      if (activityTime >= oneHourAgo) recentActivities.lastHour++;
      if (activityTime >= oneDayAgo) recentActivities.lastDay++;
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

  listenToWorker(worker: SidequestServer): void {
    try {
      logger.info('Setting up worker event listeners');
      worker.on('job:created', (job: Job) => this.handleJobCreated(job, worker));
      worker.on('job:started', (job: Job) => this.handleJobStarted(job, worker));
      worker.on('job:completed', (job: Job) => this.handleJobCompleted(job, worker));
      worker.on('job:failed', (job: Job, error: unknown) => this.handleJobFailed(job, error, worker));
      worker.on('retry:created', (job: Job, retryInfo: RetryInfo) => this.handleRetryCreated(job, retryInfo, worker));
      worker.on('retry:max-attempts', (jobId: string, attempts: number) => this.handleRetryMaxAttempts(jobId, attempts));
      logger.info('Worker event listeners configured');
      Sentry.addBreadcrumb({ category: 'activity-feed', message: 'Worker event listeners configured', level: 'info' });
    } catch (error) {
      logError(logger, error, 'Failed to set up worker event listeners');
      Sentry.captureException(error, { tags: { component: 'ActivityFeed', operation: 'listenToWorker' } });
      throw error;
    }
  }

  private handleJobCreated(job: Job, worker: SidequestServer): void {
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
  }

  private handleJobStarted(job: Job, worker: SidequestServer): void {
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
  }

  private handleJobCompleted(job: Job, worker: SidequestServer): void {
    try {
      const jobResult = job.result as Record<string, unknown> | null | undefined;
      let durationSeconds = (jobResult as Record<string, unknown> | null | undefined)?.duration_seconds as number | undefined;
      if (durationSeconds === undefined && job.startedAt && job.completedAt) {
        const startTime = job.startedAt instanceof Date ? job.startedAt : new Date(job.startedAt);
        const endTime = job.completedAt instanceof Date ? job.completedAt : new Date(job.completedAt);
        durationSeconds = (endTime.getTime() - startTime.getTime()) / TIME.SECOND;
      }

      const duration = durationSeconds != null ? `${durationSeconds.toFixed(2)}s` : 'unknown duration';

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
  }

  private handleJobFailed(job: Job, error: unknown, worker: SidequestServer): void {
    let activeError: unknown = error;
    try {
      if (activeError === undefined || activeError === null) {
        logger.warn({
          jobId: job?.id || 'unknown',
          errorType: typeof activeError
        }, 'job:failed event received with undefined/null error');
        activeError = new Error('Job failed with no error details');
      }

      if (!job) {
        logger.warn({ error: safeErrorMessage(activeError) }, 'job:failed event received with no job object');
        return;
      }

      const errorObj = toErrorObject(activeError, { fallbackMessage: 'Unknown error', metadata: { jobId: job.id } });
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
        error: { message: errorMessage, code: errorCode, retryable: errorRetryable },
        icon: '\u274c'
      });

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

      const sentryError = activeError instanceof Error ? activeError : new Error(errorMessage);
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
          errorCode,
          errorType: errorObj?.type || 'unknown',
          errorMessage
        }
      });
    } catch (activityError) {
      logError(logger, activityError, 'Failed to add job:failed activity', { job });
      Sentry.captureException(activityError, {
        tags: { component: 'ActivityFeed', event: 'job:failed:activity-error' },
        extra: { jobId: job?.id || 'unknown', originalError: safeErrorMessage(activeError) }
      });
    }
  }

  private handleRetryCreated(job: Job, retryInfo: RetryInfo, worker: SidequestServer): void {
    try {
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
        attempt, maxAttempts, delay, reason,
        status: 'retry',
        icon: '\u{1f504}'
      });

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

      Sentry.addBreadcrumb({
        category: 'retry',
        message: `Job ${job.id} retry attempt ${attempt}/${maxAttempts}`,
        level: 'warning',
        data: { jobId: job.id, attempt, maxAttempts, reason, delay }
      });
    } catch (activityError) {
      logError(logger, activityError, 'Failed to add retry:created activity', { jobId: job?.id });
      Sentry.captureException(activityError, {
        tags: { component: 'ActivityFeed', event: 'retry:created' },
        extra: { jobId: job?.id || 'unknown', retryInfo }
      });
    }
  }

  private handleRetryMaxAttempts(jobId: string, attempts: number): void {
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
  }
}
