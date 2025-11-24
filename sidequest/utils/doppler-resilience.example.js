/**
 * Doppler Resilience Usage Example
 *
 * This example demonstrates how to integrate the DopplerResilience circuit breaker
 * into your application to handle Doppler API failures gracefully.
 */

import { DopplerResilience } from './doppler-resilience.js';
import { config } from '../core/config.js';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('DopplerExample');

/**
 * Example 1: Basic Usage - Wrapping process.env access
 */
class DopplerConfigManager extends DopplerResilience {
  constructor(options = {}) {
    super({
      ...config.doppler,
      ...options
    });
  }

  /**
   * Override fetchFromDoppler to use process.env
   * (which is populated by `doppler run` command)
   */
  async fetchFromDoppler() {
    // In reality, when running with `doppler run`, process.env is already populated
    // This would just return the current environment
    // But we simulate checking if Doppler API is accessible by checking for sentinel value

    if (!process.env.NODE_ENV) {
      throw new Error('Doppler secrets not available - NODE_ENV missing');
    }

    // Return all environment variables
    return process.env;
  }

  /**
   * Get a specific secret with circuit breaker protection
   */
  async getSecret(key, defaultValue = null) {
    try {
      const secrets = await this.getSecrets();
      return secrets[key] ?? defaultValue;
    } catch (error) {
      logger.error({ key, error }, 'Failed to get secret');
      return defaultValue;
    }
  }
}

/**
 * Example 2: Using the circuit breaker in your application
 */
async function exampleUsage() {
  const dopplerConfig = new DopplerConfigManager();

  // Get secrets with circuit breaker protection
  try {
    const apiKey = await dopplerConfig.getSecret('API_KEY', 'fallback-key');
    const dbPassword = await dopplerConfig.getSecret('DB_PASSWORD');

    logger.info({ apiKey: '***', dbPassword: '***' }, 'Secrets loaded');
  } catch (error) {
    logger.error({ error }, 'Failed to load secrets');
  }

  // Check health status
  const health = dopplerConfig.getHealth();
  logger.info({ health }, 'Circuit breaker health');

  if (health.circuitState === 'OPEN') {
    logger.warn({
      waitTimeMs: health.waitTimeMs,
      failureCount: health.failureCount
    }, 'Circuit breaker is OPEN - using cached secrets');
  }
}

/**
 * Example 3: Express middleware for Doppler health monitoring
 */
export function createDopplerHealthMiddleware(dopplerConfig) {
  return async (req, res) => {
    const health = dopplerConfig.getHealth();

    const statusCode = health.healthy ? 200 : 503;
    const status = health.circuitState === 'CLOSED' ? 'healthy' : 'degraded';

    res.status(statusCode).json({
      status,
      circuitState: health.circuitState,
      healthy: health.healthy,
      usingFallback: health.usingFallback,
      metrics: {
        successRate: health.metrics.successRate,
        totalRequests: health.metrics.totalRequests,
        totalFailures: health.metrics.totalFailures
      },
      recovery: health.circuitState === 'OPEN' ? {
        waitTimeMs: health.waitTimeMs,
        nextAttemptTime: health.nextAttemptTime
      } : null,
      lastError: health.metrics.lastError
    });
  };
}

/**
 * Example 4: Integration with existing DopplerHealthMonitor
 */
export class IntegratedDopplerMonitor {
  constructor(options = {}) {
    this.resilience = new DopplerConfigManager(options);
  }

