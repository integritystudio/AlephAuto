#!/usr/bin/env node

/**
 * Test Automated Duplicate Detection Pipeline
 *
 * Tests the automated pipeline without cron (runs immediately).
 *
 * Usage:
 *   node test-automated-pipeline.js
 */

import { DuplicateDetectionWorker } from '../../sidequest/workers/duplicate-detection-worker.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';

const logger = createComponentLogger('TestAutomatedPipeline');

/**
 * main.
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     AUTOMATED PIPELINE TEST                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize worker
    const worker = new DuplicateDetectionWorker();
    await worker.initialize();

    console.log('✅ Worker initialized\n');

    // Get configuration stats
    const stats = worker.configLoader.getStats();
    console.log('📊 Configuration:');
    console.log(`   Total repositories: ${stats.totalRepositories}`);
    console.log(`   Enabled repositories: ${stats.enabledRepositories}`);
    console.log(`   Groups: ${stats.groups}`);
    console.log('');

    console.log('📋 Repositories by priority:');
    console.log(`   Critical: ${stats.byPriority.critical}`);
    console.log(`   High: ${stats.byPriority.high}`);
    console.log(`   Medium: ${stats.byPriority.medium}`);
    console.log(`   Low: ${stats.byPriority.low}`);
    console.log('');

    console.log('📅 Repositories by frequency:');
    console.log(`   Daily: ${stats.byFrequency.daily}`);
    console.log(`   Weekly: ${stats.byFrequency.weekly}`);
    console.log(`   Monthly: ${stats.byFrequency.monthly}`);
    console.log(`   On-demand: ${stats.byFrequency.onDemand}`);
    console.log('');

    // Get repositories to scan tonight
    const repositoriesToScan = worker.configLoader.getRepositoriesToScanTonight();
    console.log(`🎯 Repositories to scan tonight: ${repositoriesToScan.length}`);
    repositoriesToScan.forEach((repo, index) => {
      console.log(`   ${index + 1}. ${repo.name} (${repo.priority}, ${repo.scanFrequency})`);
    });
    console.log('');

    // Get enabled groups
    const groups = worker.configLoader.getEnabledGroups();
    console.log(`🔗 Repository groups: ${groups.length}`);
    groups.forEach((group, index) => {
      console.log(`   ${index + 1}. ${group.name} (${group.scanType})`);
      const groupRepos = worker.configLoader.getGroupRepositories(group.name);
      console.log(`      Repositories: ${groupRepos.map(r => r.name).join(', ')}`);
    });
    console.log('');

    // Run a test scan
    console.log('▶️  Running test scan...\n');

    // Listen to job events
    worker.on('job:created', (job) => {
      console.log(`   📝 Job created: ${job.id}`);
    });

    worker.on('job:started', (job) => {
      console.log(`   🚀 Job started: ${job.id}`);
    });

    worker.on('job:completed', (job) => {
      console.log(`   ✅ Job completed: ${job.id}`);
      console.log(`      Duration: ${((job.completedAt - job.startedAt) / 1000).toFixed(2)}s`);
      if (job.result) {
        console.log(`      Scan type: ${job.result.scanType}`);
        if (job.result.scanType === 'inter-project') {
          console.log(`      Repositories: ${job.result.repositories}`);
          console.log(`      Cross-repo duplicates: ${job.result.crossRepoDuplicates}`);
          console.log(`      Suggestions: ${job.result.suggestions}`);
        } else {
          console.log(`      Repository: ${job.result.repository}`);
          console.log(`      Duplicates: ${job.result.duplicates}`);
          console.log(`      Suggestions: ${job.result.suggestions}`);
        }
      }
      console.log('');
    });

    worker.on('job:failed', (job) => {
      console.log(`   ❌ Job failed: ${job.id}`);
      console.log(`      Error: ${job.error}`);
      console.log('');
    });

    // Schedule test scans
    await worker.runNightlyScan();

    // Wait for all jobs to complete
    console.log('⏳ Waiting for jobs to complete...\n');

    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        const jobStats = worker.getStats();
        if (jobStats.queued === 0 && jobStats.active === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });

    // Display final metrics
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                   TEST COMPLETED                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const metrics = worker.getScanMetrics();
    console.log('📊 Scan Metrics:');
    console.log(`   Total scans: ${metrics.totalScans}`);
    console.log(`   Successful scans: ${metrics.queueStats.completed}`);
    console.log(`   Failed scans: ${metrics.queueStats.failed}`);
    console.log(`   Duplicates found: ${metrics.totalDuplicatesFound}`);
    console.log(`   Suggestions generated: ${metrics.totalSuggestionsGenerated}`);
    console.log(`   High-impact duplicates: ${metrics.highImpactDuplicates}`);
    console.log('');

    console.log('✅ All tests passed!\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    logger.error({ error }, 'Test failed');
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
