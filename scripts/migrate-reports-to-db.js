#!/usr/bin/env node
/**
 * Migrate existing scan reports and logs to SQLite database
 *
 * This script imports historical scan reports from output/reports
 * and job logs from sidequest/logs into the jobs SQLite database.
 */

import { importReportsToDatabase, importLogsToDatabase, initDatabase } from '../sidequest/core/database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../output/reports');
const LOGS_DIR = path.join(__dirname, '../sidequest/logs');

async function main() {
  console.log('Initializing database...');
  initDatabase();

  console.log(`\nImporting scan reports from: ${REPORTS_DIR}`);
  const reportsImported = await importReportsToDatabase(REPORTS_DIR);

  console.log(`\nImporting job logs from: ${LOGS_DIR}`);
  const logsImported = await importLogsToDatabase(LOGS_DIR);

  console.log(`\nMigration complete:`);
  console.log(`  - Scan reports: ${reportsImported} jobs`);
  console.log(`  - Job logs: ${logsImported} jobs`);
  console.log(`  - Total: ${reportsImported + logsImported} jobs`);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