  /**
   * Get comprehensive health status
   */
  async getComprehensiveHealth() {
    const circuitHealth = this.resilience.getHealth();

    // Also check cache file age
    let cacheAge = null;
    if (circuitHealth.cacheLoadedAt) {
      cacheAge = Date.now() - new Date(circuitHealth.cacheLoadedAt).getTime();
    }

    return {
      // Circuit breaker status
      circuit: {
        state: circuitHealth.circuitState,
        healthy: circuitHealth.healthy,
        failureCount: circuitHealth.failureCount,
        successRate: circuitHealth.metrics.successRate
      },

      // Cache status
      cache: {
        usingFallback: circuitHealth.usingFallback,
        loadedAt: circuitHealth.cacheLoadedAt,
        ageMs: cacheAge,
        ageHours: cacheAge ? Math.floor(cacheAge / (60 * 60 * 1000)) : null
      },

      // Recovery information
      recovery: circuitHealth.circuitState === 'OPEN' ? {
        waitTimeMs: circuitHealth.waitTimeMs,
        nextAttemptTime: circuitHealth.nextAttemptTime,
        currentBackoffMs: circuitHealth.currentBackoffMs
      } : null,

      // Recommendations
      recommendations: this.generateRecommendations(circuitHealth, cacheAge)
    };
  }

  /**
   * Generate actionable recommendations based on health status
   */
  generateRecommendations(health, cacheAge) {
    const recommendations = [];

    if (health.circuitState === 'OPEN') {
      recommendations.push({
        severity: 'critical',
        message: `Circuit breaker is OPEN due to ${health.failureCount} consecutive failures`,
        action: 'Check Doppler API status at https://status.doppler.com'
      });

      recommendations.push({
        severity: 'info',
        message: `Circuit will attempt recovery in ${health.waitTimeMs}ms`,
        action: 'Wait for automatic recovery or manually reset if API is restored'
      });
    }

    if (health.usingFallback) {
      recommendations.push({
        severity: 'warning',
        message: 'Using cached secrets - secrets may be stale',
        action: 'Verify no critical secrets have been rotated'
      });
    }

    if (cacheAge && cacheAge > 24 * 60 * 60 * 1000) { // > 24 hours
      recommendations.push({
        severity: 'critical',
        message: `Cache is ${Math.floor(cacheAge / (60 * 60 * 1000))} hours old`,
        action: 'Restart application with `doppler run` to refresh secrets'
      });
    }

    if (health.metrics.successRate && parseFloat(health.metrics.successRate) < 50) {
      recommendations.push({
        severity: 'warning',
        message: `Low success rate: ${health.metrics.successRate}`,
        action: 'Investigate Doppler connectivity issues or increase failure threshold'
      });
    }

    return recommendations;
  }

  /**
   * Manual recovery trigger (for operational use)
   */
  async triggerRecovery() {
    logger.info('Manually triggering circuit breaker recovery');
    this.resilience.reset();

    // Attempt to fetch fresh secrets
    try {
      await this.resilience.getSecrets();
      logger.info('Circuit breaker recovered successfully');
      return { success: true, message: 'Circuit breaker reset and secrets refreshed' };
    } catch (error) {
      logger.error({ error }, 'Failed to recover circuit breaker');
      return { success: false, message: error.message };
    }
  }
}

/**
 * Example 5: Periodic health monitoring
 */
export class DopplerHealthService {
  constructor(options = {}) {
    this.monitor = new IntegratedDopplerMonitor(options);
    this.checkIntervalMs = options.checkIntervalMs || 60000; // 1 minute
    this.intervalId = null;
  }

  /**
   * Start periodic health checks
   */
  start() {
    if (this.intervalId) {
      logger.warn('Health monitoring already started');
      return;
    }

    logger.info({ checkIntervalMs: this.checkIntervalMs }, 'Starting Doppler health monitoring');

    this.intervalId = setInterval(async () => {
      const health = await this.monitor.getComprehensiveHealth();

      if (!health.circuit.healthy) {
        logger.warn({ health }, 'Doppler health check - circuit degraded');
      } else {
        logger.debug({ health }, 'Doppler health check - healthy');
      }

      // Alert on critical recommendations
      const critical = health.recommendations.filter(r => r.severity === 'critical');
      if (critical.length > 0) {
        logger.error({ recommendations: critical }, 'Critical Doppler issues detected');
      }
    }, this.checkIntervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Stopped Doppler health monitoring');
    }
  }

  /**
   * Get current health status
   */
  async getHealth() {
    return await this.monitor.getComprehensiveHealth();
  }
}

// Export example instances for testing
export {
  DopplerConfigManager,
  exampleUsage
};
