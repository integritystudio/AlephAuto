/**
 * SchemaEnhancementWorker - Enhances README files with Schema.org markup
 */

import { SidequestServer, type Job, type SidequestServerOptions } from '../core/server.ts';
import { SchemaMCPTools } from '../utils/schema-mcp-tools.js';
import { generateReport } from '../utils/report-generator.js';
import { createComponentLogger } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('SchemaEnhancementWorker');

// Type definitions

interface SchemaEnhancementWorkerOptions extends SidequestServerOptions {
  outputBaseDir?: string;
  dryRun?: boolean;
  gitWorkflowEnabled?: boolean;
  gitBranchPrefix?: string;
  gitBaseBranch?: string;
  gitDryRun?: boolean;
}

interface EnhancementJobData {
  readmePath: string;
  relativePath: string;
  repositoryPath: string | null;
  repository: string | null;
  context: Record<string, unknown>;
  type?: string;
}

interface SchemaValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface SchemaImpact {
  impactScore: number;
  rating: string;
  seoImprovements: string[];
  richResultsEligibility: string[];
  timestamp: string;
  schemaType: string;
  metrics: Record<string, unknown>;
}

interface SchemaObject {
  '@context'?: string;
  '@type'?: string;
  [key: string]: unknown;
}

interface EnhancementResult {
  status: string;
  reason?: string;
  readmePath: string;
  relativePath: string;
  schemaType?: string;
  schema?: SchemaObject;
  impact?: SchemaImpact;
  validation?: SchemaValidation;
  timestamp?: string;
  reportPaths?: unknown;
}

interface ReadmeInfo {
  fullPath: string;
  relativePath: string;
  dirPath: string;
}

interface EnhancementStats {
  enhanced: number;
  skipped: number;
  failed: number;
  total: number;
  successRate: string | number;
}

interface EnhancementSummary {
  timestamp: string;
  enhancement: EnhancementStats;
  jobs: unknown;
  outputDirectory: string;
}

export class SchemaEnhancementWorker extends SidequestServer {
  outputBaseDir: string;
  mcpTools: SchemaMCPTools;
  dryRun: boolean;
  stats: {
    enhanced: number;
    skipped: number;
    failed: number;
  };

  constructor(options: SchemaEnhancementWorkerOptions = {}) {
    // Enable git workflow with schema-specific settings
    super({
      ...options,
      jobType: 'schema-enhancement',
      gitWorkflowEnabled: options.gitWorkflowEnabled ?? config.enableGitWorkflow,
      gitBranchPrefix: options.gitBranchPrefix ?? config.gitBranchPrefix ?? 'docs',
      gitBaseBranch: options.gitBaseBranch ?? config.gitBaseBranch,
      gitDryRun: options.gitDryRun ?? config.gitDryRun
    });

    this.outputBaseDir = options.outputBaseDir ?? './document-enhancement-impact-measurement';
    this.mcpTools = new SchemaMCPTools(options);
    this.dryRun = options.dryRun ?? false;
    this.stats = {
      enhanced: 0,
      skipped: 0,
      failed: 0,
    };
  }

