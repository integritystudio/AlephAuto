#!/usr/bin/env node

/**
 * Error Log Cleanup Script
 *
 * Automatically archives and removes old error log files from the logs directory.
 * Designed to run as a weekly cron job to prevent log file accumulation.
 *
 * Features:
 * - Archives error logs older than retention period
 * - Compresses archived logs
 * - Deletes archived files after extended retention
 * - Generates cleanup summary reports
 * - Dry-run mode for testing
 *
 * Usage:
 *   node scripts/cleanup-error-logs.js                    # Normal cleanup
 *   node scripts/cleanup-error-logs.js --dry-run          # Preview without changes
 *   node scripts/cleanup-error-logs.js --retention 14    # Custom retention days
 *   node scripts/cleanup-error-logs.js --help             # Show help
 *
 * Cron setup (weekly, Sunday 3 AM):
 *   0 3 * * 0 cd /path/to/jobs && node scripts/cleanup-error-logs.js
 */

import fs from 'fs/promises';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { createComponentLogger } from '../sidequest/logger.js';

const logger = createComponentLogger('ErrorLogCleanup');

// Configuration
const DEFAULT_RETENTION_DAYS = 7;      // Keep error logs for 7 days
const ARCHIVE_RETENTION_DAYS = 30;     // Keep archives for 30 days
const LOGS_BASE_DIR = path.join(process.cwd(), 'logs');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    dryRun: false,
    retentionDays: DEFAULT_RETENTION_DAYS,
    help: false,
    verbose: false
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--dry-run' || arg === '-d') {
      args.dryRun = true;
    } else if (arg === '--retention' || arg === '-r') {
      args.retentionDays = parseInt(process.argv[++i], 10);
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Error Log Cleanup Script

Automatically archives and removes old error log files.

Usage:
  node scripts/cleanup-error-logs.js [options]

Options:
  --dry-run, -d         Preview changes without modifying files
  --retention N, -r N   Set retention period in days (default: ${DEFAULT_RETENTION_DAYS})
  --verbose, -v         Show detailed output
  --help, -h            Show this help message

Examples:
  node scripts/cleanup-error-logs.js
  node scripts/cleanup-error-logs.js --dry-run
  node scripts/cleanup-error-logs.js --retention 14
  node scripts/cleanup-error-logs.js -d -v

Cron Setup (weekly, Sunday 3 AM):
  0 3 * * 0 cd /path/to/jobs && node scripts/cleanup-error-logs.js
`);
}

/**
 * Get file age in days
 */
async function getFileAgeDays(filePath) {
  const stats = await fs.stat(filePath);
  const ageMs = Date.now() - stats.mtimeMs;
  return ageMs / (1000 * 60 * 60 * 24);
}

/**
 * Compress a file using gzip
 */
async function compressFile(inputPath, outputPath) {
  const gzip = createGzip();
  const source = createReadStream(inputPath);
  const destination = createWriteStream(outputPath);

  await pipeline(source, gzip, destination);
}

/**
 * Scan directory for error log files
 */
async function scanErrorLogs(baseDir) {
  const errorLogs = [];

  async function scanDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.name.endsWith('.error.json')) {
        const age = await getFileAgeDays(fullPath);
        const size = (await fs.stat(fullPath)).size;

        errorLogs.push({
          path: fullPath,
          name: entry.name,
          ageDays: age,
          sizeBytes: size,
          directory: path.relative(baseDir, dir)
        });
      }
    }
  }

  await scanDir(baseDir);
  return errorLogs;
}

/**
 * Scan for archived logs
 */
async function scanArchivedLogs(archiveDir) {
  try {
    await fs.access(archiveDir);
  } catch {
    return [];
  }

  const archivedLogs = [];
  const entries = await fs.readdir(archiveDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.endsWith('.gz')) {
      const fullPath = path.join(archiveDir, entry.name);
      const age = await getFileAgeDays(fullPath);
      const size = (await fs.stat(fullPath)).size;

      archivedLogs.push({
        path: fullPath,
        name: entry.name,
        ageDays: age,
        sizeBytes: size
      });
    }
  }

  return archivedLogs;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Archive old error logs
 */
async function archiveOldLogs(errorLogs, retentionDays, dryRun, verbose) {
  const archiveDir = path.join(LOGS_BASE_DIR, 'archive');
  const toArchive = errorLogs.filter(log => log.ageDays > retentionDays);

  if (toArchive.length === 0) {
    console.log('✓ No error logs need archiving');
    return { archived: 0, totalSize: 0 };
  }

  if (!dryRun) {
    await fs.mkdir(archiveDir, { recursive: true });
  }

  let archivedCount = 0;
  let totalSize = 0;

  for (const log of toArchive) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const archiveName = `${path.basename(log.name, '.json')}-${timestamp}.json.gz`;
    const archivePath = path.join(archiveDir, archiveName);

    if (dryRun) {
      if (verbose) {
        console.log(`  [DRY RUN] Would archive: ${log.name} (${log.ageDays.toFixed(1)} days old)`);
      }
    } else {
      try {
        await compressFile(log.path, archivePath);
        await fs.unlink(log.path);

        if (verbose) {
          console.log(`  ✓ Archived: ${log.name} → ${archiveName}`);
        }

        archivedCount++;
        totalSize += log.sizeBytes;
      } catch (error) {
        logger.error({ error, file: log.name }, 'Failed to archive error log');
      }
    }
  }

  const action = dryRun ? '[DRY RUN] Would archive' : 'Archived';
  console.log(`${action} ${toArchive.length} error logs (${formatBytes(totalSize)})`);

  return { archived: archivedCount, totalSize };
}

/**
 * Delete very old archives
 */
async function deleteOldArchives(archivedLogs, retentionDays, dryRun, verbose) {
  const toDelete = archivedLogs.filter(log => log.ageDays > retentionDays);

  if (toDelete.length === 0) {
    console.log('✓ No old archives need deletion');
    return { deleted: 0, totalSize: 0 };
  }

  let deletedCount = 0;
  let totalSize = 0;

  for (const log of toDelete) {
    if (dryRun) {
      if (verbose) {
        console.log(`  [DRY RUN] Would delete: ${log.name} (${log.ageDays.toFixed(1)} days old)`);
      }
    } else {
      try {
        await fs.unlink(log.path);

        if (verbose) {
          console.log(`  ✓ Deleted: ${log.name}`);
        }

        deletedCount++;
        totalSize += log.sizeBytes;
      } catch (error) {
        logger.error({ error, file: log.name }, 'Failed to delete archived log');
      }
    }
  }

  const action = dryRun ? '[DRY RUN] Would delete' : 'Deleted';
  console.log(`${action} ${toDelete.length} old archives (${formatBytes(totalSize)})`);

  return { deleted: deletedCount, totalSize };
}

/**
 * Main cleanup function
 */
async function cleanup(options) {
  console.log('\n🧹 Error Log Cleanup\n');
  console.log('='.repeat(50));
  console.log(`Retention period: ${options.retentionDays} days`);
  console.log(`Archive retention: ${ARCHIVE_RETENTION_DAYS} days`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('='.repeat(50));
  console.log('');

  // Scan for error logs
  console.log('📂 Scanning for error logs...');
  const errorLogs = await scanErrorLogs(LOGS_BASE_DIR);
  console.log(`Found ${errorLogs.length} error log files\n`);

  if (options.verbose && errorLogs.length > 0) {
    const byAge = {
      recent: errorLogs.filter(log => log.ageDays <= options.retentionDays).length,
      old: errorLogs.filter(log => log.ageDays > options.retentionDays).length
    };
    console.log(`  Recent (≤${options.retentionDays} days): ${byAge.recent}`);
    console.log(`  Old (>${options.retentionDays} days): ${byAge.old}\n`);
  }

  // Archive old logs
  const archiveResult = await archiveOldLogs(
    errorLogs,
    options.retentionDays,
    options.dryRun,
    options.verbose
  );

  // Scan for archived logs
  const archiveDir = path.join(LOGS_BASE_DIR, 'archive');
  const archivedLogs = await scanArchivedLogs(archiveDir);

  if (archivedLogs.length > 0) {
    console.log(`\n📦 Found ${archivedLogs.length} archived logs`);

    // Delete very old archives
    const deleteResult = await deleteOldArchives(
      archivedLogs,
      ARCHIVE_RETENTION_DAYS,
      options.dryRun,
      options.verbose
    );

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary');
    console.log('='.repeat(50));
    console.log(`Error logs archived: ${archiveResult.archived}`);
    console.log(`Old archives deleted: ${deleteResult.deleted}`);
    console.log(`Total space reclaimed: ${formatBytes(archiveResult.totalSize + deleteResult.totalSize)}`);

    if (options.dryRun) {
      console.log('\n⚠️  This was a dry run - no files were modified');
    }
  } else {
    console.log('\n' + '='.repeat(50));
    console.log('✅ Cleanup complete!');
    console.log('='.repeat(50));
  }

  console.log('');
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  try {
    await cleanup(options);
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Cleanup failed');
    console.error('\n❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { cleanup, scanErrorLogs };
