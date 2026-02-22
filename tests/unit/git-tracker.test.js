#!/usr/bin/env node
/**
 * Git Commit Tracker Tests
 *
 * Tests for Git commit tracking functionality.
 */

// @ts-nocheck
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { GitCommitTracker } from '../../sidequest/pipeline-core/cache/git-tracker.ts';

describe('GitCommitTracker', () => {
  let tracker;
  let tempDir;
  let gitRepoDir;

  beforeEach(async () => {
    tracker = new GitCommitTracker();
    tempDir = path.join(os.tmpdir(), 'test-git-tracker-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    // Create a test git repository
    gitRepoDir = path.join(tempDir, 'test-repo');
    await fs.mkdir(gitRepoDir);

    // Initialize git repo
    execSync('git init', { cwd: gitRepoDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: gitRepoDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: gitRepoDir, stdio: 'pipe' });

    // Create initial commit
    await fs.writeFile(path.join(gitRepoDir, 'test.txt'), 'initial content');
    execSync('git add .', { cwd: gitRepoDir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: gitRepoDir, stdio: 'pipe' });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('getRepositoryCommit', () => {
    it('should return commit hash for git repository', async () => {
      const commit = await tracker.getRepositoryCommit(gitRepoDir);
      assert.ok(commit);
      assert.strictEqual(commit.length, 40); // Full SHA-1 hash
      assert.ok(/^[0-9a-f]+$/.test(commit));
    });

    it('should return null for non-git directory', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const commit = await tracker.getRepositoryCommit(nonGitDir);
      assert.strictEqual(commit, null);
    });

    it('should return null for non-existent directory', async () => {
      const commit = await tracker.getRepositoryCommit('/non/existent/path');
      assert.strictEqual(commit, null);
    });
  });

  describe('getShortCommit', () => {
    it('should return short commit hash', async () => {
      const shortCommit = await tracker.getShortCommit(gitRepoDir);
      assert.ok(shortCommit);
      assert.ok(shortCommit.length <= 12);
      assert.ok(/^[0-9a-f]+$/.test(shortCommit));
    });

    it('should return null for non-git directory', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const shortCommit = await tracker.getShortCommit(nonGitDir);
      assert.strictEqual(shortCommit, null);
    });
  });

  describe('hasChanged', () => {
    it('should return true when no lastCommit provided', async () => {
      const hasChanged = await tracker.hasChanged(gitRepoDir, null);
      assert.strictEqual(hasChanged, true);
    });

    it('should return true when commits differ', async () => {
      const originalCommit = await tracker.getRepositoryCommit(gitRepoDir);

      // Make a new commit
      await fs.writeFile(path.join(gitRepoDir, 'test2.txt'), 'new content');
      execSync('git add .', { cwd: gitRepoDir, stdio: 'pipe' });
      execSync('git commit -m "Second commit"', { cwd: gitRepoDir, stdio: 'pipe' });

      const hasChanged = await tracker.hasChanged(gitRepoDir, originalCommit);
      assert.strictEqual(hasChanged, true);
    });

    it('should return false when commits match', async () => {
      const currentCommit = await tracker.getRepositoryCommit(gitRepoDir);
      const hasChanged = await tracker.hasChanged(gitRepoDir, currentCommit);
      assert.strictEqual(hasChanged, false);
    });

    it('should return true for non-git repository', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const hasChanged = await tracker.hasChanged(nonGitDir, 'abc123');
      assert.strictEqual(hasChanged, true);
    });
  });

  describe('getChangedFiles', () => {
    it('should return empty array when commits are same', async () => {
      const currentCommit = await tracker.getRepositoryCommit(gitRepoDir);
      const changedFiles = await tracker.getChangedFiles(gitRepoDir, currentCommit);
      assert.deepStrictEqual(changedFiles, []);
    });

    it('should return changed files between commits', async () => {
      const firstCommit = await tracker.getRepositoryCommit(gitRepoDir);

      // Add new file and commit
      await fs.writeFile(path.join(gitRepoDir, 'newfile.txt'), 'new content');
      execSync('git add .', { cwd: gitRepoDir, stdio: 'pipe' });
      execSync('git commit -m "Add newfile"', { cwd: gitRepoDir, stdio: 'pipe' });

      const changedFiles = await tracker.getChangedFiles(gitRepoDir, firstCommit);
      assert.ok(changedFiles.includes('newfile.txt'));
    });

    it('should return empty array when no fromCommit', async () => {
      const changedFiles = await tracker.getChangedFiles(gitRepoDir, null);
      assert.deepStrictEqual(changedFiles, []);
    });

    it('should return empty array for non-git repo', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const changedFiles = await tracker.getChangedFiles(nonGitDir, 'abc123');
      assert.deepStrictEqual(changedFiles, []);
    });
  });

  describe('getCommitMetadata', () => {
    it('should return metadata for HEAD commit', async () => {
      const metadata = await tracker.getCommitMetadata(gitRepoDir);
      assert.ok(metadata);
      assert.ok(metadata.hash);
      assert.ok(metadata.shortHash);
      assert.strictEqual(metadata.author, 'Test User');
      assert.strictEqual(metadata.email, 'test@test.com');
      assert.ok(metadata.date);
      assert.ok(metadata.message);
    });

    it('should return metadata for specific commit', async () => {
      const commit = await tracker.getRepositoryCommit(gitRepoDir);
      const metadata = await tracker.getCommitMetadata(gitRepoDir, commit);
      assert.ok(metadata);
      assert.strictEqual(metadata.hash, commit);
    });

    it('should return null for invalid commit', async () => {
      const metadata = await tracker.getCommitMetadata(gitRepoDir, 'invalid-hash');
      assert.strictEqual(metadata, null);
    });

    it('should return null for non-git repo', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const metadata = await tracker.getCommitMetadata(nonGitDir);
      assert.strictEqual(metadata, null);
    });
  });

  describe('getBranchName', () => {
    it('should return branch name', async () => {
      const branch = await tracker.getBranchName(gitRepoDir);
      assert.ok(branch);
      // Default branch could be 'main' or 'master' depending on git config
      assert.ok(branch === 'main' || branch === 'master');
    });

    it('should return null for non-git directory', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const branch = await tracker.getBranchName(nonGitDir);
      assert.strictEqual(branch, null);
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return false when no uncommitted changes', async () => {
      const hasChanges = await tracker.hasUncommittedChanges(gitRepoDir);
      assert.strictEqual(hasChanges, false);
    });

    it('should return true when has uncommitted changes', async () => {
      // Create uncommitted change
      await fs.writeFile(path.join(gitRepoDir, 'uncommitted.txt'), 'uncommitted');

      const hasChanges = await tracker.hasUncommittedChanges(gitRepoDir);
      assert.strictEqual(hasChanges, true);
    });

    it('should return false for non-git directory', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const hasChanges = await tracker.hasUncommittedChanges(nonGitDir);
      assert.strictEqual(hasChanges, false);
    });
  });

  describe('getRemoteUrl', () => {
    it('should return null when no remote configured', async () => {
      const remoteUrl = await tracker.getRemoteUrl(gitRepoDir);
      assert.strictEqual(remoteUrl, null);
    });

    it('should return remote URL when configured', async () => {
      // Add a remote
      execSync('git remote add origin https://github.com/test/repo.git', {
        cwd: gitRepoDir,
        stdio: 'pipe'
      });

      const remoteUrl = await tracker.getRemoteUrl(gitRepoDir);
      assert.strictEqual(remoteUrl, 'https://github.com/test/repo.git');
    });

    it('should return null for non-existent remote', async () => {
      const remoteUrl = await tracker.getRemoteUrl(gitRepoDir, 'nonexistent');
      assert.strictEqual(remoteUrl, null);
    });
  });

  describe('getCommitCount', () => {
    it('should return commit count', async () => {
      const count = await tracker.getCommitCount(gitRepoDir);
      assert.strictEqual(count, 1); // Just the initial commit
    });

    it('should return correct count after more commits', async () => {
      // Add more commits
      await fs.writeFile(path.join(gitRepoDir, 'file2.txt'), 'content 2');
      execSync('git add .', { cwd: gitRepoDir, stdio: 'pipe' });
      execSync('git commit -m "Second commit"', { cwd: gitRepoDir, stdio: 'pipe' });

      await fs.writeFile(path.join(gitRepoDir, 'file3.txt'), 'content 3');
      execSync('git add .', { cwd: gitRepoDir, stdio: 'pipe' });
      execSync('git commit -m "Third commit"', { cwd: gitRepoDir, stdio: 'pipe' });

      const count = await tracker.getCommitCount(gitRepoDir);
      assert.strictEqual(count, 3);
    });

    it('should return 0 for non-git directory', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const count = await tracker.getCommitCount(nonGitDir);
      assert.strictEqual(count, 0);
    });
  });

  describe('isGitRepository', () => {
    it('should return true for git repository', async () => {
      const isGit = await tracker.isGitRepository(gitRepoDir);
      assert.strictEqual(isGit, true);
    });

    it('should return false for non-git directory', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const isGit = await tracker.isGitRepository(nonGitDir);
      assert.strictEqual(isGit, false);
    });

    it('should return false for non-existent path', async () => {
      const isGit = await tracker.isGitRepository('/non/existent/path');
      assert.strictEqual(isGit, false);
    });
  });

  describe('getRepositoryStatus', () => {
    it('should return complete repository status', async () => {
      const status = await tracker.getRepositoryStatus(gitRepoDir);

      assert.strictEqual(status.is_git_repository, true);
      assert.ok(status.current_commit);
      assert.ok(status.short_commit);
      assert.ok(status.branch);
      assert.strictEqual(typeof status.has_uncommitted_changes, 'boolean');
      assert.ok(status.scanned_at);
    });

    it('should handle non-git directory', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const status = await tracker.getRepositoryStatus(nonGitDir);
      assert.strictEqual(status.is_git_repository, false);
    });
  });

  describe('getCommitHistory', () => {
    it('should return commit history', async () => {
      const history = await tracker.getCommitHistory(gitRepoDir, 10);

      assert.ok(Array.isArray(history));
      assert.strictEqual(history.length, 1);
      assert.ok(history[0].hash);
      assert.ok(history[0].shortHash);
      assert.ok(history[0].author);
      assert.ok(history[0].email);
      assert.ok(history[0].date);
      assert.ok(history[0].message);
    });

    it('should limit history to specified count', async () => {
      // Add more commits
      for (let i = 2; i <= 5; i++) {
        await fs.writeFile(path.join(gitRepoDir, `file${i}.txt`), `content ${i}`);
        execSync('git add .', { cwd: gitRepoDir, stdio: 'pipe' });
        execSync(`git commit -m "Commit ${i}"`, { cwd: gitRepoDir, stdio: 'pipe' });
      }

      const history = await tracker.getCommitHistory(gitRepoDir, 3);
      assert.strictEqual(history.length, 3);
    });

    it('should return empty array for non-git repo', async () => {
      const nonGitDir = path.join(tempDir, 'non-git');
      await fs.mkdir(nonGitDir);

      const history = await tracker.getCommitHistory(nonGitDir);
      assert.deepStrictEqual(history, []);
    });
  });
});
