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
import { createComponentLogger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createComponentLogger('RepositoryConfigLoader');

/**
 * Loads and manages repository scanning configuration
 */
export class RepositoryConfigLoader {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(process.cwd(), 'config', 'scan-repositories.json');
    this.config = null;
    this.lastLoaded = null;
  }

  /**
   * Load configuration from file
   */
  async load() {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configContent);
      this.lastLoaded = new Date();

      // Expand paths (handle ~ for home directory)
      this._expandPaths();

      logger.info({
        configPath: this.configPath,
        repositoryCount: this.config.repositories.length,
        groupCount: this.config.repositoryGroups?.length || 0
      }, 'Configuration loaded');

      return this.config;
    } catch (error) {
      logger.error({ error, configPath: this.configPath }, 'Failed to load configuration');
      throw new Error(`Failed to load configuration from ${this.configPath}: ${error.message}`);
    }
  }

  /**
   * Reload configuration from file
   */
  async reload() {
    logger.info('Reloading configuration');
    return await this.load();
  }

  /**
   * Get scan configuration
   */
  getScanConfig() {
    this._ensureLoaded();
    return this.config.scanConfig;
  }

  /**
   * Get all repositories
   */
  getAllRepositories() {
    this._ensureLoaded();
    return this.config.repositories;
  }

  /**
   * Get enabled repositories
   */
  getEnabledRepositories() {
    this._ensureLoaded();
    return this.config.repositories.filter(repo => repo.enabled);
  }

  /**
   * Get repositories by priority
   */
  getRepositoriesByPriority(priority) {
    this._ensureLoaded();
    return this.config.repositories.filter(
      repo => repo.enabled && repo.priority === priority
    );
  }

  /**
   * Get repositories by frequency
   */
  getRepositoriesByFrequency(frequency) {
    this._ensureLoaded();
    return this.config.repositories.filter(
      repo => repo.enabled && repo.scanFrequency === frequency
    );
  }

  /**
   * Get repositories by tag
   */
  getRepositoriesByTag(tag) {
    this._ensureLoaded();
    return this.config.repositories.filter(
      repo => repo.enabled && repo.tags && repo.tags.includes(tag)
    );
  }

  /**
   * Get repository by name
   */
  getRepository(name) {
    this._ensureLoaded();
    return this.config.repositories.find(repo => repo.name === name);
  }

  /**
   * Get all repository groups
   */
  getAllGroups() {
    this._ensureLoaded();
    return this.config.repositoryGroups || [];
  }

  /**
   * Get enabled repository groups
   */
  getEnabledGroups() {
    this._ensureLoaded();
    return (this.config.repositoryGroups || []).filter(group => group.enabled);
  }

  /**
   * Get group by name
   */
  getGroup(name) {
    this._ensureLoaded();
    return (this.config.repositoryGroups || []).find(group => group.name === name);
  }

  /**
   * Get repositories for a group
   */
  getGroupRepositories(groupName) {
    const group = this.getGroup(groupName);
    if (!group) {
      throw new Error(`Group '${groupName}' not found`);
    }

    return group.repositories
      .map(repoName => this.getRepository(repoName))
      .filter(repo => repo && repo.enabled);
  }

  /**
   * Get repositories to scan tonight (based on priority and frequency)
   */
  getRepositoriesToScanTonight(maxRepos = null) {
    this._ensureLoaded();

    const maxRepositories = maxRepos || this.config.scanConfig.maxRepositoriesPerNight;
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    const dayOfMonth = now.getDate();

    // Filter repositories by frequency
    const eligibleRepositories = this.getEnabledRepositories().filter(repo => {
      // Daily frequency always eligible
      if (repo.scanFrequency === 'daily') return true;

      // Weekly frequency: scan on Sundays
      if (repo.scanFrequency === 'weekly' && dayOfWeek === 0) return true;

      // Monthly frequency: scan on 1st of month
      if (repo.scanFrequency === 'monthly' && dayOfMonth === 1) return true;

      // On-demand: skip
      if (repo.scanFrequency === 'on-demand') return false;

      return false;
    });

    // Sort by priority (critical > high > medium > low)
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const sortedRepositories = eligibleRepositories.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
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
  getScanDefaults() {
    this._ensureLoaded();
    return this.config.scanDefaults || {};
  }

  /**
   * Get notification settings
   */
  getNotificationSettings() {
    this._ensureLoaded();
    return this.config.notifications || {};
  }

  /**
   * Update repository last scanned timestamp
   */
  async updateLastScanned(repoName, timestamp = null) {
    this._ensureLoaded();

    const repo = this.getRepository(repoName);
    if (!repo) {
      throw new Error(`Repository '${repoName}' not found`);
    }

    repo.lastScannedAt = (timestamp || new Date()).toISOString();

    // Save updated configuration
    await this.save();

    logger.info({ repoName, timestamp: repo.lastScannedAt }, 'Updated last scanned timestamp');
  }

  /**
   * Add scan history entry
   */
  async addScanHistory(repoName, historyEntry) {
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

    logger.info({ repoName, status: historyEntry.status }, 'Added scan history entry');
  }

  /**
   * Save configuration to file
   */
  async save() {
    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );

      logger.info({ configPath: this.configPath }, 'Configuration saved');
    } catch (error) {
      logger.error({ error, configPath: this.configPath }, 'Failed to save configuration');
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Validate configuration
   */
  validate() {
    this._ensureLoaded();

    const errors = [];

    // Validate scan config
    if (!this.config.scanConfig) {
      errors.push('scanConfig is required');
    } else {
      if (!this.config.scanConfig.schedule) {
        errors.push('scanConfig.schedule is required');
      }
    }

    // Validate repositories
    if (!Array.isArray(this.config.repositories)) {
      errors.push('repositories must be an array');
    } else {
      const names = new Set();
      this.config.repositories.forEach((repo, index) => {
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
    if (this.config.repositoryGroups) {
      this.config.repositoryGroups.forEach((group, index) => {
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
  getStats() {
    this._ensureLoaded();

    const totalRepos = this.config.repositories.length;
    const enabledRepos = this.config.repositories.filter(r => r.enabled).length;
    const disabledRepos = totalRepos - enabledRepos;

    const byPriority = {
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
      groups: (this.config.repositoryGroups || []).length,
      lastLoaded: this.lastLoaded
    };
  }

  /**
   * Private: Ensure configuration is loaded
   */
  _ensureLoaded() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
  }

  /**
   * Private: Expand ~ in repository paths
   */
  _expandPaths() {
    const homeDir = os.homedir();

    this.config.repositories.forEach(repo => {
      if (repo.path.startsWith('~')) {
        repo.path = repo.path.replace('~', homeDir);
      }
    });
  }
}
