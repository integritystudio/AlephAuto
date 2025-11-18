/**
 * Doppler Health Monitor
 *
 * Monitors Doppler cache age and alerts when secrets may be stale.
 *
 * Usage:
 *   import { DopplerHealthMonitor } from './lib/doppler-health-monitor.js';
 *
 *   const monitor = new DopplerHealthMonitor();
 *   await monitor.startMonitoring(15); // Check every 15 minutes
 *
 *   // Or check on-demand:
 *   const health = await monitor.checkCacheHealth();
 */

import { createComponentLogger } from '../sidequest/logger.js';
import Sentry from '@sentry/node';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const logger = createComponentLogger('DopplerHealthMonitor');

export class DopplerHealthMonitor {
  constructor(options = {}) {
    // Doppler fallback cache location
    this.cacheFile = options.cacheFile || path.join(os.homedir(), '.doppler', '.fallback.json');

    // Max cache age before triggering alerts (default: 24 hours)
    this.maxCacheAge = options.maxCacheAge || 24 * 60 * 60 * 1000;

    // Warning threshold (default: 12 hours)
    this.warningThreshold = options.warningThreshold || 12 * 60 * 60 * 1000;

    this.monitoringInterval = null;
  }

  /**
   * Check Doppler cache health
   *
   * @returns {Promise<Object>} Health status with cache age info
   */
  async checkCacheHealth() {
    try {
      const stats = await fs.stat(this.cacheFile);
      const cacheAge = Date.now() - stats.mtime.getTime();
      const cacheAgeHours = Math.floor(cacheAge / (60 * 60 * 1000));
      const cacheAgeMinutes = Math.floor((cacheAge % (60 * 60 * 1000)) / (60 * 1000));

      const status = {
        healthy: cacheAge <= this.maxCacheAge,
        cacheAgeMs: cacheAge,
        cacheAgeHours,
        cacheAgeMinutes,
        lastModified: stats.mtime.toISOString(),
        usingFallback: true, // If cache file exists and has age, we're using fallback
        severity: this.getSeverity(cacheAge)
      };

      if (cacheAge > this.maxCacheAge) {
        logger.error({
          cacheAgeHours,
          lastModified: stats.mtime
        }, 'Doppler cache is critically stale - secrets may be outdated');

        Sentry.captureMessage('Doppler cache critically stale', {
          level: 'error',
          extra: {
            cacheAgeHours,
            cacheAgeMinutes,
            lastModified: stats.mtime.toISOString(),
            threshold: this.maxCacheAge / (60 * 60 * 1000)
          },
          tags: {
            component: 'doppler-health-monitor',
            severity: 'critical'
          }
        });
      } else if (cacheAge > this.warningThreshold) {
        logger.warn({
          cacheAgeHours,
          lastModified: stats.mtime
        }, 'Doppler cache is aging - approaching staleness threshold');

        Sentry.captureMessage('Doppler cache aging', {
          level: 'warning',
          extra: {
            cacheAgeHours,
            cacheAgeMinutes,
            lastModified: stats.mtime.toISOString(),
            threshold: this.warningThreshold / (60 * 60 * 1000)
          },
          tags: {
            component: 'doppler-health-monitor',
            severity: 'warning'
          }
        });
      } else {
        logger.debug({
          cacheAgeHours,
          cacheAgeMinutes
        }, 'Doppler cache health check - within thresholds');
      }

      return status;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Cache file doesn't exist - probably using live Doppler
        logger.debug('No Doppler fallback cache found - likely using live API');

        return {
          healthy: true,
          cacheAgeMs: 0,
          cacheAgeHours: 0,
          cacheAgeMinutes: 0,
          lastModified: null,
          usingFallback: false,
          severity: 'healthy'
        };
      }

      logger.error({ error }, 'Failed to check Doppler cache health');

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
      maxCacheAgeHours: this.maxCacheAge / (60 * 60 * 1000),
      warningThresholdHours: this.warningThreshold / (60 * 60 * 1000)
    }, 'Starting Doppler health monitoring');

    // Initial check
    const initialHealth = await this.checkCacheHealth();
    logger.info({ initialHealth }, 'Initial Doppler health check complete');

    // Periodic checks
    this.monitoringInterval = setInterval(async () => {
      await this.checkCacheHealth();
    }, intervalMinutes * 60 * 1000);

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
   * Get cache file path (for testing/debugging)
   *
   * @returns {string} Cache file path
   */
  getCacheFilePath() {
    return this.cacheFile;
  }
}

export default DopplerHealthMonitor;
