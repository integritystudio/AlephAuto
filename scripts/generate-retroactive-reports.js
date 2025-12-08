#!/usr/bin/env node
/**
 * Generate Reports for All Existing Pipeline Jobs
 *
 * This script retroactively generates HTML and JSON reports for all
 * completed pipeline jobs that don't already have reports.
 */

import { initDatabase, getAllJobs, saveJob } from '../sidequest/core/database.js';
import { generateReport } from '../sidequest/utils/report-generator.js';
import { createComponentLogger } from '../sidequest/utils/logger.js';

const logger = createComponentLogger('RetroactiveReports');

/**
 * Get all completed jobs from all pipelines
 */
function getAllCompletedJobs() {
  // Use getAllJobs with status filter
  const rows = getAllJobs({ status: 'completed', limit: 1000 });

  return rows.map(row => ({
    id: row.id,
    pipelineId: row.pipeline_id,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    data: row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : {},
    result: row.result ? (typeof row.result === 'string' ? JSON.parse(row.result) : row.result) : {},
    error: row.error ? (typeof row.error === 'string' ? JSON.parse(row.error) : row.error) : null
  }));
}

/**
 * Check if job already has a report
 */
function hasReport(job) {
  // Check if result has reportPaths or reportPath
  if (job.result) {
    if (job.result.reportPaths || job.result.reportPath || job.result.report_paths) {
      return true;
    }
  }
  return false;
}

/**
 * Update job result with report paths
 */
function updateJobResult(jobId, job, reportPaths) {
  // Use saveJob to update the job with new result
  const updatedResult = {
    ...job.result,
    reportPaths
  };

  saveJob({
    id: jobId,
    pipelineId: job.pipelineId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    data: job.data,
    result: updatedResult,
    error: job.error
  });

  logger.info({ jobId, reportPaths }, 'Updated job result with report paths');
}

/**
 * Main execution
 */
async function main() {
  try {
    logger.info('Starting retroactive report generation');

    // Initialize database (async with sql.js)
    await initDatabase();

    // Get all completed jobs
    const jobs = getAllCompletedJobs();
    logger.info({ totalJobs: jobs.length }, 'Found completed jobs');

    // Filter to jobs without reports
    const jobsNeedingReports = jobs.filter(job => !hasReport(job));
    logger.info({ jobsNeedingReports: jobsNeedingReports.length }, 'Jobs needing reports');

    if (jobsNeedingReports.length === 0) {
      logger.info('No jobs need reports. All done!');
      return;
    }

    // Generate reports for each job
    let successCount = 0;
    let errorCount = 0;

    for (const job of jobsNeedingReports) {
      try {
        logger.info({ jobId: job.id, pipelineId: job.pipelineId }, 'Generating report');

        // Calculate start/end times from job data
        const startTime = job.startedAt ? new Date(job.startedAt).getTime() : new Date(job.createdAt).getTime();
        const endTime = job.completedAt ? new Date(job.completedAt).getTime() : Date.now();

        // Extract metadata from result
        const metadata = {};
        if (job.result) {
          // Try to extract common metadata fields
          const metadataFields = [
            'healthScore', 'criticalIssues', 'warnings',
            'reportType', 'filesGenerated',
            'totalRepositories', 'dryRun',
            'targetDir', 'totalItems',
            'repoName', 'outputSize',
            'schemaType', 'impactScore', 'rating'
          ];

          for (const field of metadataFields) {
            if (job.result[field] !== undefined) {
              metadata[field] = job.result[field];
            }
          }
        }

        // Generate report
        const reportPaths = await generateReport({
          jobId: job.id,
          jobType: job.pipelineId,
          status: job.status,
          result: job.result,
          startTime,
          endTime,
          parameters: job.data,
          metadata
        });

        // Update job in database
        updateJobResult(job.id, job, reportPaths);

        successCount++;
        logger.info({
          jobId: job.id,
          htmlReport: reportPaths.html
        }, 'Report generated successfully');

      } catch (error) {
        errorCount++;
        logger.error({
          error: error.message,
          jobId: job.id,
          pipelineId: job.pipelineId
        }, 'Failed to generate report');
      }
    }

    // Summary
    logger.info({
      total: jobsNeedingReports.length,
      success: successCount,
      errors: errorCount
    }, 'Report generation complete');

    console.log('\n📊 Summary:');
    console.log(`  Total jobs processed: ${jobsNeedingReports.length}`);
    console.log(`  ✅ Successfully generated: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`\n✨ Reports saved to: output/reports/\n`);

  } catch (error) {
    logger.error({ error }, 'Fatal error in retroactive report generation');
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