  /**
   * Run enhancement for a specific README file
   */
  async runJobHandler(job: Job): Promise<EnhancementResult> {
    const startTime = Date.now();
    const { readmePath, relativePath, context } = job.data as unknown as EnhancementJobData;

    logger.info({ jobId: job.id, readmePath }, 'Enhancing README');

    try {
      // Read README content
      const originalContent = await fs.readFile(readmePath, 'utf-8');

      // Check if already has schema
      if (originalContent.includes('<script type="application/ld+json">')) {
        logger.info({ jobId: job.id }, 'Skipped - already has schema markup');
        this.stats.skipped++;
        return {
          status: 'skipped',
          reason: 'Already has schema markup',
          readmePath,
          relativePath,
        };
      }

      // Get appropriate schema type
      const schemaType = await this.mcpTools.getSchemaType(
        readmePath,
        originalContent,
        context
      ) as string;

      logger.info({ jobId: job.id, schemaType }, 'Schema type detected');

      // Generate schema markup
      const schema = await this.mcpTools.generateSchema(
        readmePath,
        originalContent,
        context,
        schemaType
      ) as SchemaObject;

      // Validate schema
      const validation = await this.mcpTools.validateSchema(schema) as SchemaValidation;
      if (!validation.valid) {
        throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        logger.warn({
          jobId: job.id,
          warnings: validation.warnings
        }, 'Schema validation warnings');
      }

      // Inject schema into content
      const enhancedContent = this.mcpTools.injectSchema(originalContent, schema) as string;

      // Analyze impact
      const impact = await this.mcpTools.analyzeSchemaImpact(
        originalContent,
        enhancedContent,
        schema
      ) as unknown as SchemaImpact;

      logger.info({
        jobId: job.id,
        impactScore: impact.impactScore,
        rating: impact.rating
      }, 'Impact analysis complete');

      // Save enhanced README
      if (!this.dryRun) {
        await fs.writeFile(readmePath, enhancedContent, 'utf-8');
        logger.info({ jobId: job.id }, 'Enhanced README saved');
      } else {
        logger.info({ jobId: job.id }, 'Dry run - no changes made');
      }

      // Save impact report
      await this.saveImpactReport(relativePath, schema, impact);

      // Save enhanced copy to output directory
      await this.saveEnhancedCopy(relativePath, enhancedContent);

      this.stats.enhanced++;

      const result: EnhancementResult = {
        status: 'enhanced',
        readmePath,
        relativePath,
        schemaType,
        schema,
        impact,
        validation,
        timestamp: new Date().toISOString(),
      };

      // Generate HTML/JSON reports
      const endTime = Date.now();
      const reportPaths = await generateReport({
        jobId: job.id,
        jobType: 'schema-enhancement',
        status: 'completed',
        result,
        startTime,
        endTime,
        parameters: job.data,
        metadata: {
          schemaType,
          impactScore: impact.impactScore,
          rating: impact.rating
        }
      });

      result.reportPaths = reportPaths;
      logger.info({ reportPaths }, 'Schema enhancement reports generated');

      return result;

    } catch (error) {
      this.stats.failed++;
      throw error;
    }
  }

  /**
   * Save impact report to output directory
   */
  async saveImpactReport(relativePath: string, schema: SchemaObject, impact: SchemaImpact): Promise<void> {
    const reportDir = path.join(
      this.outputBaseDir,
      'impact-reports',
      path.dirname(relativePath)
    );

    await fs.mkdir(reportDir, { recursive: true });

    const reportPath = path.join(
      reportDir,
      `${path.basename(relativePath, '.md')}-impact.json`
    );

    const report = {
      relativePath,
      schema,
      impact,
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  /**
   * Save enhanced copy to output directory
   */
  async saveEnhancedCopy(relativePath: string, enhancedContent: string): Promise<void> {
    const outputDir = path.join(
      this.outputBaseDir,
      'enhanced-readmes',
      path.dirname(relativePath)
    );

    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, path.basename(relativePath));

    await fs.writeFile(outputPath, enhancedContent, 'utf-8');
  }

  /**
   * Find git repository root from a directory path
   * Walks up the directory tree until .git is found
   */
  async findGitRoot(startPath: string): Promise<string | null> {
    let currentPath = startPath;
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      try {
        const gitPath = path.join(currentPath, '.git');
        const stats = await fs.stat(gitPath);

        if (stats.isDirectory()) {
          return currentPath;
        }
      } catch {
        // .git not found, continue up
      }

      currentPath = path.dirname(currentPath);
    }

    // No git repository found
    return null;
  }

  /**
   * Create an enhancement job for a README
   */
  async createEnhancementJob(readme: ReadmeInfo, context: Record<string, unknown>): Promise<Job> {
    const jobId = `schema-${readme.relativePath.replace(/\//g, '-')}-${Date.now()}`;

    // Find git repository root for this README
    const repositoryPath = await this.findGitRoot(readme.dirPath);

    return this.createJob(jobId, {
      readmePath: readme.fullPath,
      relativePath: readme.relativePath,
      repositoryPath, // Add repository path for git workflow
      repository: repositoryPath ? path.basename(repositoryPath) : null,
      context,
      type: 'schema-enhancement',
    });
  }

