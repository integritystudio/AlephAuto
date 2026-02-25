// @ts-nocheck
/**
 * Deployment Workflow Integration Tests
 *
 * Validates .github/workflows/deploy.yml configuration for production deployment.
 *
 * Tests:
 * - Workflow file structure and validity
 * - Critical deployment steps presence
 * - PM2 process naming consistency with config/ecosystem.config.cjs
 * - Doppler integration
 * - Health check configuration
 * - Rollback capability
 *
 * Run: node tests/integration/test-deployment-workflow.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

// Load js-yaml using createRequire for CommonJS module
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const WORKFLOW_PATH = join(process.cwd(), '.github/workflows/deploy.yml');
const ECOSYSTEM_PATH = join(process.cwd(), 'config', 'ecosystem.config.cjs');

describe('Deployment Workflow Tests', () => {
  let workflowConfig;
  let ecosystemConfig;

  beforeEach(() => {
    // Load workflow YAML
    const workflowContent = readFileSync(WORKFLOW_PATH, 'utf8');
    workflowConfig = yaml.load(workflowContent);

    // Load ecosystem config safely using createRequire (no eval!)
    // Clear require cache to ensure fresh load
    const ecosystemRequire = createRequire(import.meta.url);
    delete ecosystemRequire.cache[ecosystemRequire.resolve(ECOSYSTEM_PATH)];
    ecosystemConfig = ecosystemRequire(ECOSYSTEM_PATH);
  });

  describe('1. Workflow File Structure', () => {
    it('should exist and be valid YAML', () => {
      assert.ok(existsSync(WORKFLOW_PATH), 'Workflow file should exist');
      assert.ok(workflowConfig, 'Workflow should be valid YAML');
    });

    it('should have correct name', () => {
      assert.strictEqual(
        workflowConfig.name,
        'CD - Production Deployment',
        'Workflow should have correct name'
      );
    });

    it('should trigger on manual dispatch (push trigger commented out for safety)', () => {
      // Note: push trigger is intentionally commented out until secrets are configured
      // Only workflow_dispatch is active for controlled deployments
      assert.ok(
        'workflow_dispatch' in workflowConfig.on,
        'Should allow manual trigger (workflow_dispatch key present)'
      );
    });

    it('should use production environment', () => {
      const deployJob = workflowConfig.jobs.deploy;
      assert.strictEqual(
        deployJob.environment,
        'production',
        'Should use production environment'
      );
    });
  });

  describe('2. Critical Deployment Steps', () => {
    let deploySteps;

    beforeEach(() => {
      deploySteps = workflowConfig.jobs.deploy.steps;
    });

    it('should checkout code', () => {
      const checkoutStep = deploySteps.find(s => s.name === 'Checkout code');
      assert.ok(checkoutStep, 'Should have checkout step');
      assert.strictEqual(
        checkoutStep.uses,
        'actions/checkout@v4',
        'Should use checkout@v4'
      );
    });

    it('should set up Node.js 20.x', () => {
      const nodeStep = deploySteps.find(s => s.name === 'Set up Node.js');
      assert.ok(nodeStep, 'Should have Node.js setup step');
      assert.strictEqual(
        nodeStep.with['node-version'],
        '20.x',
        'Should use Node.js 20.x'
      );
      assert.strictEqual(
        nodeStep.with.cache,
        'pnpm',
        'Should cache pnpm dependencies'
      );
    });

    it('should set up Python 3.11', () => {
      const pythonStep = deploySteps.find(s => s.name === 'Set up Python');
      assert.ok(pythonStep, 'Should have Python setup step');
      assert.strictEqual(
        pythonStep.with['python-version'],
        '3.11',
        'Should use Python 3.11'
      );
      assert.strictEqual(
        pythonStep.with.cache,
        'pip',
        'Should cache pip dependencies'
      );
    });

    it('should install Doppler CLI', () => {
      const dopplerStep = deploySteps.find(s => s.name === 'Install Doppler CLI');
      assert.ok(dopplerStep, 'Should have Doppler installation step');
      assert.ok(
        dopplerStep.run.includes('doppler-cli'),
        'Should install Doppler CLI from official repo'
      );
    });

    it('should install PM2 globally', () => {
      const pm2Step = deploySteps.find(s => s.name === 'Install PM2 globally');
      assert.ok(pm2Step, 'Should have PM2 installation step');
      assert.strictEqual(
        pm2Step.run,
        'pnpm add -g pm2',
        'Should install PM2 globally with pnpm'
      );
    });

    it('should validate deployment files', () => {
      const validateStep = deploySteps.find(s => s.name === 'Validate deployment files');
      assert.ok(validateStep, 'Should have validation step');

      const validationScript = validateStep.run;
      assert.ok(
        validationScript.includes('test -f api/server.js'),
        'Should validate API server exists'
      );
      assert.ok(
        validationScript.includes('test -d public'),
        'Should validate public directory exists'
      );
      assert.ok(
        validationScript.includes('test -f public/index.html'),
        'Should validate dashboard HTML exists'
      );
      assert.ok(
        validationScript.includes('test -f public/dashboard.css'),
        'Should validate dashboard CSS exists'
      );
      assert.ok(
        validationScript.includes('test -f public/dashboard.js'),
        'Should validate dashboard JS exists'
      );
    });

    it('should configure Doppler', () => {
      const dopplerConfigStep = deploySteps.find(s => s.name === 'Configure Doppler');
      assert.ok(dopplerConfigStep, 'Should have Doppler configuration step');
      assert.ok(
        dopplerConfigStep.run.includes('doppler configure set token'),
        'Should configure Doppler token'
      );
      assert.ok(
        dopplerConfigStep.env?.DOPPLER_TOKEN,
        'Should use DOPPLER_TOKEN secret'
      );
    });

    it('should deploy with rsync', () => {
      const rsyncStep = deploySteps.find(s => s.name === 'Deploy with rsync');
      assert.ok(rsyncStep, 'Should have rsync deployment step');
      assert.strictEqual(
        rsyncStep.uses,
        'burnett01/rsync-deployments@6.0.0',
        'Should use rsync-deployments action'
      );

      const switches = rsyncStep.with.switches;
      assert.ok(
        switches.includes('--delete'),
        'Should use --delete flag to remove old files'
      );
      assert.ok(
        switches.includes("--exclude='.git*'"),
        'Should exclude .git files'
      );
      assert.ok(
        switches.includes("--exclude='node_modules'"),
        'Should exclude node_modules'
      );
      assert.ok(
        switches.includes("--exclude='tests'"),
        'Should exclude tests'
      );
    });

    it('should perform health check', () => {
      const healthStep = deploySteps.find(s => s.name === 'Health check');
      assert.ok(healthStep, 'Should have health check step');

      // Health check uses SSH action with script in 'with' block
      const healthScript = healthStep.with?.script || '';
      assert.ok(
        healthScript.includes('/health'),
        'Should check /health endpoint'
      );
      assert.ok(
        healthScript.includes('curl'),
        'Should use curl for health check'
      );
      assert.ok(
        healthScript.includes('200'),
        'Should validate HTTP 200 response'
      );
    });

    it('should have rollback on failure', () => {
      const rollbackStep = deploySteps.find(s => s.name === 'Rollback on failure');
      assert.ok(rollbackStep, 'Should have rollback step');
      assert.strictEqual(
        rollbackStep.if,
        'failure()',
        'Rollback should only run on failure'
      );
      // Check for 'with' object containing 'script' field (SSH action structure)
      const scriptContent = rollbackStep.with?.script || rollbackStep.script || '';
      assert.ok(
        scriptContent.includes('pm2 resurrect'),
        'Should use pm2 resurrect for rollback'
      );
    });
  });

  describe('3. PM2 Process Names Consistency', () => {
    let restartScript;

    beforeEach(() => {
      const restartStep = workflowConfig.jobs.deploy.steps.find(
        s => s.name === 'Restart services with PM2'
      );
      restartScript = restartStep?.with?.script || restartStep?.script || '';
    });

    it('should use aleph-dashboard process name', () => {
      assert.ok(
        restartScript.includes('aleph-dashboard'),
        'Workflow should reference aleph-dashboard'
      );

      // Verify ecosystem config has matching name
      const dashboardApp = ecosystemConfig.apps.find(app => app.name === 'aleph-dashboard');
      assert.ok(dashboardApp, 'Ecosystem config should have aleph-dashboard');
    });

    it('should use aleph-worker process name', () => {
      assert.ok(
        restartScript.includes('aleph-worker'),
        'Workflow should reference aleph-worker'
      );

      // Verify ecosystem config has matching name
      const workerApp = ecosystemConfig.apps.find(app => app.name === 'aleph-worker');
      assert.ok(workerApp, 'Ecosystem config should have aleph-worker');
    });

    it('should start worker using config/ecosystem.config.cjs', () => {
      assert.ok(
        restartScript.includes('pm2 start config/ecosystem.config.cjs'),
        'Should use config/ecosystem.config.cjs to start worker'
      );
    });

    it('should save PM2 configuration', () => {
      assert.ok(
        restartScript.includes('pm2 save'),
        'Should save PM2 configuration'
      );
    });
  });

  describe('4. Doppler Integration', () => {
    let installScript;
    let restartScript;

    beforeEach(() => {
      const installStep = workflowConfig.jobs.deploy.steps.find(
        s => s.name === 'Install dependencies on server'
      );
      const restartStep = workflowConfig.jobs.deploy.steps.find(
        s => s.name === 'Restart services with PM2'
      );
      installScript = installStep?.with?.script || installStep?.script || '';
      restartScript = restartStep?.with?.script || restartStep?.script || '';
    });

    it('should use Doppler for environment variables', () => {
      assert.ok(
        restartScript.includes('doppler run'),
        'Should use doppler run for PM2 commands'
      );
    });

    it('should use doppler run command for PM2 operations', () => {
      // Workflow uses 'doppler run -c prd --' prefix for PM2 commands
      assert.ok(
        restartScript.includes('doppler run -c prd --'),
        'Should use doppler run with prd config for PM2 commands'
      );
    });

    it('ecosystem config should use node interpreter (Doppler via doppler run wrapper)', () => {
      // PM2 apps use node interpreter directly; Doppler env vars are
      // injected via 'doppler run -- pm2 start' wrapper in deploy workflow
      ecosystemConfig.apps.forEach(app => {
        assert.strictEqual(
          app.interpreter,
          'node',
          `${app.name} should use node interpreter`
        );
      });
    });
  });

  describe('5. Health Check Configuration', () => {
    let healthScript;

    beforeEach(() => {
      const healthStep = workflowConfig.jobs.deploy.steps.find(
        s => s.name === 'Health check'
      );
      // Health check uses SSH action with script in 'with' block
      healthScript = healthStep?.with?.script || '';
    });

    it('should check port 8080', () => {
      assert.ok(
        healthScript.includes(':8080'),
        'Health check should use port 8080'
      );
    });

    it('should use /health endpoint', () => {
      assert.ok(
        healthScript.includes('/health'),
        'Should check /health endpoint'
      );
    });

    it('should wait for services to start', () => {
      assert.ok(
        healthScript.includes('sleep'),
        'Should wait for services to start'
      );
    });

    it('should fail on non-200 response', () => {
      assert.ok(
        healthScript.includes('exit 1'),
        'Should exit with error code on health check failure'
      );
    });
  });

  describe('6. Deployment Environment Consistency', () => {
    it('should use production environment in PM2 config', () => {
      ecosystemConfig.apps.forEach(app => {
        assert.strictEqual(
          app.env.NODE_ENV,
          'production',
          `${app.name} should use production NODE_ENV`
        );
      });
    });

    it('should have proper restart settings', () => {
      // Dashboard has autorestart enabled; worker has it disabled for debugging
      const dashboardApp = ecosystemConfig.apps.find(app => app.name === 'aleph-dashboard');
      assert.ok(
        dashboardApp.autorestart === true,
        'Dashboard should have autorestart enabled'
      );
      assert.ok(
        dashboardApp.max_restarts > 0,
        'Dashboard should have max_restarts configured'
      );
    });

    it('dashboard should use fork mode (single instance to prevent port conflicts)', () => {
      const dashboardApp = ecosystemConfig.apps.find(app => app.name === 'aleph-dashboard');
      assert.strictEqual(
        dashboardApp.exec_mode,
        'fork',
        'Dashboard should use fork mode to prevent EADDRINUSE'
      );
      assert.strictEqual(
        dashboardApp.instances,
        1,
        'Dashboard should have single instance'
      );
    });

    it('worker should use fork mode', () => {
      const workerApp = ecosystemConfig.apps.find(app => app.name === 'aleph-worker');
      assert.strictEqual(
        workerApp.exec_mode,
        'fork',
        'Worker should use fork mode'
      );
      assert.strictEqual(
        workerApp.instances,
        1,
        'Worker should have single instance'
      );
    });

    it('worker should have cron restart', () => {
      const workerApp = ecosystemConfig.apps.find(app => app.name === 'aleph-worker');
      assert.ok(
        workerApp.cron_restart,
        'Worker should have cron_restart configured'
      );
      assert.strictEqual(
        workerApp.cron_restart,
        '0 2 * * *',
        'Worker should restart at 2 AM daily'
      );
    });
  });

  describe('7. Security & Best Practices', () => {
    it('should use production mode in pnpm install', () => {
      const installStep = workflowConfig.jobs.deploy.steps.find(
        s => s.name === 'Install Node.js dependencies'
      );
      assert.ok(
        installStep.run.includes('--prod'),
        'Should use --prod flag for pnpm install'
      );
      assert.ok(
        installStep.run.includes('--frozen-lockfile'),
        'Should use --frozen-lockfile for reproducible builds'
      );
    });

    it('should use secrets for sensitive data', () => {
      const steps = workflowConfig.jobs.deploy.steps;

      // Check rsync uses secrets
      const rsyncStep = steps.find(s => s.name === 'Deploy with rsync');
      assert.ok(
        rsyncStep.with.remote_host?.includes('secrets.'),
        'Should use secret for remote host'
      );
      assert.ok(
        rsyncStep.with.remote_user?.includes('secrets.'),
        'Should use secret for remote user'
      );
      assert.ok(
        rsyncStep.with.remote_key?.includes('secrets.'),
        'Should use secret for SSH key'
      );

      // Check Doppler uses secret
      const dopplerStep = steps.find(s => s.name === 'Configure Doppler');
      assert.ok(
        dopplerStep.env?.DOPPLER_TOKEN?.includes('secrets.'),
        'Should use secret for Doppler token'
      );
    });

    it('should have proper log file configuration', () => {
      ecosystemConfig.apps.forEach(app => {
        assert.ok(app.error_file, `${app.name} should have error log file`);
        assert.ok(app.out_file, `${app.name} should have output log file`);
        assert.ok(
          app.error_file.includes('logs/'),
          `${app.name} error logs should be in logs/ directory`
        );
        assert.ok(
          app.out_file.includes('logs/'),
          `${app.name} output logs should be in logs/ directory`
        );
      });
    });
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 Running Deployment Workflow Integration Tests...\n');
}
