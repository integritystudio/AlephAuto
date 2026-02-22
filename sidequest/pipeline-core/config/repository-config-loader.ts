/**
 * Repository Configuration Loader
 *
 * Loads and validates repository scanning configuration from JSON files.
 * Provides API for repository selection, priority sorting, and frequency filtering.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { createComponentLogger, logError } from '../../utils/logger.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createComponentLogger('RepositoryConfigLoader');

// ============================================================================
// Type Definitions
// ============================================================================

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

/**
 * Loads and manages repository scanning configuration
 */
export class RepositoryConfigLoader {
  private configPath: string;
  private config: RepositoryScanConfig | null;
  private lastLoaded: Date | null;

  constructor(configPath: string | null = null) {
    this.configPath = configPath ?? path.join(process.cwd(), 'config', 'scan-repositories.json');
    this.config = null;
    this.lastLoaded = null;
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<RepositoryScanConfig> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configContent) as RepositoryScanConfig;
      this.lastLoaded = new Date();

      // Expand paths (handle ~ for home directory)
      this._expandPaths();

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

  /**
   * Reload configuration from file
   */
  async reload(): Promise<RepositoryScanConfig> {
    logger.info('Reloading configuration');
    return await this.load();
  }

  /**
   * Get scan configuration
   */
  getScanConfig(): ScanConfigSettings {
    this._ensureLoaded();
    return this.config!.scanConfig;
  }

