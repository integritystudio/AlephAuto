/**
 * Doppler Health Monitor
 *
 * Monitors Doppler cache age and alerts when secrets may be stale.
 *
 * Usage:
 *   import { DopplerHealthMonitor } from './sidequest/pipeline-core/doppler-health-monitor.js';
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

export class DopplerHealthMonitor {
  constructor(options = {}) {
    // Doppler fallback cache directory (not a single file)
    // Doppler CLI stores secrets in ~/.doppler/fallback/ as individual JSON files
    this.cacheDir = options.cacheDir || path.join(os.homedir(), '.doppler', 'fallback');

    // Max cache age before triggering alerts (default: 24 hours)
    this.maxCacheAge = options.maxCacheAge || CACHE.MAX_AGE_MS;

    // Warning threshold (default: 12 hours)
    this.warningThreshold = options.warningThreshold || CACHE.WARNING_THRESHOLD_MS;

    this.monitoringInterval = null;
  }

  /**
   * Check Doppler cache health
   *
   * @returns {Promise<Object>} Health status with cache age info
   */
  async checkCacheHealth() {
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
      let newestFile = null;
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

      const status = {
        healthy: cacheAge <= this.maxCacheAge,
        cacheAgeMs: cacheAge,
        cacheAgeHours,
        cacheAgeMinutes,
        lastModified: new Date(newestMtime).toISOString(),
        newestFile,
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
      if (error.code === 'ENOENT') {
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
        error: error.message,
        errorCode: error.code,
        severity: 'error'
      };
    }
  }

  /**
   * Get severity level based on cache age
   *
   * @param {number} cacheAge - Age in milliseconds
   * @returns {string} Severity level
   */
  getSeverity(cacheAge) {
    if (cacheAge > this.maxCacheAge) {
      return 'critical';
    } else if (cacheAge > this.warningThreshold) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Start periodic monitoring
   *
   * @param {number} intervalMinutes - Check interval in minutes (default: 15)
   * @returns {Promise<void>}
   */
  async startMonitoring(intervalMinutes = 15) {
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
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Doppler health monitoring stopped');
    }
  }

  /**
   * Get cache directory path (for testing/debugging)
   *
   * @returns {string} Cache directory path
   */
  getCacheDirectoryPath() {
    return this.cacheDir;
  }
}

export default DopplerHealthMonitor;
