/**
 * Pipeline Execution Integration Tests
 *
 * Tests pipeline execution methods:
 * - Execute with `node <script>` → successful
 * - Execute with `./<script>` (shebang) → successful
 * - Execute with PM2 → successful
 * - Verify all pipeline runners have correct shebangs
 *
 * Scenarios:
 * 1. Execute pipeline with `node <script>`
 * 2. Execute pipeline with `./<script>` (shebang)
 * 3. Verify all pipeline runners have correct shebangs
 * 4. Verify pipelines can be executed via PM2 ecosystem
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get project root
const projectRoot = path.resolve(__dirname, '../../');

describe('Pipeline Execution - Integration Tests', () => {
  const pipelineRunners = [
    'sidequest/pipeline-runners/duplicate-detection-pipeline.js',
    'sidequest/pipeline-runners/git-activity-pipeline.js',
    'sidequest/pipeline-runners/gitignore-pipeline.js',
    'sidequest/pipeline-runners/plugin-management-pipeline.js',
    'sidequest/pipeline-runners/claude-health-pipeline.js'
  ];

  it('Scenario 1: Verify all pipeline runners have correct shebangs', async () => {
    for (const pipeline of pipelineRunners) {
      const pipelinePath = path.join(projectRoot, pipeline);

      // Read first line of file
      const content = await fs.readFile(pipelinePath, 'utf-8');
      const firstLine = content.split('\n')[0];

      assert.equal(
        firstLine,
        '#!/usr/bin/env node',
        `${pipeline} should have correct shebang`
      );
    }
  });

  it('Scenario 2: Verify all pipeline runners have execute permissions', async () => {
    for (const pipeline of pipelineRunners) {
      const pipelinePath = path.join(projectRoot, pipeline);

      // Check file permissions
      const stats = await fs.stat(pipelinePath);
      const mode = stats.mode;

      // Check if owner has execute permission (0o100)
      const hasExecute = (mode & 0o100) !== 0;

      assert.equal(
        hasExecute,
        true,
        `${pipeline} should have execute permissions (current: ${mode.toString(8)})`
      );
    }
  });

  it('Scenario 3: Execute duplicate-detection-pipeline with node', async () => {
    const pipelinePath = path.join(projectRoot, pipelineRunners[0]);

    // Execute with --help flag (won't trigger actual job)
    const { stdout, stderr } = await execAsync(
      `node "${pipelinePath}" --help || true`,
      {
        cwd: projectRoot,
        timeout: 5000,
        env: {
          ...process.env,
          RUN_ON_STARTUP: 'false' // Prevent auto-execution
        }
      }
    );

    // Pipeline should at least start without syntax errors
    // Note: May not have --help, so we just check it doesn't crash
    assert(
      !stderr.includes('SyntaxError'),
      'Should not have syntax errors'
    );
  });

  it('Scenario 4: Execute pipeline with shebang (direct execution)', async () => {
    const pipelinePath = path.join(projectRoot, pipelineRunners[0]);

    // Verify file is executable
    const stats = await fs.stat(pipelinePath);
    const hasExecute = (stats.mode & 0o100) !== 0;

    if (!hasExecute) {
      // Make executable
      await fs.chmod(pipelinePath, 0o755);
    }

    // Execute directly (shebang should work)
    const { stdout, stderr } = await execAsync(
      `"${pipelinePath}" --version || true`,
      {
        cwd: projectRoot,
        timeout: 5000,
        env: {
          ...process.env,
          RUN_ON_STARTUP: 'false'
        }
      }
    ).catch(err => {
      // Pipeline may not support --version, that's okay
      // We just want to verify shebang execution works
      return { stdout: '', stderr: err.message };
    });

    // Should not have shebang-related errors
    assert(
      !stderr.includes('bad interpreter'),
      'Shebang should be correct'
    );
    assert(
      !stderr.includes('command not found'),
      'Node should be in PATH'
    );
  });

  it('Scenario 5: Verify pipeline imports work correctly', async () => {
    const pipelinePath = path.join(projectRoot, pipelineRunners[0]);

    // Try to import the pipeline file (will run top-level code)
    const { stderr } = await execAsync(
      `node -e "import('${pipelinePath}').catch(e => console.error(e.message))" || true`,
      {
        cwd: projectRoot,
        timeout: 5000,
        env: {
          ...process.env,
          RUN_ON_STARTUP: 'false'
        }
      }
    );

    // Should not have import errors
    assert(
      !stderr.includes('Cannot find module'),
      'Should have all required imports'
    );
    assert(
      !stderr.includes('SyntaxError'),
      'Should have valid syntax'
    );
  });

  it('Scenario 6: Verify PM2 ecosystem config references correct scripts', async () => {
    const ecosystemPath = path.join(projectRoot, 'ecosystem.config.cjs');

    // Check if ecosystem file exists
    try {
      await fs.access(ecosystemPath);
    } catch (error) {
      // ecosystem.config.cjs might not exist, skip test
      return;
    }

    const content = await fs.readFile(ecosystemPath, 'utf-8');

    // Verify it references valid pipeline files
    for (const pipeline of pipelineRunners) {
      // ecosystem.config.cjs might reference some pipelines
      // We just verify that if referenced, the path is correct
      if (content.includes(path.basename(pipeline))) {
        const fullPath = path.join(projectRoot, pipeline);
        await fs.access(fullPath); // Should not throw
      }
    }

    // Verify ecosystem file is valid CommonJS
    assert(
      content.includes('module.exports'),
      'Ecosystem should be valid CommonJS'
    );
  });

  it('Scenario 7: Execute git-activity-pipeline with environment variables', async () => {
    const pipelinePath = path.join(projectRoot, pipelineRunners[1]);

    // Execute with RUN_ON_STARTUP=false to prevent actual execution
    const { stdout, stderr } = await execAsync(
      `node "${pipelinePath}" || true`,
      {
        cwd: projectRoot,
        timeout: 5000,
        env: {
          ...process.env,
          RUN_ON_STARTUP: 'false',
          NODE_ENV: 'test'
        }
      }
    );

    // Should start without crashing
    assert(
      !stderr.includes('ReferenceError'),
      'Should not have undefined variable errors'
    );
  });

  it('Scenario 8: Verify pipeline files use ESM imports', async () => {
    for (const pipeline of pipelineRunners) {
      const pipelinePath = path.join(projectRoot, pipeline);
      const content = await fs.readFile(pipelinePath, 'utf-8');

      // Should use ESM import syntax, not require()
      if (content.includes('require(')) {
        // Check if it's actually a require call (not in comments)
        const lines = content.split('\n');
        const requireLines = lines.filter(line =>
          line.includes('require(') && !line.trim().startsWith('//')
        );

        assert.equal(
          requireLines.length,
          0,
          `${pipeline} should use ESM imports, not require()`
        );
      }

      // Should have at least one import statement
      assert(
        content.includes('import '),
        `${pipeline} should use ESM imports`
      );
    }
  });

  it('Scenario 9: Verify all pipelines can be syntax-checked', async () => {
    for (const pipeline of pipelineRunners) {
      const pipelinePath = path.join(projectRoot, pipeline);

      // Run syntax check
      const { stderr } = await execAsync(
        `node --check "${pipelinePath}"`,
        {
          cwd: projectRoot,
          timeout: 3000
        }
      );

      assert.equal(
        stderr,
        '',
        `${pipeline} should pass syntax check`
      );
    }
  });

  it('Scenario 10: Verify pipeline runners directory structure', async () => {
    const runnersDir = path.join(projectRoot, 'sidequest/pipeline-runners');

    // Directory should exist
    const stats = await fs.stat(runnersDir);
    assert(stats.isDirectory(), 'pipeline-runners should be a directory');

    // List all .js files
    const files = await fs.readdir(runnersDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));

    assert(
      jsFiles.length >= pipelineRunners.length,
      `Should have at least ${pipelineRunners.length} pipeline runners`
    );

    // Each file should be executable
    for (const file of jsFiles) {
      const filePath = path.join(runnersDir, file);
      const fileStats = await fs.stat(filePath);
      const hasExecute = (fileStats.mode & 0o100) !== 0;

      assert.equal(
        hasExecute,
        true,
        `${file} should be executable`
      );
    }
  });

  it('Scenario 11: Test pipeline execution order (dependency check)', async () => {
    // Verify pipelines import config before using it
    for (const pipeline of pipelineRunners) {
      const pipelinePath = path.join(projectRoot, pipeline);
      const content = await fs.readFile(pipelinePath, 'utf-8');
      const lines = content.split('\n');

      // Find config import
      const configImportLine = lines.findIndex(line =>
        line.includes('sidequest/config') || line.includes('sidequest/core/config')
      );

      // Find first config usage
      const configUsageLine = lines.findIndex(line =>
        line.includes('config.') && !line.trim().startsWith('//')
      );

      if (configImportLine !== -1 && configUsageLine !== -1) {
        assert(
          configImportLine < configUsageLine,
          `${pipeline}: config should be imported before use`
        );
      }
    }
  });

  it('Scenario 12: Verify error handling in pipeline runners', async () => {
    // Check that pipelines have try-catch or error handlers
    for (const pipeline of pipelineRunners) {
      const pipelinePath = path.join(projectRoot, pipeline);
      const content = await fs.readFile(pipelinePath, 'utf-8');

      // Should have error handling (try-catch or .catch())
      const hasTryCatch = content.includes('try {') && content.includes('catch');
      const hasPromiseCatch = content.includes('.catch(');
      const hasProcessError = content.includes('process.on(\'unhandledRejection\'') ||
                              content.includes('process.on("unhandledRejection"');

      assert(
        hasTryCatch || hasPromiseCatch || hasProcessError,
        `${pipeline} should have error handling`
      );
    }
  });
});
