/**
 * Doppler Resilience Module
 *
 * Implements circuit breaker pattern with exponential backoff to handle
 * Doppler API HTTP 500 errors gracefully.
 */

import { createComponentLogger, logError } from './logger.ts';
import { TIMEOUTS, RETRY, CACHE } from '../core/constants.ts';
import Sentry from '@sentry/node';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const logger = createComponentLogger('DopplerResilience');

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
} as const;

type CircuitStateType = typeof CircuitState[keyof typeof CircuitState];

interface DopplerResilienceOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  maxBackoffMs?: number;
  baseDelayMs?: number;
  backoffMultiplier?: number;
  cacheFile?: string;
}

interface ResilienceMetrics {
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  currentBackoffMs: number;
  lastError: { message: string; timestamp: string } | null;
}

interface HealthStatus {
  healthy: boolean;
  circuitState: CircuitStateType;
  failureCount: number;
  consecutiveFailures: number;
  successCount: number;
  lastFailureTime: string | null;
  lastSuccessTime: string | null;
  nextAttemptTime: string | null;
  waitTimeMs: number;
  currentBackoffMs: number;
  metrics: {
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    successRate: string;
    lastError: { message: string; timestamp: string } | null;
  };
  usingFallback: boolean;
  cacheLoadedAt: string | null;
}

export class DopplerResilience {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  maxBackoffMs: number;
  baseDelayMs: number;
  backoffMultiplier: number;
  state: CircuitStateType;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  consecutiveFailures: number;
  nextAttemptTime: number | null;
  cacheFile: string;
  cachedSecrets: Record<string, unknown> | null;
  cacheLoadedAt: number | null;
  metrics: ResilienceMetrics;

  constructor(options: DopplerResilienceOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.successThreshold = options.successThreshold ?? 2;
    this.timeout = options.timeout ?? TIMEOUTS.SHORT_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? RETRY.MAX_BACKOFF_MS;

    this.baseDelayMs = options.baseDelayMs ?? RETRY.BASE_BACKOFF_MS;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;

    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.consecutiveFailures = 0;
    this.nextAttemptTime = null;

    this.cacheFile = options.cacheFile ?? path.join(os.homedir(), '.doppler', '.fallback.json');
    this.cachedSecrets = null;
    this.cacheLoadedAt = null;

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
   */
  async getSecrets(): Promise<Record<string, unknown>> {
    this.metrics.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttemptTime!) {
        logger.info('Circuit breaker timeout elapsed, attempting HALF_OPEN state');
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        const waitMs = this.nextAttemptTime! - Date.now();
        logger.warn({
          state: this.state,
          waitMs,
          failureCount: this.failureCount
        }, 'Circuit breaker OPEN, using cached secrets');

        return await this.getFallbackSecrets();
      }
    }

    try {
      const secrets = await this.fetchFromDoppler();
      this.handleSuccess();
      return secrets;
    } catch (error) {
      this.handleFailure(error as Error);
      return await this.getFallbackSecrets();
    }
  }

  /**
   * Fetch secrets from Doppler API (to be implemented by consumer)
   */
  async fetchFromDoppler(): Promise<Record<string, unknown>> {
    throw new Error('fetchFromDoppler must be implemented by consumer');
  }

  /**
   * Get fallback secrets from cache file
   */
  async getFallbackSecrets(): Promise<Record<string, unknown>> {
    try {
      if (!this.cachedSecrets || this.isCacheStale()) {
        logger.info({ cacheFile: this.cacheFile }, 'Loading fallback secrets from cache');

        const cacheContent = await fs.readFile(this.cacheFile, 'utf-8');
        this.cachedSecrets = JSON.parse(cacheContent);
        this.cacheLoadedAt = Date.now();

        logger.info('Fallback secrets loaded successfully');
      }

      return this.cachedSecrets!;
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

      throw new Error(`Doppler API unavailable and no fallback cache: ${(error as Error).message}`);
    }
  }

  /**
   * Check if cache is stale
   */
  isCacheStale(): boolean {
    if (!this.cacheLoadedAt) return true;

    const cacheAgeMs = Date.now() - this.cacheLoadedAt;
    const staleThresholdMs = CACHE.STALE_THRESHOLD_MS;

    return cacheAgeMs > staleThresholdMs;
  }

  /**
   * Handle successful Doppler API call
   */
  handleSuccess(): void {
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
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed Doppler API call
   */
  handleFailure(error: Error): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.consecutiveFailures++;
    this.metrics.totalFailures++;
    this.metrics.lastError = {
      message: error.message,
      timestamp: new Date().toISOString()
    };

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
   */
  getHealth(): HealthStatus {
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
   * Manually reset circuit breaker
   */
  reset(): void {
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
   * Get circuit state
   */
  getState(): CircuitStateType {
    return this.state;
  }
}

export default DopplerResilience;
