/**
 * SQLite Database for Job History Persistence
 *
 * Stores job history to survive server restarts.
 * Located at: data/jobs.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createComponentLogger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createComponentLogger('Database');

// Database path - in project root/data directory
const DB_PATH = path.join(__dirname, '../../data/jobs.db');

let db = null;

/**
 * Initialize the database connection and create tables
 */
export function initDatabase() {
  if (db) return db;

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      data TEXT,
      result TEXT,
      error TEXT,
      git TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_id ON jobs(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
  `);

  logger.info({ dbPath: DB_PATH }, 'Database initialized');

  return db;
}

/**
 * Get database instance (initializes if needed)
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Save a job to the database
 */
export function saveJob(job) {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO jobs
    (id, pipeline_id, status, created_at, started_at, completed_at, data, result, error, git)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    job.id,
    job.pipelineId || 'duplicate-detection',
    job.status,
    job.createdAt || new Date().toISOString(),
    job.startedAt || null,
    job.completedAt || null,
    job.data ? JSON.stringify(job.data) : null,
    job.result ? JSON.stringify(job.result) : null,
    job.error ? JSON.stringify(job.error) : null,
    job.git ? JSON.stringify(job.git) : null
  );

  logger.debug({ jobId: job.id, status: job.status }, 'Job saved to database');
}

/**
 * Get jobs for a pipeline with filtering and pagination
 */
export function getJobs(pipelineId, options = {}) {
  const db = getDatabase();
  const { status, limit = 10, offset = 0, tab } = options;

  let query = 'SELECT * FROM jobs WHERE pipeline_id = ?';
  const params = [pipelineId];

  // Filter by status
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  } else if (tab === 'failed') {
    query += ' AND status = ?';
    params.push('failed');
  }

  // Order by created_at descending (newest first)
  query += ' ORDER BY created_at DESC';

  // Apply pagination
  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);

  // Parse JSON fields
  return rows.map(row => ({
    id: row.id,
    pipelineId: row.pipeline_id,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    data: row.data ? JSON.parse(row.data) : null,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error ? JSON.parse(row.error) : null,
    git: row.git ? JSON.parse(row.git) : null
  }));
}

/**
 * Get job counts for a pipeline
 */
export function getJobCounts(pipelineId) {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued
    FROM jobs
    WHERE pipeline_id = ?
  `);

  return stmt.get(pipelineId);
}

/**
 * Get the most recent job for a pipeline
 */
export function getLastJob(pipelineId) {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM jobs
    WHERE pipeline_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const row = stmt.get(pipelineId);

  if (!row) return null;

  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    data: row.data ? JSON.parse(row.data) : null,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error ? JSON.parse(row.error) : null,
    git: row.git ? JSON.parse(row.git) : null
  };
}

/**
 * Import existing reports into the database
 */
export async function importReportsToDatabase(reportsDir) {
  const fs = await import('fs');
  const db = getDatabase();

  if (!fs.existsSync(reportsDir)) {
    logger.warn({ reportsDir }, 'Reports directory not found');
    return 0;
  }

  const files = fs.readdirSync(reportsDir)
    .filter(f => f.endsWith('-summary.json'));

  let imported = 0;

  for (const file of files) {
    try {
      const filePath = path.join(reportsDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const stats = fs.statSync(filePath);

      // Extract date from filename (e.g., inter-project-scan-2repos-2025-11-24-summary.json)
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = dateMatch ? dateMatch[1] : stats.mtime.toISOString().split('T')[0];

      // Create job ID from filename
      const jobId = file.replace('-summary.json', '');

      // Check if already imported
      const existing = db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId);
      if (existing) continue;

      // Import as completed job
      saveJob({
        id: jobId,
        pipelineId: 'duplicate-detection',
        status: 'completed',
        createdAt: `${dateStr}T00:00:00.000Z`,
        startedAt: `${dateStr}T00:00:00.000Z`,
        completedAt: stats.mtime.toISOString(),
        data: {
          scanType: content.scanType || 'inter-project',
          repositories: content.repositories || []
        },
        result: {
          totalDuplicates: content.totalDuplicates || 0,
          totalBlocks: content.totalBlocks || 0,
          scanDuration: content.scanDuration || null,
          reportPath: filePath
        }
      });

      imported++;
    } catch (err) {
      logger.error({ file, error: err.message }, 'Failed to import report');
    }
  }

  logger.info({ imported, total: files.length }, 'Imported existing reports');
  return imported;
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database closed');
  }
}

export default {
  initDatabase,
  getDatabase,
  saveJob,
  getJobs,
  getJobCounts,
  getLastJob,
  importReportsToDatabase,
  closeDatabase
};
