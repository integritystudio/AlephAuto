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
const SIDEQUEST_LOGS_DIR = path.join(__dirname, '../sidequest/logs');
const ROOT_LOGS_DIR = path.join(__dirname, '../logs');

async function main() {
  console.log('Initializing database...');
  await initDatabase();

  console.log(`\nImporting scan reports from: ${REPORTS_DIR}`);
  const reportsImported = await importReportsToDatabase(REPORTS_DIR);

  console.log(`\nImporting sidequest logs from: ${SIDEQUEST_LOGS_DIR}`);
  const sidequestLogsImported = await importLogsToDatabase(SIDEQUEST_LOGS_DIR);

  console.log(`\nImporting root logs from: ${ROOT_LOGS_DIR}`);
  const rootLogsImported = await importLogsToDatabase(ROOT_LOGS_DIR);

  console.log(`\nMigration complete:`);
  console.log(`  - Scan reports: ${reportsImported} jobs`);
  console.log(`  - Sidequest logs: ${sidequestLogsImported} jobs`);
  console.log(`  - Root logs: ${rootLogsImported} jobs`);
  console.log(`  - Total: ${reportsImported + sidequestLogsImported + rootLogsImported} jobs`);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
