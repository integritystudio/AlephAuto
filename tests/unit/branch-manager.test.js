import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { BranchManager } from '../../sidequest/pipeline-core/git/branch-manager.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Create a real git repository for testing
 * @param {string} name - Repository name
 * @returns {Promise<{path: string, cleanup: () => Promise<void>}>}
 */
async function createRealGitRepo(name = 'test-repo') {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `branch-manager-${name}-`));

  // Initialize real git repo
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });

  // Create initial commit so we have a branch
  await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test Repo\n');
  execSync('git add .', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "Initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return {
    path: tmpDir,
    cleanup: async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  };
}

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

  test('should handle missing jobType in branch name generation', () => {
    const manager = new BranchManager();

    const jobContext = {
      jobId: 'test-222'
      // No jobType - should default to 'job'
    };

    const branchName = manager._generateBranchName(jobContext);

    assert.ok(branchName.startsWith('automated/job-'));
  });
});

describe('BranchManager - Git Operations', () => {
  /** @type {{path: string, cleanup: () => Promise<void>}} */
  let testRepo;

  before(async () => {
    testRepo = await createRealGitRepo('git-ops');
  });

  after(async () => {
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  test('should detect no changes in clean repository', async () => {
    const manager = new BranchManager();

    const hasChanges = await manager.hasChanges(testRepo.path);

    assert.strictEqual(hasChanges, false);
  });

  test('should detect changes after modifying a file', async () => {
    const manager = new BranchManager();

    // Modify a file
    await fs.writeFile(path.join(testRepo.path, 'README.md'), '# Updated Repo\n');

    const hasChanges = await manager.hasChanges(testRepo.path);

    assert.strictEqual(hasChanges, true);

    // Reset for other tests
    execSync('git checkout -- .', { cwd: testRepo.path, stdio: 'pipe' });
  });

  test('should get list of changed files', async () => {
    const manager = new BranchManager();

    // Create new files
    await fs.writeFile(path.join(testRepo.path, 'new-file.txt'), 'content\n');
    await fs.writeFile(path.join(testRepo.path, 'another-file.js'), 'export const x = 1;\n');

    const changedFiles = await manager.getChangedFiles(testRepo.path);

    assert.ok(Array.isArray(changedFiles));
    assert.ok(changedFiles.length >= 2);
    assert.ok(changedFiles.some(f => f.includes('new-file.txt')));
    assert.ok(changedFiles.some(f => f.includes('another-file.js')));

    // Cleanup
    await fs.unlink(path.join(testRepo.path, 'new-file.txt'));
    await fs.unlink(path.join(testRepo.path, 'another-file.js'));
  });

  test('should return empty array for clean repo getChangedFiles', async () => {
    const manager = new BranchManager();

    const changedFiles = await manager.getChangedFiles(testRepo.path);

    assert.ok(Array.isArray(changedFiles));
    assert.strictEqual(changedFiles.length, 0);
  });

  test('should get current branch name', async () => {
    const manager = new BranchManager();

    const branch = await manager.getCurrentBranch(testRepo.path);

    // Should be master or main depending on git default
    assert.ok(branch === 'master' || branch === 'main');
  });

  test('should return true for isGitRepository on valid repo', async () => {
    const manager = new BranchManager();

    const isRepo = await manager.isGitRepository(testRepo.path);

    assert.strictEqual(isRepo, true);
  });
});

describe('BranchManager - Commit Operations', () => {
  /** @type {{path: string, cleanup: () => Promise<void>}} */
  let testRepo;

  before(async () => {
    testRepo = await createRealGitRepo('commit-ops');
  });

  after(async () => {
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  test('should return empty string when no changes to commit', async () => {
    const manager = new BranchManager();

    const commitContext = {
      message: 'test commit',
      jobId: 'test-job-1'
    };

    const sha = await manager.commitChanges(testRepo.path, commitContext);

    assert.strictEqual(sha, '');
  });

  test('should commit changes and return SHA', async () => {
    const manager = new BranchManager();

    // Create a change
    await fs.writeFile(path.join(testRepo.path, 'commit-test.txt'), 'test content\n');

    const commitContext = {
      message: 'test: add commit test file',
      description: 'Testing commit functionality',
      jobId: 'test-job-commit'
    };

    const sha = await manager.commitChanges(testRepo.path, commitContext);

    assert.ok(sha.length > 0);
    assert.ok(/^[a-f0-9]+$/.test(sha)); // SHA is hex

    // Verify commit was made
    const log = execSync('git log -1 --oneline', { cwd: testRepo.path, encoding: 'utf-8' });
    assert.ok(log.includes('test: add commit test file'));
  });
});

describe('BranchManager - Branch Operations', () => {
  /** @type {{path: string, cleanup: () => Promise<void>}} */
  let testRepo;

  before(async () => {
    testRepo = await createRealGitRepo('branch-ops');
    // Create and push to a 'main' branch if we're on master
    const currentBranch = execSync('git branch --show-current', { cwd: testRepo.path, encoding: 'utf-8' }).trim();
    if (currentBranch === 'master') {
      execSync('git branch -M main', { cwd: testRepo.path, stdio: 'pipe' });
    }
  });

  after(async () => {
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  test('should create job branch successfully', async () => {
    const manager = new BranchManager({
      baseBranch: 'main',
      dryRun: true // Skip pull
    });

    const jobContext = {
      jobId: 'test-job-branch',
      jobType: 'test',
      description: 'Branch Creation Test'
    };

    const result = await manager.createJobBranch(testRepo.path, jobContext);

    assert.ok(result.branchName.startsWith('automated/test-branch-creation-test-'));
    assert.strictEqual(result.originalBranch, 'main');

    // Verify we're on the new branch
    const currentBranch = execSync('git branch --show-current', { cwd: testRepo.path, encoding: 'utf-8' }).trim();
    assert.strictEqual(currentBranch, result.branchName);

    // Cleanup - go back to main
    execSync('git checkout main', { cwd: testRepo.path, stdio: 'pipe' });
    execSync(`git branch -D ${result.branchName}`, { cwd: testRepo.path, stdio: 'pipe' });
  });

  test('should cleanup branch successfully', async () => {
    const manager = new BranchManager({
      baseBranch: 'main'
    });

    // Create a test branch
    const testBranchName = 'test-cleanup-branch';
    execSync(`git checkout -b ${testBranchName}`, { cwd: testRepo.path, stdio: 'pipe' });

    // Verify we're on test branch
    let currentBranch = execSync('git branch --show-current', { cwd: testRepo.path, encoding: 'utf-8' }).trim();
    assert.strictEqual(currentBranch, testBranchName);

    // Cleanup
    await manager.cleanupBranch(testRepo.path, testBranchName, 'main');

    // Should be back on main
    currentBranch = execSync('git branch --show-current', { cwd: testRepo.path, encoding: 'utf-8' }).trim();
    assert.strictEqual(currentBranch, 'main');

    // Branch should be deleted
    const branches = execSync('git branch', { cwd: testRepo.path, encoding: 'utf-8' });
    assert.ok(!branches.includes(testBranchName));
  });

  test('should handle cleanup with originalBranch fallback to baseBranch', async () => {
    const manager = new BranchManager({
      baseBranch: 'main'
    });

    // Create a test branch
    const testBranchName = 'test-cleanup-fallback';
    execSync(`git checkout -b ${testBranchName}`, { cwd: testRepo.path, stdio: 'pipe' });

    // Cleanup with empty originalBranch (should use baseBranch)
    await manager.cleanupBranch(testRepo.path, testBranchName, '');

    // Should be back on main
    const currentBranch = execSync('git branch --show-current', { cwd: testRepo.path, encoding: 'utf-8' }).trim();
    assert.strictEqual(currentBranch, 'main');
  });
});

describe('BranchManager - Error Handling', () => {
  test('should return false for hasChanges on invalid path', async () => {
    const manager = new BranchManager();

    const hasChanges = await manager.hasChanges('/nonexistent/path');

    assert.strictEqual(hasChanges, false);
  });

  test('should return empty array for getChangedFiles on invalid path', async () => {
    const manager = new BranchManager();

    const files = await manager.getChangedFiles('/nonexistent/path');

    assert.deepStrictEqual(files, []);
  });

  test('should return empty string for getCurrentBranch on invalid path', async () => {
    const manager = new BranchManager();

    const branch = await manager.getCurrentBranch('/nonexistent/path');

    assert.strictEqual(branch, '');
  });

  test('should return false for isGitRepository on invalid path', async () => {
    const manager = new BranchManager();

    const isRepo = await manager.isGitRepository('/nonexistent/path');

    assert.strictEqual(isRepo, false);
  });

  test('should return empty result for createJobBranch on non-git directory', async () => {
    const manager = new BranchManager();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'non-git-'));

    try {
      const result = await manager.createJobBranch(tmpDir, {
        jobId: 'test',
        jobType: 'test'
      });

      assert.deepStrictEqual(result, { branchName: '', originalBranch: '' });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('should handle cleanupBranch errors gracefully', async () => {
    const manager = new BranchManager();

    // Should not throw even with invalid inputs
    await manager.cleanupBranch('/nonexistent/path', 'fake-branch', 'main');

    // If we reach here, no error was thrown
    assert.ok(true);
  });

  test('should return false for pushBranch on invalid repo (non-dry-run)', async () => {
    const manager = new BranchManager({
      dryRun: false
    });

    const result = await manager.pushBranch('/nonexistent/path', 'fake-branch');

    assert.strictEqual(result, false);
  });

  test('should return null for createPullRequest on invalid repo', async () => {
    const manager = new BranchManager({
      dryRun: false
    });

    const prContext = {
      branchName: 'test-branch',
      title: 'Test PR',
      body: 'Test body'
    };

    const result = await manager.createPullRequest('/nonexistent/path', prContext);

    assert.strictEqual(result, null);
  });

  test('should handle PR creation with labels', async () => {
    const manager = new BranchManager({
      dryRun: true
    });

    const prContext = {
      branchName: 'test-branch',
      title: 'Test PR',
      body: 'Test body',
      labels: ['bug', 'enhancement']
    };

    const result = await manager.createPullRequest('/fake/path', prContext);

    // In dry run mode, should return dry-run string
    assert.strictEqual(result, 'dry-run-test-branch');
  });
});