  /**
   * Get all repositories
   */
  getAllRepositories(): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories;
  }

  /**
   * Get enabled repositories
   */
  getEnabledRepositories(): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories.filter(repo => repo.enabled);
  }

  /**
   * Get repositories by priority
   */
  getRepositoriesByPriority(priority: Priority): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories.filter(
      repo => repo.enabled && repo.priority === priority
    );
  }

  /**
   * Get repositories by frequency
   */
  getRepositoriesByFrequency(frequency: ScanFrequency): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories.filter(
      repo => repo.enabled && repo.scanFrequency === frequency
    );
  }

  /**
   * Get repositories by tag
   */
  getRepositoriesByTag(tag: string): RepositoryConfig[] {
    this._ensureLoaded();
    return this.config!.repositories.filter(
      repo => repo.enabled && repo.tags?.includes(tag) === true
    );
  }

  /**
   * Get repository by name
   */
  getRepository(name: string): RepositoryConfig | undefined {
    this._ensureLoaded();
    return this.config!.repositories.find(repo => repo.name === name);
  }

  /**
   * Get all repository groups
   */
  getAllGroups(): RepositoryGroup[] {
    this._ensureLoaded();
    return this.config!.repositoryGroups ?? [];
  }

  /**
   * Get enabled repository groups
   */
  getEnabledGroups(): RepositoryGroup[] {
    this._ensureLoaded();
    return (this.config!.repositoryGroups ?? []).filter(group => group.enabled);
  }

  /**
   * Get group by name
   */
  getGroup(name: string): RepositoryGroup | undefined {
    this._ensureLoaded();
    return (this.config!.repositoryGroups ?? []).find(group => group.name === name);
  }

  /**
   * Get repositories for a group
   */
  getGroupRepositories(groupName: string): RepositoryConfig[] {
    const group = this.getGroup(groupName);
    if (!group) {
      throw new Error(`Group '${groupName}' not found`);
    }

    return group.repositories
      .map(repoName => this.getRepository(repoName))
      .filter((repo): repo is RepositoryConfig => repo !== undefined && repo.enabled);
  }

  /**
   * Get repositories to scan tonight (based on priority and frequency)
   */
  getRepositoriesToScanTonight(maxRepos: number | null = null): RepositoryConfig[] {
    this._ensureLoaded();

    const maxRepositories = maxRepos ?? this.config!.scanConfig.maxRepositoriesPerNight;
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    const dayOfMonth = now.getDate();

    // Filter repositories by frequency
    const eligibleRepositories = this.getEnabledRepositories().filter(repo => {
      if (repo.scanFrequency === 'daily') return true;
      if (repo.scanFrequency === 'weekly' && dayOfWeek === 0) return true;
      if (repo.scanFrequency === 'monthly' && dayOfMonth === 1) return true;
      if (repo.scanFrequency === 'on-demand') return false;
      return false;
    });

    // Sort by priority (critical > high > medium > low)
    const sortedRepositories = eligibleRepositories.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // If same priority, sort by last scanned (oldest first)
      const aLastScanned = a.lastScannedAt ? new Date(a.lastScannedAt).getTime() : 0;
      const bLastScanned = b.lastScannedAt ? new Date(b.lastScannedAt).getTime() : 0;
      return aLastScanned - bLastScanned;
    });

    // Limit to maxRepositories
    return sortedRepositories.slice(0, maxRepositories);
  }

  /**
   * Get scan defaults
   */
  getScanDefaults(): ScanDefaults {
    this._ensureLoaded();
    return this.config!.scanDefaults ?? {};
  }

  /**
   * Get notification settings
   */
  getNotificationSettings(): NotificationSettings {
    this._ensureLoaded();
    return this.config!.notifications ?? { enabled: false };
  }

  /**
   * Update repository last scanned timestamp
   */
  async updateLastScanned(repoName: string, timestamp: Date | null = null): Promise<void> {
    this._ensureLoaded();

    const repo = this.getRepository(repoName);
    if (!repo) {
      throw new Error(`Repository '${repoName}' not found`);
    }

    repo.lastScannedAt = (timestamp ?? new Date()).toISOString();

    // Save updated configuration
    await this.save();

    logger.info({ repoName, timestamp: repo.lastScannedAt }, 'Updated last scanned timestamp');
  }

  /**
   * Add scan history entry
   */
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

    // Keep only last 10 entries
    repo.scanHistory = repo.scanHistory.slice(0, 10);

    // Save updated configuration
    await this.save();

    logger.info({ repoName, status: historyEntry['status'] }, 'Added scan history entry');
  }

  /**
   * Save configuration to file
   */
  async save(): Promise<void> {
    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );

      logger.info({ configPath: this.configPath }, 'Configuration saved');
    } catch (error) {
      logError(logger, error, 'Failed to save configuration', { configPath: this.configPath });
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to save configuration: ${msg}`);
    }
  }

  /**
   * Validate configuration
   */
  validate(): true {
    this._ensureLoaded();

    const errors: string[] = [];

    // Validate scan config
    if (!this.config!.scanConfig) {
      errors.push('scanConfig is required');
    } else {
      if (!this.config!.scanConfig.schedule) {
        errors.push('scanConfig.schedule is required');
      }
    }

    // Validate repositories
    if (!Array.isArray(this.config!.repositories)) {
      errors.push('repositories must be an array');
    } else {
      const names = new Set<string>();
      this.config!.repositories.forEach((repo, index) => {
        if (!repo.name) {
          errors.push(`repositories[${index}]: name is required`);
        } else if (names.has(repo.name)) {
          errors.push(`repositories[${index}]: duplicate name '${repo.name}'`);
        } else {
          names.add(repo.name);
        }

        if (!repo.path) {
          errors.push(`repositories[${index}]: path is required`);
        }
      });
    }

    // Validate repository groups
    if (this.config!.repositoryGroups) {
      this.config!.repositoryGroups.forEach((group, index) => {
        if (!group.name) {
          errors.push(`repositoryGroups[${index}]: name is required`);
        }

        if (!Array.isArray(group.repositories)) {
          errors.push(`repositoryGroups[${index}]: repositories must be an array`);
        } else {
          group.repositories.forEach(repoName => {
            if (!this.getRepository(repoName)) {
              errors.push(`repositoryGroups[${index}]: repository '${repoName}' not found`);
            }
          });
        }
      });
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    logger.info('Configuration validated successfully');
    return true;
  }

  /**
   * Get statistics
   */
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

  /**
   * Private: Ensure configuration is loaded
   */
  private _ensureLoaded(): void {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
  }

  /**
   * Private: Expand ~ in repository paths
   */
  private _expandPaths(): void {
    const homeDir = os.homedir();

    this.config!.repositories.forEach(repo => {
      if (repo.path.startsWith('~')) {
        repo.path = repo.path.replace('~', homeDir);
      }
    });
  }
}
