/**
 * Plugin Management Worker - AlephAuto Integration
 *
 * Monitors and audits Claude Code plugin configurations.
 * Identifies duplicate plugins, unused plugins, and provides cleanup recommendations.
 */

import { SidequestServer } from '../core/server.ts';
import { config } from '../core/config.ts';
import { createComponentLogger, logStart, logComplete, logError, logWarn } from './logger.ts';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import type { Job } from '../core/server.ts';

const execAsync = promisify(exec);
const logger = createComponentLogger('PluginManager');

interface PluginManagerOptions {
  maxConcurrent?: number;
  [key: string]: unknown;
}

interface AuditResults {
  total_enabled: number;
  enabled_plugins: string[];
  potential_duplicates: Record<string, string[]>;
}

interface DuplicateCategory {
  category: string;
  plugins: string[];
  count: number;
}

interface ExceededThresholds {
  maxPlugins: boolean;
  warnPlugins: boolean;
}

interface PluginMetadata {
  enabledPlugins?: Record<string, unknown>;
  pluginSettings?: Record<string, unknown>;
  lastModified?: Date;
}

interface Analysis {
  totalPlugins: number;
  enabledPlugins: string[];
  duplicateCategories: DuplicateCategory[];
  exceededThresholds: ExceededThresholds;
  pluginMetadata: PluginMetadata;
}

interface Recommendation {
  priority: string;
  type: string;
  message: string;
  action: string;
  details?: Array<{
    category: string;
    plugins: string[];
    suggestion: string;
  }>;
}

class PluginManagerWorker extends SidequestServer {
  auditScriptPath: string;
  configPath: string;
  thresholds: { maxPlugins: number; warnPlugins: number };

  constructor(options: PluginManagerOptions = {}) {
    super({
      maxConcurrent: options.maxConcurrent ?? 1,
      ...options
    });

    this.auditScriptPath = path.join(
      process.env.HOME!,
      'code/jobs/sidequest/plugin-management-audit.sh'
    );
    this.configPath = path.join(process.env.HOME!, '.claude/settings.json');
    this.thresholds = {
      maxPlugins: 30,
      warnPlugins: 20
    };

    logger.info({ auditScriptPath: this.auditScriptPath }, 'Plugin Manager Worker initialized');
  }

  /**
   * Run plugin audit job
   */
  async runJobHandler(job: Job): Promise<{
    success: boolean;
    timestamp: string;
    duration: number;
    recommendations: Recommendation[];
  } & Analysis> {
    const startTime = Date.now();
    logStart(logger, 'plugin audit', { jobId: job.id, detailed: job.data?.detailed });

    try {
      const auditResults = await this.runAuditScript((job.data?.detailed as boolean) || false);
      const analysis = await this.analyzeResults(auditResults);
      const recommendations = this.generateRecommendations(analysis);

      const result = {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        ...analysis,
        recommendations
      };

      logger.info({
        jobId: job.id,
        totalPlugins: analysis.totalPlugins,
        duplicateCount: analysis.duplicateCategories?.length ?? 0,
        duration: result.duration
      }, 'Plugin audit completed');

      return result;
    } catch (error) {
      logError(logger, error, 'Plugin audit failed', { jobId: job.id });
      throw error;
    }
  }

  /**
   * Run the audit shell script
   */
  async runAuditScript(detailed: boolean = false): Promise<AuditResults> {
    try {
      const args = ['--json'];
      if (detailed) args.push('--detailed');

      const cmd = `bash ${this.auditScriptPath} ${args.join(' ')}`;

      const { stdout, stderr } = await execAsync(cmd);

      if (stderr) {
        logWarn(logger, null, 'Audit script warnings', { stderr });
      }

      return JSON.parse(stdout) as AuditResults;
    } catch (error) {
      const execError = error as { stdout?: string };
      if (execError.stdout) {
        try {
          return JSON.parse(execError.stdout) as AuditResults;
        } catch (parseError) {
          logError(logger, parseError, 'Failed to parse audit output');
          throw parseError;
        }
      }
      throw error;
    }
  }

  /**
   * Analyze audit results
   */
  async analyzeResults(auditResults: AuditResults): Promise<Analysis> {
    const { total_enabled, enabled_plugins, potential_duplicates } = auditResults;

    const pluginMetadata = await this.loadPluginMetadata();

    const duplicateCategories: DuplicateCategory[] = Object.entries(potential_duplicates ?? {}).map(
      ([category, plugins]) => ({
        category,
        plugins,
        count: plugins.length
      })
    );

    const exceededThresholds: ExceededThresholds = {
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
   */
  async loadPluginMetadata(): Promise<PluginMetadata> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(configData) as Record<string, unknown>;

      return {
        enabledPlugins: (parsed.enabledPlugins as Record<string, unknown>) ?? {},
        pluginSettings: (parsed.pluginSettings as Record<string, unknown>) ?? {},
        lastModified: (await fs.stat(this.configPath)).mtime
      };
    } catch (error) {
      logWarn(logger, error as Error, 'Failed to load plugin metadata');
      return {};
    }
  }

  /**
   * Generate cleanup recommendations
   */
  generateRecommendations(analysis: Analysis): Recommendation[] {
    const recommendations: Recommendation[] = [];

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
   */
  addJob(options: { detailed?: boolean } = {}): Job {
    const jobId = `plugin-audit-${Date.now()}`;
    return this.createJob(jobId, {
      detailed: options.detailed ?? false
    });
  }
}

export { PluginManagerWorker };
