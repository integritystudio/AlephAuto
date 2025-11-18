// @ts-nocheck
/**
 * Plugin Management Worker - AlephAuto Integration
 *
 * Monitors and audits Claude Code plugin configurations.
 * Identifies duplicate plugins, unused plugins, and provides cleanup recommendations.
 *
 * @extends SidequestServer
 */

import { SidequestServer } from './server.js';
import { config } from './config.js';
import { createComponentLogger } from './logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const logger = createComponentLogger('PluginManager');

class PluginManagerWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      maxConcurrent: options.maxConcurrent ?? 1, // Single concurrent audit
      ...options
    });

    this.auditScriptPath = path.join(
      process.env.HOME,
      'code/jobs/sidequest/plugin-management-audit.sh'
    );
    this.configPath = path.join(process.env.HOME, '.claude/settings.json');
    this.thresholds = {
      maxPlugins: 30,
      warnPlugins: 20
    };

    logger.info('Plugin Manager Worker initialized', {
      auditScriptPath: this.auditScriptPath
    });
  }

  /**
   * Run plugin audit job
   * @param {Object} job - Job configuration
   * @param {boolean} job.detailed - Include detailed plugin listing
   * @param {boolean} job.autoCleanup - Attempt automatic cleanup (future)
   * @returns {Promise<Object>} Audit results
   */
  async runJobHandler(job) {
    const startTime = Date.now();
    logger.info('Starting plugin audit', { jobId: job.id, detailed: job.data?.detailed });

    try {
      // Run audit script
      const auditResults = await this.runAuditScript(job.data?.detailed || false);

      // Parse results
      const analysis = await this.analyzeResults(auditResults);

      // Generate recommendations
      const recommendations = this.generateRecommendations(analysis);

      const result = {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        ...analysis,
        recommendations
      };

      logger.info('Plugin audit completed', {
        jobId: job.id,
        totalPlugins: analysis.totalPlugins,
        duplicateCount: analysis.duplicateCategories?.length || 0,
        duration: result.duration
      });

      return result;
    } catch (error) {
      logger.error({ err: error, jobId: job.id }, 'Plugin audit failed');
      throw error;
    }
  }

  /**
   * Run the audit shell script
   * @param {boolean} detailed - Include detailed listing
   * @returns {Promise<Object>} Parsed JSON results
   */
  async runAuditScript(detailed = false) {
    try {
      const args = ['--json'];
      if (detailed) args.push('--detailed');

      // Use Homebrew bash if available
      const bashPath = '/opt/homebrew/bin/bash';
      const cmd = `${bashPath} ${this.auditScriptPath} ${args.join(' ')}`;

      const { stdout, stderr } = await execAsync(cmd);

      if (stderr) {
        logger.warn('Audit script warnings', { stderr });
      }

      return JSON.parse(stdout);
    } catch (error) {
      // Script exits with 1 if issues found, but still provides JSON
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout);
        } catch (parseError) {
          logger.error({ err: parseError }, 'Failed to parse audit output');
          throw parseError;
        }
      }
      throw error;
    }
  }

  /**
   * Analyze audit results
   * @param {Object} auditResults - Raw audit results
   * @returns {Promise<Object>} Analysis
   */
  async analyzeResults(auditResults) {
    const { total_enabled, enabled_plugins, potential_duplicates } = auditResults;

    // Load plugin metadata if available
    const pluginMetadata = await this.loadPluginMetadata();

    // Identify duplicate categories
    const duplicateCategories = Object.entries(potential_duplicates || {}).map(
      ([category, plugins]) => ({
        category,
        plugins,
        count: plugins.length
      })
    );

    // Check thresholds
    const exceededThresholds = {
      maxPlugins: total_enabled > this.thresholds.maxPlugins,
      warnPlugins: total_enabled > this.thresholds.warnPlugins
    };

    return {
      totalPlugins: total_enabled,
      enabledPlugins: enabled_plugins,
      duplicateCategories,
      exceededThresholds,
      pluginMetadata
    };
  }

  /**
   * Load plugin metadata from Claude config
   * @returns {Promise<Object>} Plugin metadata
   */
  async loadPluginMetadata() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);

      // Extract useful metadata if available
      return {
        enabledPlugins: config.enabledPlugins || {},
        pluginSettings: config.pluginSettings || {},
        lastModified: (await fs.stat(this.configPath)).mtime
      };
    } catch (error) {
      logger.warn({ err: error }, 'Failed to load plugin metadata');
      return {};
    }
  }

  /**
   * Generate cleanup recommendations
   * @param {Object} analysis - Analysis results
   * @returns {Array<Object>} Recommendations
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    // High plugin count warning
    if (analysis.exceededThresholds.maxPlugins) {
      recommendations.push({
        priority: 'high',
        type: 'plugin_count',
        message: `You have ${analysis.totalPlugins} enabled plugins (threshold: ${this.thresholds.maxPlugins})`,
        action: 'Review and disable unused plugins to reduce overhead'
      });
    } else if (analysis.exceededThresholds.warnPlugins) {
      recommendations.push({
        priority: 'medium',
        type: 'plugin_count',
        message: `You have ${analysis.totalPlugins} enabled plugins (warning: ${this.thresholds.warnPlugins})`,
        action: 'Consider reviewing plugin usage'
      });
    }

    // Duplicate category recommendations
    if (analysis.duplicateCategories.length > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'duplicate_categories',
        message: `Found ${analysis.duplicateCategories.length} categories with multiple plugins`,
        action: 'Review duplicate categories and consolidate',
        details: analysis.duplicateCategories.map(cat => ({
          category: cat.category,
          plugins: cat.plugins,
          suggestion: `Keep only the plugin you actively use in ${cat.category}`
        }))
      });
    }

    // Success message if no issues
    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'info',
        type: 'healthy',
        message: `Plugin configuration looks healthy (${analysis.totalPlugins} plugins)`,
        action: 'No action needed'
      });
    }

    return recommendations;
  }

  /**
   * Create a plugin audit job
   * @param {Object} options - Job options
   * @returns {Object} Created job
   */
  addJob(options = {}) {
    const jobId = `plugin-audit-${Date.now()}`;
    return this.createJob(jobId, {
      detailed: options.detailed || false
    });
  }
}

// Export worker class
export { PluginManagerWorker };
