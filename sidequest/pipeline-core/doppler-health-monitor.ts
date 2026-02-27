/**
 * Doppler Health Monitor
 *
 * Monitors Doppler cache age and alerts when secrets may be stale.
 *
 * Usage:
 *   import { DopplerHealthMonitor } from './sidequest/pipeline-core/doppler-health-monitor.ts';
 *
 *   const monitor = new DopplerHealthMonitor();
 *   await monitor.startMonitoring(15); // Check every 15 minutes
 *
 *   // Or check on-demand:
 *   const health = await monitor.checkCacheHealth();
 */

import { createComponentLogger, logError } from '../utils/logger.ts';
import { CACHE, TIME } from '../core/constants.ts';
import Sentry from '@sentry/node';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const logger = createComponentLogger('DopplerHealthMonitor');

// ============================================================================
// Type Definitions
// ============================================================================

export type CacheSeverity = 'healthy' | 'warning' | 'critical' | 'error';

export interface CacheHealthStatus {
  healthy: boolean;
  cacheAgeMs: number;
  cacheAgeHours: number;
  cacheAgeMinutes: number;
  lastModified: string | null;
  usingFallback: boolean;
  fileCount: number;
  severity: CacheSeverity;
  newestFile?: string;
  error?: string;
  errorCode?: string;
}

export interface DopplerHealthMonitorOptions {
  cacheDir?: string;
  maxCacheAge?: number;
  warningThreshold?: number;
}

export class DopplerHealthMonitor {
  private cacheDir: string;
  private maxCacheAge: number;
  private warningThreshold: number;
  private monitoringInterval: ReturnType<typeof setInterval> | null;

    /**
   * Constructor.
   *
   * @param {DopplerHealthMonitorOptions} [options={}] - Options dictionary
   */
  constructor(options: DopplerHealthMonitorOptions = {}) {
    // Doppler fallback cache directory (not a single file)
    // Doppler CLI stores secrets in ~/.doppler/fallback/ as individual JSON files
    this.cacheDir = options.cacheDir ?? path.join(os.homedir(), '.doppler', 'fallback');

    // Max cache age before triggering alerts (default: 24 hours)
    this.maxCacheAge = options.maxCacheAge ?? CACHE.MAX_AGE_MS;

    // Warning threshold (default: 12 hours)
    this.warningThreshold = options.warningThreshold ?? CACHE.WARNING_THRESHOLD_MS;

    this.monitoringInterval = null;
  }

