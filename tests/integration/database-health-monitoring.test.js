/**
 * Database Health Monitoring Integration Test
 *
 * Demonstrates how to use the health status API for monitoring
 * and alerting in production systems.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  initDatabase,
  getHealthStatus,
  isDatabaseReady
} from '../../sidequest/core/database.js';

describe('Database Health Monitoring Integration', () => {
  beforeEach(async () => {
    if (!isDatabaseReady()) {
      await initDatabase();
    }
  });

  describe('Health Check Endpoint Pattern', () => {
    it('should provide health data suitable for monitoring systems', () => {
      const health = getHealthStatus();

      // Monitoring systems expect these fields
      assert.ok(typeof health.status === 'string');
      assert.ok(['healthy', 'degraded', 'not_initialized'].includes(health.status));

      // Metrics for dashboards
      assert.ok(typeof health.persistFailureCount === 'number');
      assert.ok(typeof health.recoveryAttempts === 'number');
      assert.ok(typeof health.queuedWrites === 'number');

      // Human-readable message for alerts
      assert.ok(typeof health.message === 'string');
      assert.ok(health.message.length > 0);
    });

    it('should indicate if immediate action is needed', () => {
      const health = getHealthStatus();

      // In healthy state, no action needed
      if (health.status === 'healthy') {
        assert.strictEqual(health.degradedMode, false);
        assert.strictEqual(health.persistenceWorking, true);
      }

      // If degraded, action may be needed
      if (health.status === 'degraded') {
        assert.strictEqual(health.degradedMode, true);
        assert.strictEqual(health.persistenceWorking, false);
        // Should have queued writes or be attempting recovery
        assert.ok(health.queuedWrites >= 0);
        assert.ok(health.recoveryAttempts >= 0);
      }
    });
  });

  describe('Production Monitoring Patterns', () => {
    it('should support Prometheus-style metrics extraction', () => {
      const health = getHealthStatus();

      // These could be exposed as Prometheus metrics
      const metrics = {
        'database_initialized': health.initialized ? 1 : 0,
        'database_degraded_mode': health.degradedMode ? 1 : 0,
        'database_persist_failures_total': health.persistFailureCount,
        'database_recovery_attempts_total': health.recoveryAttempts,
        'database_queued_writes': health.queuedWrites
      };

      // All metrics should be numeric
      Object.values(metrics).forEach(value => {
        assert.ok(typeof value === 'number');
      });
    });

    it('should support alerting rules', () => {
      const health = getHealthStatus();

      // Example alerting rules
      const alerts = {
        // Alert if database is in degraded mode
        'DatabaseDegraded': health.degradedMode,

        // Alert if persistence failures exceed threshold
        'HighPersistenceFailures': health.persistFailureCount > 3,

        // Alert if write queue is growing too large
        'LargeWriteQueue': health.queuedWrites > 100,

        // Alert if recovery attempts are exhausted
        'RecoveryExhausted': health.recoveryAttempts >= 10
      };

      // In healthy state, no alerts should fire
      if (health.status === 'healthy') {
        Object.values(alerts).forEach(shouldAlert => {
          assert.strictEqual(shouldAlert, false);
        });
      }
    });
  });

  describe('Health Check Response Examples', () => {
    it('healthy state response', () => {
      const health = getHealthStatus();

      if (health.status === 'healthy') {
        // Example response for a monitoring endpoint
        const response = {
          status: 'ok',
          component: 'database',
          details: {
            mode: health.degradedMode ? 'degraded' : 'normal',
            persistence: health.persistenceWorking ? 'working' : 'failed',
            metrics: {
              failureCount: health.persistFailureCount,
              recoveryAttempts: health.recoveryAttempts,
              queuedWrites: health.queuedWrites
            }
          },
          message: health.message
        };

        assert.strictEqual(response.status, 'ok');
        assert.strictEqual(response.details.mode, 'normal');
      }
    });

    it('degraded state response', () => {
      const health = getHealthStatus();

      // This documents what a degraded state would look like
      if (health.status === 'degraded') {
        const response = {
          status: 'degraded',
          component: 'database',
          severity: 'warning',
          details: {
            mode: 'degraded',
            persistence: 'failed',
            dataLoss: false, // In-memory operations continue
            autoRecovery: true,
            metrics: {
              failureCount: health.persistFailureCount,
              recoveryAttempts: health.recoveryAttempts,
              queuedWrites: health.queuedWrites
            }
          },
          message: health.message,
          action: 'Check disk space and permissions. System will attempt auto-recovery.'
        };

        assert.strictEqual(response.status, 'degraded');
        assert.strictEqual(response.severity, 'warning');
        assert.strictEqual(response.details.dataLoss, false);
        assert.strictEqual(response.details.autoRecovery, true);
      }
    });
  });
});
