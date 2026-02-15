#!/usr/bin/env node
/**
 * Database Migration Script
 *
 * Migrates job data from local SQLite database to Render deployment.
 *
 * Usage:
 *   # Set the migration API key in Doppler first:
 *   doppler secrets set MIGRATION_API_KEY "your-secure-key" -c prd
 *
 *   # Run with Doppler (uses MIGRATION_API_KEY from env):
 *   doppler run -- node scripts/migrate-db-to-render.js
 *
 *   # Or provide key directly:
 *   MIGRATION_API_KEY=your-key node scripts/migrate-db-to-render.js
 *
 *   # Dry run (preview only):
 *   doppler run -- node scripts/migrate-db-to-render.js --dry-run
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const LOCAL_DB_PATH = path.join(__dirname, '..', 'data', 'jobs.db');
const RENDER_API_URL = process.env.RENDER_API_URL || 'https://alephauto.onrender.com';
const MIGRATION_API_KEY = process.env.MIGRATION_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

async function loadLocalDatabase() {
  console.log(`📂 Loading local database from: ${LOCAL_DB_PATH}`);

  if (!fs.existsSync(LOCAL_DB_PATH)) {
    throw new Error(`Local database not found: ${LOCAL_DB_PATH}`);
  }

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(LOCAL_DB_PATH);
  const db = new SQL.Database(buffer);

  return db;
}

function extractJobs(db) {
  console.log('📊 Extracting jobs from local database...');

  const result = db.exec(`
    SELECT
      id,
      pipeline_id,
      status,
      created_at,
      started_at,
      completed_at,
      data,
      result,
      error,
      git
    FROM jobs
    ORDER BY created_at ASC
  `);

  if (!result.length || !result[0].values.length) {
    return [];
  }

  const columns = result[0].columns;
  const jobs = result[0].values.map(row => {
    const job = {};
    columns.forEach((col, i) => {
      job[col] = row[i];
    });
    return job;
  });

  console.log(`   Found ${jobs.length} jobs`);

  // Group by pipeline for summary
  const byPipeline = {};
  for (const job of jobs) {
    const pid = job.pipeline_id || 'unknown';
    byPipeline[pid] = (byPipeline[pid] || 0) + 1;
  }

  console.log('   Jobs by pipeline:');
  for (const [pipeline, count] of Object.entries(byPipeline)) {
    console.log(`     - ${pipeline}: ${count}`);
  }

  return jobs;
}

async function checkRenderHealth() {
  console.log(`\n🔍 Checking Render API health: ${RENDER_API_URL}`);

  try {
    const response = await fetch(`${RENDER_API_URL}/health`);
    const data = await response.json();

    if (data.status === 'healthy') {
      console.log('   ✅ Render API is healthy');
      return true;
    } else {
      console.log(`   ⚠️ Render API status: ${data.status}`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Failed to connect to Render API: ${error.message}`);
    return false;
  }
}

async function checkExistingJobs() {
  console.log('\n📋 Checking existing jobs on Render...');

  try {
    const response = await fetch(`${RENDER_API_URL}/api/status`);
    const data = await response.json();

    const totalJobs = data.pipelines?.reduce((sum, p) =>
      sum + (p.completedJobs || 0) + (p.failedJobs || 0), 0) || 0;

    console.log(`   Found ${totalJobs} existing jobs on Render`);

    if (data.pipelines?.length) {
      console.log('   Existing pipelines:');
      for (const pipeline of data.pipelines) {
        console.log(`     - ${pipeline.name}: ${pipeline.completedJobs || 0} completed, ${pipeline.failedJobs || 0} failed`);
      }
    }

    return totalJobs;
  } catch (error) {
    console.error(`   ⚠️ Could not check existing jobs: ${error.message}`);
    return 0;
  }
}

async function importJobsToRender(jobs) {
  console.log(`\n📤 Importing ${jobs.length} jobs to Render...`);

  if (DRY_RUN) {
    console.log('   🔸 DRY RUN - No changes will be made');
    console.log('   Would import:');
    for (const job of jobs.slice(0, 5)) {
      console.log(`     - ${job.id} (${job.pipeline_id}): ${job.status}`);
    }
    if (jobs.length > 5) {
      console.log(`     ... and ${jobs.length - 5} more`);
    }
    return { imported: 0, skipped: 0, errors: [], dryRun: true };
  }

  try {
    const response = await fetch(`${RENDER_API_URL}/api/jobs/bulk-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobs,
        apiKey: MIGRATION_API_KEY
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `HTTP ${response.status}`);
    }

    return data.data;
  } catch (error) {
    console.error(`   ❌ Import failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AlephAuto Database Migration: Local → Render');
  console.log('═══════════════════════════════════════════════════════════');

  if (DRY_RUN) {
    console.log('\n🔸 DRY RUN MODE - No changes will be made\n');
  }

  // Validate API key
  if (!DRY_RUN && !MIGRATION_API_KEY) {
    console.error('\n❌ MIGRATION_API_KEY environment variable is required');
    console.error('   Set it in Doppler: doppler secrets set MIGRATION_API_KEY "your-key" -c prd');
    console.error('   Then run: doppler run -- node scripts/migrate-db-to-render.js');
    process.exit(1);
  }

  try {
    // Load local database
    const db = await loadLocalDatabase();

    // Extract jobs
    const jobs = extractJobs(db);

    if (jobs.length === 0) {
      console.log('\n⚠️ No jobs to migrate');
      process.exit(0);
    }

    // Check Render health
    const isHealthy = await checkRenderHealth();
    if (!isHealthy && !DRY_RUN) {
      console.error('\n❌ Render API is not healthy. Aborting migration.');
      process.exit(1);
    }

    // Check existing jobs
    await checkExistingJobs();

    // Import jobs
    const result = await importJobsToRender(jobs);

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Migration Summary');
    console.log('═══════════════════════════════════════════════════════════');

    if (result.dryRun) {
      console.log(`  Mode:     DRY RUN (no changes made)`);
      console.log(`  Would import: ${jobs.length} jobs`);
    } else {
      console.log(`  Imported: ${result.imported} jobs`);
      console.log(`  Skipped:  ${result.skipped} jobs (already exist)`);
      if (result.errors?.length) {
        console.log(`  Errors:   ${result.errors.length}`);
        for (const err of result.errors.slice(0, 5)) {
          console.log(`    - ${err}`);
        }
      }
    }

    console.log('═══════════════════════════════════════════════════════════');

    if (!result.dryRun && result.imported > 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log(`   View dashboard: ${RENDER_API_URL.replace('alephauto.onrender.com', 'n0ai.app')}`);
    }

    // Close database
    db.close();

  } catch (error) {
    console.error(`\n❌ Migration failed: ${error.message}`);
    process.exit(1);
  }
}

main();
