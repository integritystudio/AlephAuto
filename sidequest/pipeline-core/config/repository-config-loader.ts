/**
 * Repository Configuration Loader
 *
 * Loads and validates repository scanning configuration from JSON files.
 * Provides API for repository selection, priority sorting, and frequency filtering.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FORMATTING, LIMITS } from '../../core/constants.ts';
import { createComponentLogger, logError } from '../../utils/logger.ts';
import { config } from '../../core/config.ts';

const logger = createComponentLogger('RepositoryConfigLoader');


export type ScanFrequency = 'daily' | 'weekly' | 'monthly' | 'on-demand';
export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface ScanHistoryEntry {
  timestamp?: string;
  status?: string;
  duration?: number;
  duplicatesFound?: number;
  [key: string]: unknown;
}

export interface RepositoryConfig {
  name: string;
  path: string;
  priority: Priority;
  scanFrequency: ScanFrequency;
  enabled: boolean;
  tags?: string[];
  excludePatterns?: string[];
  lastScannedAt?: string;
  scanHistory?: ScanHistoryEntry[];
  _comment?: string;
}

export interface RepositoryGroup {
  name: string;
  description?: string;
  repositories: string[];
  scanType?: string;
  enabled: boolean;
}

export interface ScanConfigSettings {
  enabled: boolean;
  schedule: string;
  maxRepositoriesPerNight: number;
  maxConcurrentScans?: number;
  scanTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface CacheConfigSettings {
  enabled: boolean;
  provider?: string;
  ttl?: number;
  invalidateOnChange?: boolean;
  trackGitCommits?: boolean;
  trackUncommittedChanges?: boolean;
}

export interface ScanDefaults {
  languages?: string[];
  includeSourceCode?: boolean;
  includeCodeBlocks?: boolean;
  generateReports?: boolean;
  reportFormats?: string[];
  [key: string]: unknown;
}

export interface NotificationSettings {
  enabled: boolean;
  channels?: string[];
  onSuccess?: boolean;
  onFailure?: boolean;
  onHighImpactDuplicates?: boolean;
  highImpactThreshold?: number;
  [key: string]: unknown;
}

export interface RepositoryScanConfig {
  $schema?: string;
  version?: string;
  scanConfig: ScanConfigSettings;
  cacheConfig?: CacheConfigSettings;
  repositories: RepositoryConfig[];
  repositoryGroups?: RepositoryGroup[];
  scanDefaults?: ScanDefaults;
  notifications?: NotificationSettings;
}

export interface ConfigStats {
  totalRepositories: number;
  enabledRepositories: number;
  disabledRepositories: number;
  byPriority: Record<Priority, number>;
  byFrequency: {
    daily: number;
    weekly: number;
    monthly: number;
    onDemand: number;
  };
  groups: number;
  lastLoaded: Date | null;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
} as const;

export class RepositoryConfigLoader {
  private configPath: string;
  private config: RepositoryScanConfig | null;
  private lastLoaded: Date | null;
  private _saveQueue: Promise<void>;

  constructor(configPath: string | null = null) {
    this.configPath = configPath ?? path.join(process.cwd(), 'config', 'scan-repositories.json');
    this.config = null;
    this.lastLoaded = null;
    this._saveQueue = Promise.resolve();
  }

  async load(): Promise<RepositoryScanConfig> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configContent) as RepositoryScanConfig;
      this.lastLoaded = new Date();

      this._expandPaths();

      if (this.config.cacheConfig?.enabled && this.config.cacheConfig?.provider === 'redis' && !config.redis.enabled) {
        logger.warn(
          'cacheConfig.provider is "redis" but neither REDIS_URL nor REDIS_HOST is set — cache will silently degrade'
        );
      }

      logger.info({
        configPath: this.configPath,
        repositoryCount: this.config.repositories.length,
        groupCount: this.config.repositoryGroups?.length ?? 0
      }, 'Configuration loaded');

      return this.config;
    } catch (error) {
      logError(logger, error, 'Failed to load configuration', { configPath: this.configPath });
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load configuration from ${this.configPath}: ${msg}`);
    }
  }

  async reload(): Promise<RepositoryScanConfig> {
    logger.info('Reloading configuration');
    return await this.load();
  }

  getScanConfig(): ScanConfigSettings {
    this._ensureLoaded();
    return this.config!.scanConfig;
  }

  getAllRepositories(): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories;
  }

  getEnabledRepositories(): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories.filter(repo => repo.enabled);
  }

  getRepositoriesByPriority(priority: Priority): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories.filter(
      repo => repo.enabled && repo.priority === priority
    );
  }

  getRepositoriesByFrequency(frequency: ScanFrequency): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories.filter(
      repo => repo.enabled && repo.scanFrequency === frequency
    );
  }

  getRepositoriesByTag(tag: string): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories.filter(
      repo => repo.enabled && repo.tags?.includes(tag) === true
    );
  }

  getRepository(name: string): RepositoryConfig | undefined {
    this._ensureLoaded();
    return this.config!.repositories.find(repo => repo.name === name);
  }

  getAllGroups(): RepositoryGroup[] {
    this._ensureLoaded();
    return this.config!.repositoryGroups ?? [];
  }

  getEnabledGroups(): RepositoryGroup[] {
    this._ensureLoaded();
    return (this.config!.repositoryGroups ?? []).filter(group => group.enabled);
  }

  getGroup(name: string): RepositoryGroup | undefined {
    this._ensureLoaded();
    return (this.config!.repositoryGroups ?? []).find(group => group.name === name);
  }

  getGroupRepositories(groupName: string): RepositoryConfig[] {
    const group = this.getGroup(groupName);
    if (!group) {
      throw new Error(`Group '${groupName}' not found`);
    }

    return group.repositories
      .map(repoName => this.getRepository(repoName))
      .filter((repo): repo is RepositoryConfig => repo !== undefined && repo.enabled);
  }

  getRepositoriesToScanTonight(maxRepos: number | null = null): RepositoryConfig[] {
    this._ensureLoaded();

    const maxRepositories = maxRepos ?? this.config!.scanConfig.maxRepositoriesPerNight;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();

    const eligibleRepositories = this.getEnabledRepositories().filter(repo => {
      if (repo.scanFrequency === 'daily') return true;
      if (repo.scanFrequency === 'weekly') return dayOfWeek === 0;
      if (repo.scanFrequency === 'monthly') return dayOfMonth === 1;
      return false;
    });

    const sortedRepositories = eligibleRepositories.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      const aLastScanned = a.lastScannedAt ? new Date(a.lastScannedAt).getTime() : 0;
      const bLastScanned = b.lastScannedAt ? new Date(b.lastScannedAt).getTime() : 0;
      return aLastScanned - bLastScanned;
    });

    return sortedRepositories.slice(0, maxRepositories);
  }

  getScanDefaults(): ScanDefaults {
    this._ensureLoaded();
    return this.config!.scanDefaults ?? {};
  }

  getNotificationSettings(): NotificationSettings {
    this._ensureLoaded();
    return this.config!.notifications ?? { enabled: false };
  }

  async updateLastScanned(repoName: string, timestamp: Date | null = null): Promise<void> {
    this._ensureLoaded();

    const repo = this.getRepository(repoName);
    if (!repo) {
      throw new Error(`Repository '${repoName}' not found`);
    }

    repo.lastScannedAt = (timestamp ?? new Date()).toISOString();

    await this.save();

    logger.info({ repoName, timestamp: repo.lastScannedAt }, 'Updated last scanned timestamp');
  }

  async addScanHistory(repoName: string, historyEntry: Omit<ScanHistoryEntry, 'timestamp'>): Promise<void> {
    this._ensureLoaded();

    const repo = this.getRepository(repoName);
    if (!repo) {
      throw new Error(`Repository '${repoName}' not found`);
    }

    if (!repo.scanHistory) {
      repo.scanHistory = [];
    }

    repo.scanHistory.unshift({
      timestamp: new Date().toISOString(),
      ...historyEntry
    });

    repo.scanHistory = repo.scanHistory.slice(0, LIMITS.REPOSITORY_SCAN_HISTORY_ENTRIES);

    await this.save();

    logger.info({ repoName, status: historyEntry['status'] }, 'Added scan history entry');
  }

  /**
   * Atomically record scan completion for a repository in a single config write.
   */
  async recordScanResult(
    repoName: string,
    historyEntry: Omit<ScanHistoryEntry, 'timestamp'>,
    timestamp: Date | null = null
  ): Promise<void> {
    this._ensureLoaded();

    const repo = this.getRepository(repoName);
    if (!repo) {
      throw new Error(`Repository '${repoName}' not found`);
    }

    const scannedAtIso = (timestamp ?? new Date()).toISOString();
    repo.lastScannedAt = scannedAtIso;

    if (!repo.scanHistory) {
      repo.scanHistory = [];
    }
    repo.scanHistory.unshift({
      timestamp: scannedAtIso,
      ...historyEntry
    });
    repo.scanHistory = repo.scanHistory.slice(0, LIMITS.REPOSITORY_SCAN_HISTORY_ENTRIES);

    await this.save();
    logger.info({
      repoName,
      timestamp: scannedAtIso,
      status: historyEntry.status
    }, 'Recorded scan result');
  }

  async save(): Promise<void> {
    const saveTask = this._saveQueue.then(async () => {
      try {
        const portableConfig = this._collapsePaths(this.config!);
        await fs.writeFile(
          this.configPath,
          JSON.stringify(portableConfig, null, FORMATTING.JSON_INDENT),
          'utf-8'
        );

        logger.info({ configPath: this.configPath }, 'Configuration saved');
      } catch (error) {
        logError(logger, error, 'Failed to save configuration', { configPath: this.configPath });
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to save configuration: ${msg}`);
      }
    });

    this._saveQueue = saveTask.catch(() => {});
    return saveTask;
  }

  validate(): true {
    this._ensureLoaded();

    const errors: string[] = [];

    if (!this.config!.scanConfig) {
      errors.push('scanConfig is required');
    } else if (!this.config!.scanConfig.schedule) {
      errors.push('scanConfig.schedule is required');
    }

    if (!Array.isArray(this.config!.repositories)) {
      errors.push('repositories must be an array');
    } else {
      const names = new Set<string>();
      for (const [index, repo] of this.config!.repositories.entries()) {
        if (!repo.name) {
          errors.push(`repositories[${index}]: name is required`);
        } else if (names.has(repo.name)) {
          errors.push(`repositories[${index}]: duplicate name '${repo.name}'`);
        } else {
          names.add(repo.name);
        }
        if (!repo.path) errors.push(`repositories[${index}]: path is required`);
      }
    }

    for (const [index, group] of (this.config!.repositoryGroups ?? []).entries()) {
      if (!group.name) {
        errors.push(`repositoryGroups[${index}]: name is required`);
      }
      if (!Array.isArray(group.repositories)) {
        errors.push(`repositoryGroups[${index}]: repositories must be an array`);
      } else {
        for (const repoName of group.repositories) {
          if (!this.getRepository(repoName)) {
            errors.push(`repositoryGroups[${index}]: repository '${repoName}' not found`);
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    logger.info('Configuration validated successfully');
    return true;
  }

  getStats(): ConfigStats {
    this._ensureLoaded();

    const totalRepos = this.config!.repositories.length;
    const enabledRepos = this.config!.repositories.filter(r => r.enabled).length;
    const disabledRepos = totalRepos - enabledRepos;

    const byPriority: Record<Priority, number> = {
      critical: this.getRepositoriesByPriority('critical').length,
      high: this.getRepositoriesByPriority('high').length,
      medium: this.getRepositoriesByPriority('medium').length,
      low: this.getRepositoriesByPriority('low').length
    };

    const byFrequency = {
      daily: this.getRepositoriesByFrequency('daily').length,
      weekly: this.getRepositoriesByFrequency('weekly').length,
      monthly: this.getRepositoriesByFrequency('monthly').length,
      onDemand: this.getRepositoriesByFrequency('on-demand').length
    };

    return {
      totalRepositories: totalRepos,
      enabledRepositories: enabledRepos,
      disabledRepositories: disabledRepos,
      byPriority,
      byFrequency,
      groups: (this.config!.repositoryGroups ?? []).length,
      lastLoaded: this.lastLoaded
    };
  }

  private _ensureLoaded(): void {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
  }

  private _expandPaths(): void {
    const homeDir = os.homedir();

    this.config!.repositories.forEach(repo => {
      if (repo.path.startsWith('~')) {
        repo.path = homeDir + repo.path.slice(1);
      }
    });
  }

  private _collapsePaths(config: RepositoryScanConfig): RepositoryScanConfig {
    const homeDir = os.homedir();
    return {
      ...config,
      repositories: config.repositories.map(repo => ({
        ...repo,
        path: repo.path.startsWith(homeDir)
          ? '~' + repo.path.slice(homeDir.length)
          : repo.path,
      })),
    };
  }
}
