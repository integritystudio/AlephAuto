import { SidequestServer } from '../core/server.ts';
import { SchemaMCPTools } from '../utils/schema-mcp-tools.js';
import { generateReport } from '../utils/report-generator.js';
import { createComponentLogger } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('SchemaEnhancementWorker');

/**
 * SchemaEnhancementWorker - Enhances README files with Schema.org markup
 */
export class SchemaEnhancementWorker extends SidequestServer {
  constructor(options = {}) {
    // Enable git workflow with schema-specific settings
    super({
      ...options,
      jobType: 'schema-enhancement',
      gitWorkflowEnabled: options.gitWorkflowEnabled ?? config.enableGitWorkflow,
      gitBranchPrefix: options.gitBranchPrefix || config.gitBranchPrefix || 'docs',
      gitBaseBranch: options.gitBaseBranch || config.gitBaseBranch,
      gitDryRun: options.gitDryRun ?? config.gitDryRun
    });

    this.outputBaseDir = options.outputBaseDir || './document-enhancement-impact-measurement';
    this.mcpTools = new SchemaMCPTools(options);
    this.dryRun = options.dryRun || false;
    this.stats = {
      enhanced: 0,
      skipped: 0,
      failed: 0,
    };
  }

  /**
   * Run enhancement for a specific README file
   */
  async runJobHandler(job) {
    const startTime = Date.now();
    const { readmePath, relativePath, context } = job.data;

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
      );

      logger.info({ jobId: job.id, schemaType }, 'Schema type detected');

      // Generate schema markup
      const schema = await this.mcpTools.generateSchema(
        readmePath,
        originalContent,
        context,
        schemaType
      );

      // Validate schema
      const validation = await this.mcpTools.validateSchema(schema);
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
      const enhancedContent = this.mcpTools.injectSchema(originalContent, schema);

      // Analyze impact
      const impact = await this.mcpTools.analyzeSchemaImpact(
        originalContent,
        enhancedContent,
        schema
      );

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

      const result = {
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
  async saveImpactReport(relativePath, schema, impact) {
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
  async saveEnhancedCopy(relativePath, enhancedContent) {
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
   * @private
   */
  async findGitRoot(startPath) {
    let currentPath = startPath;
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      try {
        const gitPath = path.join(currentPath, '.git');
        const stats = await fs.stat(gitPath);

        if (stats.isDirectory()) {
          return currentPath;
        }
      } catch (error) {
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
  async createEnhancementJob(readme, context) {
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
   * @override
   * @protected
   */
  async _generateCommitMessage(job) {
    const { relativePath, context } = job.data;
    const impact = job.result?.impact;

    const title = `docs: add Schema.org structured data to ${path.basename(relativePath)}`;

    const bodyParts = [
      'Added Schema.org JSON-LD markup to enhance SEO and enable rich results.',
      ''
    ];

    if (job.result?.schemaType) {
      bodyParts.push(`- Schema type: ${job.result.schemaType}`);
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
   * @override
   * @protected
   */
  async _generatePRContext(job) {
    const commitMessage = await this._generateCommitMessage(job);
    const { relativePath, repository } = job.data;
    const impact = job.result?.impact;
    const schema = job.result?.schema;

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
          ...impact.richResultsEligibility.map(result => `- ${result}`),
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
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)'
    );

    return {
      branchName: job.git.branchName,
      title: commitMessage.title,
      body: bodyParts.join('\n'),
      labels: ['documentation', 'seo', 'schema-org', 'automated']
    };
  }

  /**
   * Get enhancement statistics
   */
  getEnhancementStats() {
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
  async generateSummaryReport() {
    const stats = this.getEnhancementStats();
    const jobStats = this.getStats();

    const summary = {
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