    /**
   * Check cache health.
   *
   * @returns {Promise<CacheHealthStatus>} The Promise<CacheHealthStatus>
   * @async
   */
  async checkCacheHealth(): Promise<CacheHealthStatus> {
    try {
      // Check if fallback directory exists
      const dirStats = await fs.stat(this.cacheDir);
      if (!dirStats.isDirectory()) {
        throw new Error('Fallback path exists but is not a directory');
      }

      // Find all secret files (not metadata)
      const files = await fs.readdir(this.cacheDir);
      const secretFiles = files.filter(f => f.startsWith('.secrets-') && f.endsWith('.json'));

      if (secretFiles.length === 0) {
        logger.warn({ cacheDir: this.cacheDir }, 'Doppler fallback directory exists but contains no secret files');

        return {
          healthy: false,
          cacheAgeMs: 0,
          cacheAgeHours: 0,
          cacheAgeMinutes: 0,
          lastModified: null,
          usingFallback: false,
          fileCount: 0,
          severity: 'warning'
        };
      }

      // Find the most recently modified secret file
      let newestFile: string | null = null;
      let newestMtime = 0;

      for (const file of secretFiles) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        if (stats.mtime.getTime() > newestMtime) {
          newestMtime = stats.mtime.getTime();
          newestFile = file;
        }
      }

      const cacheAge = Date.now() - newestMtime;
      const cacheAgeHours = Math.floor(cacheAge / TIME.HOUR);
      const cacheAgeMinutes = Math.floor((cacheAge % (60 * 60 * 1000)) / TIME.MINUTE);

      const status: CacheHealthStatus = {
        healthy: cacheAge <= this.maxCacheAge,
        cacheAgeMs: cacheAge,
        cacheAgeHours,
        cacheAgeMinutes,
        lastModified: new Date(newestMtime).toISOString(),
        newestFile: newestFile ?? undefined,
        fileCount: secretFiles.length,
        usingFallback: true,
        severity: this.getSeverity(cacheAge)
      };

      if (cacheAge > this.maxCacheAge) {
        logger.error({
          cacheAgeHours,
          lastModified: new Date(newestMtime),
          newestFile,
          fileCount: secretFiles.length
        }, 'Doppler cache is critically stale - secrets may be outdated');

        Sentry.captureMessage('Doppler cache critically stale', {
          level: 'error',
          extra: {
            cacheAgeHours,
            cacheAgeMinutes,
            lastModified: new Date(newestMtime).toISOString(),
            threshold: this.maxCacheAge / TIME.HOUR,
            newestFile,
            fileCount: secretFiles.length
          },
          tags: {
            component: 'doppler-health-monitor',
            severity: 'critical'
          }
        });
      } else if (cacheAge > this.warningThreshold) {
        logger.warn({
          cacheAgeHours,
          lastModified: new Date(newestMtime),
          newestFile
        }, 'Doppler cache is aging - approaching staleness threshold');

        Sentry.captureMessage('Doppler cache aging', {
          level: 'warning',
          extra: {
            cacheAgeHours,
            cacheAgeMinutes,
            lastModified: new Date(newestMtime).toISOString(),
            threshold: this.warningThreshold / TIME.HOUR,
            newestFile,
            fileCount: secretFiles.length
          },
          tags: {
            component: 'doppler-health-monitor',
            severity: 'warning'
          }
        });
      } else {
        logger.debug({
          cacheAgeHours,
          cacheAgeMinutes,
          fileCount: secretFiles.length
        }, 'Doppler cache health check - within thresholds');
      }

      return status;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        // Cache directory doesn't exist - probably using live Doppler only
        logger.debug({ cacheDir: this.cacheDir }, 'No Doppler fallback cache found - likely using live API only');

        return {
          healthy: true,
          cacheAgeMs: 0,
          cacheAgeHours: 0,
          cacheAgeMinutes: 0,
          lastModified: null,
          usingFallback: false,
          fileCount: 0,
          severity: 'healthy'
        };
      }

      logError(logger, error, 'Failed to check Doppler cache health', { cacheDir: this.cacheDir });

      Sentry.captureException(error, {
        tags: {
          component: 'doppler-health-monitor',
          operation: 'check-cache-health'
        }
      });

      return {
        healthy: false,
        error: nodeError.message,
        errorCode: nodeError.code,
        severity: 'error',
        cacheAgeMs: 0,
        cacheAgeHours: 0,
        cacheAgeMinutes: 0,
        lastModified: null,
        usingFallback: false,
        fileCount: 0
      };
    }
  }

    /**
   * Get the severity.
   *
   * @param {number} cacheAge - The cacheAge
   *
   * @returns {CacheSeverity} The severity
   */
  getSeverity(cacheAge: number): CacheSeverity {
    if (cacheAge > this.maxCacheAge) {
      return 'critical';
    } else if (cacheAge > this.warningThreshold) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

    /**
   * Start monitoring.
   *
   * @param {*} [intervalMinutes=15] - The intervalMinutes
   *
   * @returns {Promise<CacheHealthStatus>} The Promise<CacheHealthStatus>
   * @async
   */
  async startMonitoring(intervalMinutes = 15): Promise<CacheHealthStatus> {
    if (this.monitoringInterval) {
      logger.warn('Monitoring already started, stopping previous interval');
      this.stopMonitoring();
    }

    logger.info({
      intervalMinutes,
      maxCacheAgeHours: this.maxCacheAge / TIME.HOUR,
      warningThresholdHours: this.warningThreshold / TIME.HOUR
    }, 'Starting Doppler health monitoring');

    // Initial check
    const initialHealth = await this.checkCacheHealth();
    logger.info({ initialHealth }, 'Initial Doppler health check complete');

    // Periodic checks
    this.monitoringInterval = setInterval(async () => {
      await this.checkCacheHealth();
    }, intervalMinutes * TIME.MINUTE);

    return initialHealth;
  }

  /**
   * Stop periodic monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Doppler health monitoring stopped');
    }
  }

    /**
   * Get the cache directory path.
   *
   * @returns {string} The cache directory path
   */
  getCacheDirectoryPath(): string {
    return this.cacheDir;
  }
}

export default DopplerHealthMonitor;
