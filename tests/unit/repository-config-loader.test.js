/**
 * Repository Config Loader Unit Tests
 *
 * Tests for the repository scanning configuration loader.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { RepositoryConfigLoader } from '../../sidequest/pipeline-core/config/repository-config-loader.js';

describe('RepositoryConfigLoader', () => {
  let tempDir;
  let configPath;

  const createTestConfig = (config) => {
    return JSON.stringify({
      scanConfig: {
        maxRepositoriesPerNight: 5,
        scanStartTime: '02:00',
        scanEndTime: '06:00'
      },
      scanDefaults: {
        timeout: 300,
        retries: 3
      },
      notifications: {
        email: 'test@example.com',
        slack: '#scans'
      },
      repositories: config.repositories || [],
      repositoryGroups: config.repositoryGroups || []
    }, null, 2);
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-loader-test-'));
    configPath = path.join(tempDir, 'scan-repositories.json');
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should initialize with default config path', () => {
      const loader = new RepositoryConfigLoader();
      assert.ok(loader.configPath.includes('scan-repositories.json'));
      assert.strictEqual(loader.config, null);
      assert.strictEqual(loader.lastLoaded, null);
    });

    it('should accept custom config path', () => {
      const loader = new RepositoryConfigLoader('/custom/path.json');
      assert.strictEqual(loader.configPath, '/custom/path.json');
    });
  });

  describe('load', () => {
    it('should load configuration from file', async () => {
      const config = createTestConfig({
        repositories: [
          { name: 'repo1', path: '/path/to/repo1', enabled: true }
        ]
      });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      const loaded = await loader.load();

      assert.ok(loaded);
      assert.strictEqual(loaded.repositories.length, 1);
      assert.ok(loader.lastLoaded instanceof Date);
    });

    it('should throw error for non-existent file', async () => {
      const loader = new RepositoryConfigLoader('/non/existent/path.json');

      await assert.rejects(
        () => loader.load(),
        (err) => {
          assert.ok(err.message.includes('Failed to load configuration'));
          return true;
        }
      );
    });

    it('should throw error for invalid JSON', async () => {
      await fs.writeFile(configPath, 'not valid json');
      const loader = new RepositoryConfigLoader(configPath);

      await assert.rejects(
        () => loader.load(),
        (err) => {
          assert.ok(err.message.includes('Failed to load configuration'));
          return true;
        }
      );
    });

    it('should expand home directory paths', async () => {
      const config = createTestConfig({
        repositories: [
          { name: 'repo1', path: '~/code/repo1', enabled: true }
        ]
      });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      const repos = loader.getAllRepositories();
      assert.ok(!repos[0].path.includes('~'));
      assert.ok(repos[0].path.includes(os.homedir()));
    });
  });

  describe('reload', () => {
    it('should reload configuration', async () => {
      const config1 = createTestConfig({
        repositories: [{ name: 'repo1', path: '/path1', enabled: true }]
      });
      await fs.writeFile(configPath, config1);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      // Update config file
      const config2 = createTestConfig({
        repositories: [
          { name: 'repo1', path: '/path1', enabled: true },
          { name: 'repo2', path: '/path2', enabled: true }
        ]
      });
      await fs.writeFile(configPath, config2);

      await loader.reload();

      assert.strictEqual(loader.getAllRepositories().length, 2);
    });
  });

  describe('Repository queries', () => {
    let loader;

    beforeEach(async () => {
      const config = createTestConfig({
        repositories: [
          { name: 'critical-repo', path: '/path/critical', enabled: true, priority: 'critical', scanFrequency: 'daily', tags: ['core'] },
          { name: 'high-repo', path: '/path/high', enabled: true, priority: 'high', scanFrequency: 'weekly', tags: ['api', 'core'] },
          { name: 'disabled-repo', path: '/path/disabled', enabled: false, priority: 'medium', scanFrequency: 'daily', tags: ['archive'] },
          { name: 'low-repo', path: '/path/low', enabled: true, priority: 'low', scanFrequency: 'monthly', tags: ['docs'] }
        ],
        repositoryGroups: [
          { name: 'core', enabled: true, repositories: ['critical-repo', 'high-repo'] },
          { name: 'disabled-group', enabled: false, repositories: ['disabled-repo'] }
        ]
      });
      await fs.writeFile(configPath, config);

      loader = new RepositoryConfigLoader(configPath);
      await loader.load();
    });

    describe('getAllRepositories', () => {
      it('should return all repositories', () => {
        const repos = loader.getAllRepositories();
        assert.strictEqual(repos.length, 4);
      });
    });

    describe('getEnabledRepositories', () => {
      it('should return only enabled repositories', () => {
        const repos = loader.getEnabledRepositories();
        assert.strictEqual(repos.length, 3);
        assert.ok(repos.every(r => r.enabled));
      });
    });

    describe('getRepositoriesByPriority', () => {
      it('should filter by priority', () => {
        const criticalRepos = loader.getRepositoriesByPriority('critical');
        assert.strictEqual(criticalRepos.length, 1);
        assert.strictEqual(criticalRepos[0].name, 'critical-repo');
      });

      it('should return empty for non-existent priority', () => {
        const repos = loader.getRepositoriesByPriority('nonexistent');
        assert.strictEqual(repos.length, 0);
      });
    });

    describe('getRepositoriesByFrequency', () => {
      it('should filter by frequency', () => {
        const dailyRepos = loader.getRepositoriesByFrequency('daily');
        assert.strictEqual(dailyRepos.length, 1);
        assert.strictEqual(dailyRepos[0].name, 'critical-repo');
      });
    });

    describe('getRepositoriesByTag', () => {
      it('should filter by tag', () => {
        const coreRepos = loader.getRepositoriesByTag('core');
        assert.strictEqual(coreRepos.length, 2);
      });

      it('should return empty for non-existent tag', () => {
        const repos = loader.getRepositoriesByTag('nonexistent');
        assert.strictEqual(repos.length, 0);
      });
    });

    describe('getRepository', () => {
      it('should find repository by name', () => {
        const repo = loader.getRepository('critical-repo');
        assert.ok(repo);
        assert.strictEqual(repo.name, 'critical-repo');
      });

      it('should return undefined for non-existent repo', () => {
        const repo = loader.getRepository('nonexistent');
        assert.strictEqual(repo, undefined);
      });
    });

    describe('getAllGroups', () => {
      it('should return all groups', () => {
        const groups = loader.getAllGroups();
        assert.strictEqual(groups.length, 2);
      });
    });

    describe('getEnabledGroups', () => {
      it('should return only enabled groups', () => {
        const groups = loader.getEnabledGroups();
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].name, 'core');
      });
    });

    describe('getGroup', () => {
      it('should find group by name', () => {
        const group = loader.getGroup('core');
        assert.ok(group);
        assert.strictEqual(group.name, 'core');
      });

      it('should return undefined for non-existent group', () => {
        const group = loader.getGroup('nonexistent');
        assert.strictEqual(group, undefined);
      });
    });

    describe('getGroupRepositories', () => {
      it('should return enabled repositories for group', () => {
        const repos = loader.getGroupRepositories('core');
        assert.strictEqual(repos.length, 2);
      });

      it('should throw for non-existent group', () => {
        assert.throws(
          () => loader.getGroupRepositories('nonexistent'),
          (err) => {
            assert.ok(err.message.includes('not found'));
            return true;
          }
        );
      });
    });
  });

  describe('getScanConfig', () => {
    it('should return scan configuration', async () => {
      const config = createTestConfig({ repositories: [] });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      const scanConfig = loader.getScanConfig();
      assert.strictEqual(scanConfig.maxRepositoriesPerNight, 5);
    });
  });

  describe('getScanDefaults', () => {
    it('should return scan defaults', async () => {
      const config = createTestConfig({ repositories: [] });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      const defaults = loader.getScanDefaults();
      assert.strictEqual(defaults.timeout, 300);
      assert.strictEqual(defaults.retries, 3);
    });
  });

  describe('getNotificationSettings', () => {
    it('should return notification settings', async () => {
      const config = createTestConfig({ repositories: [] });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      const notifications = loader.getNotificationSettings();
      assert.strictEqual(notifications.email, 'test@example.com');
    });
  });

  describe('getRepositoriesToScanTonight', () => {
    it('should return daily repos on any day', async () => {
      const config = createTestConfig({
        repositories: [
          { name: 'daily-repo', path: '/path', enabled: true, priority: 'high', scanFrequency: 'daily' },
          { name: 'weekly-repo', path: '/path2', enabled: true, priority: 'high', scanFrequency: 'weekly' }
        ]
      });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      const repos = loader.getRepositoriesToScanTonight();
      // Should always include daily repo
      assert.ok(repos.some(r => r.name === 'daily-repo'));
    });

    it('should respect maxRepositories limit', async () => {
      const config = createTestConfig({
        repositories: [
          { name: 'repo1', path: '/path1', enabled: true, priority: 'high', scanFrequency: 'daily' },
          { name: 'repo2', path: '/path2', enabled: true, priority: 'high', scanFrequency: 'daily' },
          { name: 'repo3', path: '/path3', enabled: true, priority: 'medium', scanFrequency: 'daily' }
        ]
      });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      const repos = loader.getRepositoriesToScanTonight(2);
      assert.strictEqual(repos.length, 2);
    });

    it('should exclude on-demand repos', async () => {
      const config = createTestConfig({
        repositories: [
          { name: 'daily-repo', path: '/path', enabled: true, priority: 'high', scanFrequency: 'daily' },
          { name: 'ondemand-repo', path: '/path2', enabled: true, priority: 'high', scanFrequency: 'on-demand' }
        ]
      });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      const repos = loader.getRepositoriesToScanTonight();
      assert.ok(!repos.some(r => r.name === 'ondemand-repo'));
    });

    it('should sort by priority', async () => {
      const config = createTestConfig({
        repositories: [
          { name: 'low-repo', path: '/path1', enabled: true, priority: 'low', scanFrequency: 'daily' },
          { name: 'critical-repo', path: '/path2', enabled: true, priority: 'critical', scanFrequency: 'daily' },
          { name: 'medium-repo', path: '/path3', enabled: true, priority: 'medium', scanFrequency: 'daily' }
        ]
      });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      const repos = loader.getRepositoriesToScanTonight();
      assert.strictEqual(repos[0].name, 'critical-repo');
    });
  });

  describe('_ensureLoaded', () => {
    it('should throw error when config not loaded', () => {
      const loader = new RepositoryConfigLoader(configPath);

      assert.throws(
        () => loader.getAllRepositories(),
        (err) => {
          assert.ok(err.message.includes('not loaded'));
          return true;
        }
      );
    });
  });

  describe('validate', () => {
    it('should validate valid configuration', async () => {
      const config = createTestConfig({
        repositories: [
          { name: 'repo1', path: '/path', enabled: true, priority: 'high', scanFrequency: 'daily' }
        ]
      });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      assert.doesNotThrow(() => loader.validate());
    });
  });

  describe('getStats', () => {
    it('should return configuration statistics', async () => {
      const config = createTestConfig({
        repositories: [
          { name: 'repo1', path: '/path1', enabled: true, priority: 'high', scanFrequency: 'daily' },
          { name: 'repo2', path: '/path2', enabled: false, priority: 'low', scanFrequency: 'weekly' }
        ],
        repositoryGroups: [
          { name: 'group1', enabled: true, repositories: ['repo1'] }
        ]
      });
      await fs.writeFile(configPath, config);

      const loader = new RepositoryConfigLoader(configPath);
      await loader.load();

      const stats = loader.getStats();
      assert.strictEqual(stats.totalRepositories, 2);
      assert.strictEqual(stats.enabledRepositories, 1);
      assert.strictEqual(stats.totalGroups, 1);
    });
  });
});

describe('RepositoryConfigLoader - Edge Cases', () => {
  let tempDir;
  let configPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-edge-test-'));
    configPath = path.join(tempDir, 'config.json');
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle config without repositoryGroups', async () => {
    const config = JSON.stringify({
      scanConfig: { maxRepositoriesPerNight: 5 },
      repositories: []
    });
    await fs.writeFile(configPath, config);

    const loader = new RepositoryConfigLoader(configPath);
    await loader.load();

    const groups = loader.getAllGroups();
    assert.deepStrictEqual(groups, []);
  });

  it('should handle repositories without tags', async () => {
    const config = JSON.stringify({
      scanConfig: { maxRepositoriesPerNight: 5 },
      repositories: [
        { name: 'repo1', path: '/path', enabled: true, priority: 'high' }
      ]
    });
    await fs.writeFile(configPath, config);

    const loader = new RepositoryConfigLoader(configPath);
    await loader.load();

    const repos = loader.getRepositoriesByTag('anytag');
    assert.deepStrictEqual(repos, []);
  });
});