  /**
   * Generate commit message for schema enhancement
   */
  async _generateCommitMessage(job: Job): Promise<{ title: string; body: string }> {
    const { relativePath } = job.data as unknown as EnhancementJobData;
    const result = job.result as EnhancementResult | undefined;
    const impact = result?.impact;

    const title = `docs: add Schema.org structured data to ${path.basename(relativePath)}`;

    const bodyParts = [
      'Added Schema.org JSON-LD markup to enhance SEO and enable rich results.',
      ''
    ];

    if (result?.schemaType) {
      bodyParts.push(`- Schema type: ${result.schemaType}`);
    }

    if (impact) {
      bodyParts.push(
        `- Impact score: ${impact.impactScore}/100 (${impact.rating})`,
        `- ${impact.seoImprovements.length} SEO improvements: ${impact.seoImprovements.slice(0, 3).join(', ')}${impact.seoImprovements.length > 3 ? '...' : ''}`
      );

      if (impact.richResultsEligibility.length > 0) {
        bodyParts.push(`- Eligible for ${impact.richResultsEligibility.join(', ')} rich results in search engines`);
      }
    }

    return {
      title,
      body: bodyParts.join('\n')
    };
  }

  /**
   * Generate PR context for schema enhancement
   */
  async _generatePRContext(job: Job, commitMessage?: { title: string; body: string }): Promise<{
    branchName: string;
    title: string;
    body: string;
    labels: string[];
  }> {
    const msg = commitMessage ?? await this._generateCommitMessage(job);
    const { relativePath } = job.data as unknown as EnhancementJobData;
    const result = job.result as EnhancementResult | undefined;
    const impact = result?.impact;
    const schema = result?.schema;

    const bodyParts = [
      '## Summary',
      '',
      `This PR adds Schema.org structured data to \`${relativePath}\` to improve SEO and enable rich search results.`,
      ''
    ];

    if (impact) {
      bodyParts.push(
        '## Impact Analysis',
        '',
        `- **Impact Score**: ${impact.impactScore}/100 (${impact.rating})`,
        `- **SEO Improvements**: ${impact.seoImprovements.length}`,
        ''
      );

      if (impact.seoImprovements.length > 0) {
        bodyParts.push(
          '### SEO Enhancements',
          ...impact.seoImprovements.map(imp => `- ${imp}`),
          ''
        );
      }

      if (impact.richResultsEligibility.length > 0) {
        bodyParts.push(
          '### Rich Results Eligibility',
          ...impact.richResultsEligibility.map(r => `- ${r}`),
          ''
        );
      }
    }

    if (schema) {
      bodyParts.push(
        '## Schema Details',
        '',
        `- **Type**: \`${schema['@type']}\``,
        `- **Properties**: ${Object.keys(schema).length} properties defined`,
        ''
      );
    }

    bodyParts.push(
      '## Testing',
      '',
      '- [ ] Validate schema markup using [Google Rich Results Test](https://search.google.com/test/rich-results)',
      '- [ ] Verify structured data using [Schema.org validator](https://validator.schema.org/)',
      '',
      '---',
      '',
      'Generated with [Claude Code](https://claude.com/claude-code)'
    );

    return {
      branchName: job.git.branchName ?? '',
      title: msg.title,
      body: bodyParts.join('\n'),
      labels: ['documentation', 'seo', 'schema-org', 'automated']
    };
  }

  /**
   * Get enhancement statistics
   */
  getEnhancementStats(): EnhancementStats {
    return {
      ...this.stats,
      total: this.stats.enhanced + this.stats.skipped + this.stats.failed,
      successRate: this.stats.enhanced > 0
        ? ((this.stats.enhanced / (this.stats.enhanced + this.stats.failed)) * 100).toFixed(2)
        : 0,
    };
  }

  /**
   * Generate enhancement summary report
   */
  async generateSummaryReport(): Promise<EnhancementSummary> {
    const stats = this.getEnhancementStats();
    const jobStats = this.getStats();

    const summary: EnhancementSummary = {
      timestamp: new Date().toISOString(),
      enhancement: stats,
      jobs: jobStats,
      outputDirectory: this.outputBaseDir,
    };

    const summaryPath = path.join(
      this.outputBaseDir,
      `enhancement-summary-${Date.now()}.json`
    );

    await fs.mkdir(this.outputBaseDir, { recursive: true });
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    return summary;
  }
}
