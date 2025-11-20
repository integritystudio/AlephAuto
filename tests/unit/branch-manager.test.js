import { test, describe } from 'node:test';
import assert from 'node:assert';
import { BranchManager } from '../../lib/git/branch-manager.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('BranchManager', () => {
  test('should initialize with default options', () => {
    const manager = new BranchManager();

    assert.strictEqual(manager.baseBranch, 'main');
    assert.strictEqual(manager.branchPrefix, 'automated');
    assert.strictEqual(manager.dryRun, false);
  });

  test('should initialize with custom options', () => {
    const manager = new BranchManager({
      baseBranch: 'develop',
      branchPrefix: 'feature',
      dryRun: true
    });

    assert.strictEqual(manager.baseBranch, 'develop');
    assert.strictEqual(manager.branchPrefix, 'feature');
    assert.strictEqual(manager.dryRun, true);
  });

  test('should generate branch name from job context', () => {
    const manager = new BranchManager({
      branchPrefix: 'automated'
    });

    const jobContext = {
      jobId: 'test-123',
      jobType: 'schema-enhancement',
      description: 'Fix README Schema'
    };

    const branchName = manager._generateBranchName(jobContext);

    assert.ok(branchName.startsWith('automated/schema-enhancement-fix-readme-schema-'));
    assert.ok(/\d+$/.test(branchName)); // Ends with timestamp
  });

  test('should generate branch name without description', () => {
    const manager = new BranchManager({
      branchPrefix: 'feature'
    });

    const jobContext = {
      jobId: 'test-456',
      jobType: 'duplicate-detection'
    };

    const branchName = manager._generateBranchName(jobContext);

    assert.ok(branchName.startsWith('feature/duplicate-detection-'));
    assert.ok(/\d+$/.test(branchName)); // Ends with timestamp
  });

  test('should generate commit message with job context', () => {
    const manager = new BranchManager();

    const commitContext = {
      message: 'feat: add new feature',
      description: 'This feature adds amazing functionality',
      jobId: 'job-789'
    };

    const changedFiles = ['README.md', 'package.json', 'src/index.js'];

    const commitMessage = manager._generateCommitMessage(commitContext, changedFiles);

    assert.ok(commitMessage.includes('feat: add new feature'));
    assert.ok(commitMessage.includes('This feature adds amazing functionality'));
    assert.ok(commitMessage.includes('Job ID: job-789'));
    assert.ok(commitMessage.includes('Files changed: 3'));
    assert.ok(commitMessage.includes('🤖 Generated with [Claude Code]'));
    assert.ok(commitMessage.includes('Co-Authored-By: Claude'));
  });

  test('should generate commit message without description', () => {
    const manager = new BranchManager();

    const commitContext = {
      message: 'fix: resolve bug',
      jobId: 'job-101'
    };

    const changedFiles = ['bug-fix.js'];

    const commitMessage = manager._generateCommitMessage(commitContext, changedFiles);

    assert.ok(commitMessage.includes('fix: resolve bug'));
    assert.ok(commitMessage.includes('Job ID: job-101'));
    assert.ok(commitMessage.includes('Files changed: 1'));
    assert.ok(!commitMessage.includes('undefined')); // No description line
  });

  test('should check if path is a git repository', async () => {
    const manager = new BranchManager();

    // Test with current jobs directory (should be a git repo)
    const isGitRepo = await manager.isGitRepository(process.cwd());

    // The jobs directory should be a git repository
    assert.strictEqual(isGitRepo, true);
  });

  test('should return false for non-git directory', async () => {
    const manager = new BranchManager();

    // Test with tmp directory (should NOT be a git repo)
    const tempDir = path.join(os.tmpdir(), 'not-a-git-repo-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const isGitRepo = await manager.isGitRepository(tempDir);
      assert.strictEqual(isGitRepo, false);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should handle dry run mode for PR creation', async () => {
    const manager = new BranchManager({
      dryRun: true
    });

    const prContext = {
      branchName: 'feature/test-branch',
      title: 'Test PR',
      body: 'This is a test PR',
      labels: ['test']
    };

    // In dry run mode, createPullRequest should return a dry-run string
    const result = await manager.createPullRequest('/fake/path', prContext);

    assert.strictEqual(result, 'dry-run-feature/test-branch');
  });

  test('should skip push in dry run mode', async () => {
    const manager = new BranchManager({
      dryRun: true
    });

    // In dry run mode, pushBranch should return false
    const result = await manager.pushBranch('/fake/path', 'test-branch');

    assert.strictEqual(result, false);
  });

  test('should generate sanitized branch name from description', () => {
    const manager = new BranchManager();

    const jobContext = {
      jobId: 'test-999',
      jobType: 'enhancement',
      description: 'Add New Feature!!! With Special Characters @#$%'
    };

    const branchName = manager._generateBranchName(jobContext);

    // Should sanitize special characters and limit length
    assert.ok(branchName.includes('enhancement-add-new-feature-with-special'));
    assert.ok(!branchName.includes('!!!'));
    assert.ok(!branchName.includes('@'));
    assert.ok(!branchName.includes('#'));
  });

  test('should truncate long descriptions in branch name', () => {
    const manager = new BranchManager();

    const longDescription = 'This is a very long description that should be truncated to fit the branch name length limit';

    const jobContext = {
      jobId: 'test-111',
      jobType: 'refactor',
      description: longDescription
    };

    const branchName = manager._generateBranchName(jobContext);

    // Description should be truncated to 30 characters
    const descriptionPart = branchName.split('/')[1].split('-').slice(1, -1).join('-');
    assert.ok(descriptionPart.length <= 35); // ~30 chars + hyphens
  });
});
