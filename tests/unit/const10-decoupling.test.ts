/**
 * CONST10 Regression Guard
 *
 * Verifies that test-local constants in integration tests are NOT
 * imported from production modules. Previously, these tests aliased
 * CONFIG_POLICY, RETRY, and TIMEOUTS values for coincidental numeric
 * matches, creating silent breakage risk if production values changed.
 *
 * This test reads both integration files and asserts that the
 * problematic imports no longer appear.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { CONFIG_POLICY, RETRY, TIMEOUTS } from '../../sidequest/core/constants.ts';

const INTEGRATION_DIR = path.join(import.meta.dirname, '..', 'integration');

const ERROR_RECOVERY_FILE = 'error-recovery.integration.test.ts';
const PORT_MANAGER_FILE = 'port-manager.integration.test.ts';

/** Previously aliased production constants that must NOT appear as import sources */
const BANNED_ALIASES = [
  // error-recovery aliases (CONST10)
  { pattern: 'CONFIG_POLICY.PORTS.MIN_PORT', file: ERROR_RECOVERY_FILE },
  { pattern: 'CONFIG_POLICY.DOPPLER.DEFAULT_SUCCESS_THRESHOLD', file: ERROR_RECOVERY_FILE },
  { pattern: 'RETRY.MAX_MANUAL_RETRIES', file: ERROR_RECOVERY_FILE },

  // port-manager aliases (CONST10)
  { pattern: 'CONFIG_POLICY.PORTS.MIN_PORT', file: PORT_MANAGER_FILE },
  { pattern: 'CONFIG_POLICY.DOPPLER.DEFAULT_SUCCESS_THRESHOLD', file: PORT_MANAGER_FILE },
  { pattern: 'CONFIG_POLICY.DOPPLER.DEFAULT_FAILURE_THRESHOLD', file: PORT_MANAGER_FILE },
  { pattern: 'CONFIG_POLICY.DOPPLER.MIN_BASE_DELAY_MS', file: PORT_MANAGER_FILE },
  { pattern: 'RETRY.MAX_ABSOLUTE_ATTEMPTS', file: PORT_MANAGER_FILE },
  { pattern: 'RETRY.MAX_MANUAL_RETRIES', file: PORT_MANAGER_FILE },
  { pattern: 'TIMEOUTS.TEN_SECONDS_MS', file: PORT_MANAGER_FILE },
] as const;

describe('CONST10 — test constant decoupling', () => {
  describe('banned production aliases do not appear', () => {
    for (const { pattern, file } of BANNED_ALIASES) {
      it(`${file} must not use ${pattern}`, async () => {
        const content = await fs.readFile(path.join(INTEGRATION_DIR, file), 'utf-8');
        assert.equal(
          content.includes(pattern),
          false,
          `Found banned alias "${pattern}" in ${file} — use a test-local literal instead`
        );
      });
    }
  });

  describe('imports are minimal', () => {
    it(`${ERROR_RECOVERY_FILE} does not import RETRY`, async () => {
      const content = await fs.readFile(
        path.join(INTEGRATION_DIR, ERROR_RECOVERY_FILE), 'utf-8'
      );
      const importLine = content.match(/import\s*\{[^}]*\}\s*from\s*['"].*constants\.ts['"]/);
      assert.ok(importLine, 'Should have a constants import');
      assert.equal(
        importLine[0].includes('RETRY'),
        false,
        'RETRY should not be imported — test constants must be independent'
      );
    });

    it(`${PORT_MANAGER_FILE} does not import RETRY or TIMEOUTS`, async () => {
      const content = await fs.readFile(
        path.join(INTEGRATION_DIR, PORT_MANAGER_FILE), 'utf-8'
      );
      const importLine = content.match(/import\s*\{[^}]*\}\s*from\s*['"].*constants\.ts['"]/);
      assert.ok(importLine, 'Should have a constants import');
      assert.equal(
        importLine[0].includes('RETRY'),
        false,
        'RETRY should not be imported'
      );
      assert.equal(
        importLine[0].includes('TIMEOUTS'),
        false,
        'TIMEOUTS should not be imported'
      );
    });
  });

  describe('test-local values match expected literals', () => {
    it('port step constants use small integer offsets', async () => {
      const content = await fs.readFile(
        path.join(INTEGRATION_DIR, PORT_MANAGER_FILE), 'utf-8'
      );
      assert.match(content, /PORT_STEP\s*=\s*1\b/);
      assert.match(content, /PORT_STEP_TWO\s*=\s*2\b/);
      assert.match(content, /PORT_STEP_THREE\s*=\s*3\b/);
      assert.match(content, /PORT_STEP_FOUR\s*=\s*4\b/);
    });

    it('fallback range sizes are test-local literals', async () => {
      const content = await fs.readFile(
        path.join(INTEGRATION_DIR, PORT_MANAGER_FILE), 'utf-8'
      );
      assert.match(content, /FALLBACK_SMALL_RANGE_SIZE\s*=\s*5\b/);
      assert.match(content, /FALLBACK_STANDARD_RANGE_SIZE\s*=\s*10\b/);
    });

    it('error-recovery uses independent broadcast and doppler failure counts', async () => {
      const content = await fs.readFile(
        path.join(INTEGRATION_DIR, ERROR_RECOVERY_FILE), 'utf-8'
      );
      assert.match(content, /BROADCAST_FAILURE_COUNT\s*=\s*2\b/);
      assert.match(content, /DOPPLER_FAILURE_COUNT\s*=\s*2\b/);
      assert.match(content, /RECENT_ACTIVITY_FETCH_LIMIT\s*=\s*10\b/);
    });
  });

  describe('production values have not drifted', () => {
    it('CONFIG_POLICY.PORTS.MIN_PORT is still 1', () => {
      assert.strictEqual(CONFIG_POLICY.PORTS.MIN_PORT, 1,
        'If MIN_PORT changed, integration test PORT_STEP values are unaffected (by design)');
    });

    it('CONFIG_POLICY.DOPPLER.DEFAULT_SUCCESS_THRESHOLD is still 2', () => {
      assert.strictEqual(CONFIG_POLICY.DOPPLER.DEFAULT_SUCCESS_THRESHOLD, 2,
        'If this changes, integration tests are unaffected (by design)');
    });

    it('CONFIG_POLICY.DOPPLER.DEFAULT_FAILURE_THRESHOLD is still 3', () => {
      assert.strictEqual(CONFIG_POLICY.DOPPLER.DEFAULT_FAILURE_THRESHOLD, 3,
        'If this changes, integration tests are unaffected (by design)');
    });

    it('RETRY.MAX_MANUAL_RETRIES is still 10', () => {
      assert.strictEqual(RETRY.MAX_MANUAL_RETRIES, 10,
        'If this changes, integration test range sizes are unaffected (by design)');
    });

    it('RETRY.MAX_ABSOLUTE_ATTEMPTS is still 5', () => {
      assert.strictEqual(RETRY.MAX_ABSOLUTE_ATTEMPTS, 5,
        'If this changes, integration test FALLBACK_SMALL_RANGE_SIZE is unaffected (by design)');
    });

    it('TIMEOUTS.TEN_SECONDS_MS is still 10000', () => {
      assert.strictEqual(TIMEOUTS.TEN_SECONDS_MS, 10_000,
        'If this changes, integration test CUSTOM_SHUTDOWN_TIMEOUT_MS is unaffected (by design)');
    });
  });
});
