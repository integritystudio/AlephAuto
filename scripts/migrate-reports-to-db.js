#!/usr/bin/env node
/**
 * Migrate existing scan reports to SQLite database
 *
 * This script imports historical scan reports from output/reports
 * into the jobs SQLite database for dashboard display.
 */

import { importReportsToDatabase, initDatabase } from '../sidequest/core/database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../output/reports');

async function main() {
  console.log('Initializing database...');
  initDatabase();

  console.log(`Importing reports from: ${REPORTS_DIR}`);
  const imported = await importReportsToDatabase(REPORTS_DIR);

  console.log(`\nMigration complete: ${imported} jobs imported`);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
