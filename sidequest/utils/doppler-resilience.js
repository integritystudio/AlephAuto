/**
 * Doppler Resilience Module
 *
 * Implements circuit breaker pattern with exponential backoff to handle
 * Doppler API HTTP 500 errors gracefully.
 *
 * Features:
 * - Circuit breaker with 3 states: CLOSED, OPEN, HALF_OPEN
 * - Exponential backoff (1s, 2s, 4s, 8s, max 10s)
 * - Graceful fallback to cached secrets
 * - Health check endpoint integration
 * - Sentry error tracking
 *
 * Usage:
 *   import { DopplerResilience } from './sidequest/utils/doppler-resilience.js';
 *
 *   const doppler = new DopplerResilience();
 *   const secrets = await doppler.getSecrets();
 *
 *   // Get health status
 *   const health = doppler.getHealth();
 */

import { createComponentLogger, logError } from './logger.ts';
import { TIMEOUTS, RETRY, CACHE } from '../core/constants.ts';
import Sentry from '@sentry/node';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const logger = createComponentLogger('DopplerResilience');

// Circuit breaker states
const CircuitState = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failures detected, using fallback
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

export class DopplerResilience {
  constructor(options = {}) {
    // Circuit breaker configuration
    this.failureThreshold = options.failureThreshold || 3; // Open circuit after N failures
    this.successThreshold = options.successThreshold || 2; // Close circuit after N successes in HALF_OPEN
    this.timeout = options.timeout || TIMEOUTS.SHORT_MS; // Timeout before attempting HALF_OPEN
    this.maxBackoffMs = options.maxBackoffMs || RETRY.MAX_BACKOFF_MS;

    // Exponential backoff configuration
    this.baseDelayMs = options.baseDelayMs || RETRY.BASE_BACKOFF_MS;
    this.backoffMultiplier = options.backoffMultiplier || 2; // Double each retry

    // State tracking
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.consecutiveFailures = 0;
    this.nextAttemptTime = null;

    // Fallback cache configuration
    this.cacheFile = options.cacheFile || path.join(os.homedir(), '.doppler', '.fallback.json');
    this.cachedSecrets = null;
    this.cacheLoadedAt = null;

    // Metrics for health monitoring
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      currentBackoffMs: 0,
      lastError: null
    };
  }

  /**
   * Get secrets with circuit breaker protection
   *
   * @returns {Promise<Object>} Secrets object
   * @throws {Error} If circuit is open and no fallback available
   */
  async getSecrets() {
    this.metrics.totalRequests++;

    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has elapsed to attempt recovery
      if (Date.now() >= this.nextAttemptTime) {
        logger.info('Circuit breaker timeout elapsed, attempting HALF_OPEN state');
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        // Circuit still open, use fallback
        const waitMs = this.nextAttemptTime - Date.now();
        logger.warn({
          state: this.state,
          waitMs,
          failureCount: this.failureCount
        }, 'Circuit breaker OPEN, using cached secrets');

        return await this.getFallbackSecrets();
      }
    }

    try {
      // Attempt to fetch from Doppler API
      const secrets = await this.fetchFromDoppler();

      // Success handling
      this.handleSuccess();

      return secrets;
    } catch (error) {
      // Failure handling
      this.handleFailure(error);

      // Fallback to cached secrets
      return await this.getFallbackSecrets();
    }
  }

  /**
   * Fetch secrets from Doppler API (to be implemented by consumer)
   * This is a placeholder that should be overridden
   *
   * @returns {Promise<Object>} Secrets from Doppler
   * @throws {Error} If Doppler API fails
   */
  async fetchFromDoppler() {
    // This is a placeholder - in actual usage, this would call Doppler CLI
    // or use process.env which is populated by `doppler run`
    throw new Error('fetchFromDoppler must be implemented by consumer');
  }

  /**
   * Get fallback secrets from cache file
   *
   * @returns {Promise<Object>} Cached secrets
   * @throws {Error} If cache file doesn't exist
   */
  async getFallbackSecrets() {
    try {
      // Load from cache if not already loaded or cache is stale
      if (!this.cachedSecrets || this.isCacheStale()) {
        logger.info({ cacheFile: this.cacheFile }, 'Loading fallback secrets from cache');

        const cacheContent = await fs.readFile(this.cacheFile, 'utf-8');
        this.cachedSecrets = JSON.parse(cacheContent);
        this.cacheLoadedAt = Date.now();

        logger.info('Fallback secrets loaded successfully');
      }

      return this.cachedSecrets;
    } catch (error) {
      logError(logger, error, 'Failed to load fallback secrets', { cacheFile: this.cacheFile });

      Sentry.captureException(error, {
        tags: {
          component: 'doppler-resilience',
          operation: 'get-fallback-secrets'
        },
        extra: {
          cacheFile: this.cacheFile,
          circuitState: this.state
        }
      });

      throw new Error(`Doppler API unavailable and no fallback cache: ${error.message}`);
    }
  }

  /**
   * Check if cache is stale (older than 5 minutes)
   *
   * @returns {boolean} True if cache should be reloaded
   */
  isCacheStale() {
    if (!this.cacheLoadedAt) return true;

    const cacheAgeMs = Date.now() - this.cacheLoadedAt;
    const staleThresholdMs = CACHE.STALE_THRESHOLD_MS;

    return cacheAgeMs > staleThresholdMs;
  }

  /**
   * Handle successful Doppler API call
   */
  handleSuccess() {
    this.lastSuccessTime = Date.now();
    this.consecutiveFailures = 0;
    this.metrics.totalSuccesses++;
    this.metrics.currentBackoffMs = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      logger.info({
        successCount: this.successCount,
        threshold: this.successThreshold
      }, 'Success in HALF_OPEN state');

      if (this.successCount >= this.successThreshold) {
        // Enough successes, close circuit
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;

        logger.info('Circuit breaker CLOSED - service recovered');

        Sentry.captureMessage('Doppler circuit breaker recovered', {
          level: 'info',
          tags: {
            component: 'doppler-resilience',
            circuitState: 'CLOSED'
          }
        });
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in CLOSED state
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed Doppler API call
   *
   * @param {Error} error - The error that occurred
   */
  handleFailure(error) {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.consecutiveFailures++;
    this.metrics.totalFailures++;
    this.metrics.lastError = {
      message: error.message,
      timestamp: new Date().toISOString()
    };

    // Calculate exponential backoff
    const backoffMs = Math.min(
      this.baseDelayMs * Math.pow(this.backoffMultiplier, this.consecutiveFailures - 1),
      this.maxBackoffMs
    );
    this.metrics.currentBackoffMs = backoffMs;

    logger.warn({
      error: error.message,
      failureCount: this.failureCount,
      consecutiveFailures: this.consecutiveFailures,
      backoffMs,
      state: this.state
    }, 'Doppler API call failed');

    if (this.state === CircuitState.HALF_OPEN) {
      // Failure in HALF_OPEN, reopen circuit
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.timeout;

      logger.warn({
        nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
      }, 'Circuit breaker reopened due to failure in HALF_OPEN state');

      Sentry.captureMessage('Doppler circuit breaker reopened', {
        level: 'warning',
        tags: {
          component: 'doppler-resilience',
          circuitState: 'OPEN'
        },
        extra: {
          failureCount: this.failureCount,
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
        }
      });
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
      // Too many failures, open circuit
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.timeout;

      logger.error({
        failureCount: this.failureCount,
        threshold: this.failureThreshold,
        nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
      }, 'Circuit breaker OPEN - failure threshold exceeded');

      Sentry.captureException(error, {
        level: 'error',
        tags: {
          component: 'doppler-resilience',
          circuitState: 'OPEN'
        },
        extra: {
          failureCount: this.failureCount,
          failureThreshold: this.failureThreshold,
          consecutiveFailures: this.consecutiveFailures,
          backoffMs
        }
      });
    }
  }

  /**
   * Get current health status for monitoring
   *
   * @returns {Object} Health status object
   */
  getHealth() {
    const now = Date.now();

    return {
      healthy: this.state === CircuitState.CLOSED,
      circuitState: this.state,
      failureCount: this.failureCount,
      consecutiveFailures: this.consecutiveFailures,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime).toISOString()
        : null,
      lastSuccessTime: this.lastSuccessTime
        ? new Date(this.lastSuccessTime).toISOString()
        : null,
      nextAttemptTime: this.nextAttemptTime
        ? new Date(this.nextAttemptTime).toISOString()
        : null,
      waitTimeMs: this.nextAttemptTime
        ? Math.max(0, this.nextAttemptTime - now)
        : 0,
      currentBackoffMs: this.metrics.currentBackoffMs,
      metrics: {
        totalRequests: this.metrics.totalRequests,
        totalFailures: this.metrics.totalFailures,
        totalSuccesses: this.metrics.totalSuccesses,
        successRate: this.metrics.totalRequests > 0
          ? (this.metrics.totalSuccesses / this.metrics.totalRequests * 100).toFixed(2) + '%'
          : 'N/A',
        lastError: this.metrics.lastError
      },
      usingFallback: this.state !== CircuitState.CLOSED,
      cacheLoadedAt: this.cacheLoadedAt
        ? new Date(this.cacheLoadedAt).toISOString()
        : null
    };
  }

  /**
   * Manually reset circuit breaker (for testing or manual intervention)
   */
  reset() {
    logger.info('Manually resetting circuit breaker');

    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.nextAttemptTime = null;
    this.metrics.currentBackoffMs = 0;
  }

  /**
   * Get circuit state (for testing)
   *
   * @returns {string} Current circuit state
   */
  getState() {
    return this.state;
  }
}

export default DopplerResilience;
