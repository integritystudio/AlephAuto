/**
 * Regression tests for PM2 ecosystem config (DP-H1, DP-M2)
 *
 * Verifies that:
 * - All 3 PM2 processes are registered (DP-H1)
 * - aleph-populate uses dashboard-populate-pipeline.ts with --cron (DP-H1)
 * - aleph-worker env does NOT contain DASHBOARD_CRON_SCHEDULE (DP-M2)
 * - aleph-populate env DOES contain DASHBOARD_CRON_SCHEDULE (DP-M2)
 *
 * DP-H2 (restart PM2) and DP-M1 (refresh Doppler secrets) are operational
 * actions verified at deploy time, not unit testable without a live PM2 daemon.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const ecosystemPath = path.join(PROJECT_ROOT, 'config', 'ecosystem.config.cjs');

interface PM2AppConfig {
  name: string;
  script: string;
  args?: string | string[];
  env?: Record<string, string | number | boolean>;
}

interface EcosystemConfig {
  apps: PM2AppConfig[];
}

const rawConfig: unknown = require(ecosystemPath);

if (
  typeof rawConfig !== 'object' ||
  rawConfig === null ||
  !Array.isArray((rawConfig as Record<string, unknown>).apps)
) {
  throw new Error(
    `ecosystem.config.cjs did not export { apps: [] }. Got: ${JSON.stringify(rawConfig)}`,
  );
}

const ecosystem = rawConfig as EcosystemConfig;

const findApp = (name: string): PM2AppConfig | undefined =>
  ecosystem.apps.find(a => a.name === name);

const getArgs = (app: PM2AppConfig): string =>
  Array.isArray(app.args) ? app.args.join(' ') : (app.args ?? '');

describe('PM2 Ecosystem Config', () => {
  describe('process registration (DP-H1)', () => {
    it('exports exactly 3 app processes', () => {
      const names = ecosystem.apps.map(a => a.name).join(', ');
      assert.strictEqual(ecosystem.apps.length, 3, `Expected 3 apps, got ${ecosystem.apps.length}: ${names}`);
    });

    it('registers aleph-dashboard', () => {
      assert.ok(findApp('aleph-dashboard'), 'aleph-dashboard must be registered');
    });

    it('registers aleph-worker', () => {
      assert.ok(findApp('aleph-worker'), 'aleph-worker must be registered');
    });

    it('registers aleph-populate (DP-H1)', () => {
      assert.ok(findApp('aleph-populate'), 'aleph-populate must be registered — was missing before DP-H1 fix');
    });
  });

  describe('aleph-populate process config (DP-H1)', () => {
    it('uses dashboard-populate-pipeline.ts as script', () => {
      const populate = findApp('aleph-populate');
      assert.ok(populate, 'aleph-populate must exist');
      assert.match(
        populate.script,
        /dashboard-populate-pipeline\.ts$/,
        `Expected dashboard-populate-pipeline.ts, got: ${populate.script}`,
      );
    });

    it('passes --cron flag to keep process alive', () => {
      const populate = findApp('aleph-populate');
      assert.ok(populate, 'aleph-populate must exist');
      const args = getArgs(populate);
      assert.ok(args.includes('--cron'), `Expected --cron in args, got: "${args}"`);
    });
  });

  describe('env var isolation (DP-M2)', () => {
    it('aleph-worker does NOT have DASHBOARD_CRON_SCHEDULE', () => {
      const worker = findApp('aleph-worker');
      assert.ok(worker, 'aleph-worker must exist');
      const env = worker.env ?? {};
      assert.ok(
        !('DASHBOARD_CRON_SCHEDULE' in env),
        'aleph-worker must not have DASHBOARD_CRON_SCHEDULE — orphaned var removed by DP-M2 fix',
      );
    });

    it('aleph-populate has DASHBOARD_CRON_SCHEDULE', () => {
      const populate = findApp('aleph-populate');
      assert.ok(populate, 'aleph-populate must exist');
      const env = populate.env ?? {};
      assert.ok(
        'DASHBOARD_CRON_SCHEDULE' in env,
        'aleph-populate must have DASHBOARD_CRON_SCHEDULE',
      );
    });
  });
});
