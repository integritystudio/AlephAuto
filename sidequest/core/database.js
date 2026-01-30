/**
 * SQLite Database for Job History Persistence
 *
 * Uses sql.js (pure JavaScript SQLite) for cross-platform compatibility.
 * No native bindings required - works on any platform.
 *
 * Located at: data/jobs.db
 */

import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createComponentLogger } from '../utils/logger.js';
import { config } from './config.js';
import { isValidJobStatus } from '../../api/types/job-status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createComponentLogger('Database');

// Database path - in project root/data directory
const DB_PATH = path.join(__dirname, '../../data/jobs.db');

let db = null;
let SQL = null;
let saveTimer = null;
let persistFailureCount = 0;
const MAX_PERSIST_FAILURES = 5;

/**
 * Safely parse JSON with fallback on error
 * Prevents crashes from corrupted database data
 *
 * @param {string|null} str - JSON string to parse
 * @param {*} fallback - Value to return on parse error
 * @returns {*} Parsed object or fallback
 */
function safeJsonParse(str, fallback = null) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (error) {
    logger.error({ error: error.message, preview: str.substring(0, 100) }, 'Failed to parse JSON from database');
    return fallback;
  }
}

/**
 * Initialize sql.js and the database
 * Must be called before any database operations
 */
export async function initDatabase() {
  if (db) return db;

  try {
    // Initialize sql.js (loads WASM)
    SQL = await initSqlJs();

    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
      logger.info({ dbPath: DB_PATH }, 'Database loaded from file');
    } else {
      db = new SQL.Database();
      logger.info({ dbPath: DB_PATH }, 'New database created');
    }

    // Create jobs table if not exists
    db.run(`
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
      )
    `);

    // Create indexes
    db.run('CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_id ON jobs(pipeline_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)');
    // Composite index for efficient pipeline+status queries
    db.run('CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_status ON jobs(pipeline_id, status)');

    // All initialization succeeded - now safe to start the save timer
    // Clear any existing timer to prevent memory leaks on re-initialization
    if (saveTimer) {
      clearInterval(saveTimer);
    }
    saveTimer = setInterval(() => {
      persistDatabase();
    }, config.database.saveIntervalMs);

    logger.info({ dbPath: DB_PATH }, 'Database initialized');
    return db;
  } catch (error) {
    // Don't leave timer running if init failed
    // (timer is only set after indexes, so this is defensive)
    if (saveTimer) {
      clearInterval(saveTimer);
      saveTimer = null;
    }
    logger.error({ error: error.message }, 'Failed to initialize database');
    throw error;
  }
}

/**
 * Persist database to file
 *
 * Includes failure tracking with circuit breaker to prevent infinite error logs
 * when disk is full or permissions are denied.
 */
function persistDatabase() {
  if (!db) return;

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    logger.debug({ dbPath: DB_PATH, size: buffer.length }, 'Database persisted to file');

    // Reset failure count on success
    persistFailureCount = 0;
  } catch (error) {
    persistFailureCount++;
    logger.error({
      error: error.message,
      failureCount: persistFailureCount,
      maxFailures: MAX_PERSIST_FAILURES
    }, 'Failed to persist database');

    // Stop auto-save after repeated failures to prevent infinite error logs
    if (persistFailureCount >= MAX_PERSIST_FAILURES) {
      logger.error('Database persistence failed too many times, stopping auto-save. Manual intervention required.');
      if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
      }
    }
  }
}

/**
 * Get database instance (initializes if needed)
 * Note: This is now synchronous but requires initDatabase() to be called first
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Check if database is initialized
 */
export function isDatabaseReady() {
  return db !== null;
}

/**
 * Save a job to the database
 */
export function saveJob(job) {
  const database = getDatabase();

  database.run(`
    INSERT OR REPLACE INTO jobs
    (id, pipeline_id, status, created_at, started_at, completed_at, data, result, error, git)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
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
  ]);

  // Persist immediately for important operations
  persistDatabase();

  logger.debug({ jobId: job.id, status: job.status }, 'Job saved to database');
}

/**
 * Execute a query and return all results as objects
 */
function queryAll(query, params = []) {
  const database = getDatabase();
  const stmt = database.prepare(query);
  stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Execute a query and return the first result as object
 */
function queryOne(query, params = []) {
  const database = getDatabase();
  const stmt = database.prepare(query);
  stmt.bind(params);

  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

/**
 * Get jobs for a pipeline with filtering and pagination
 *
 * @param {string} pipelineId - Pipeline identifier
 * @param {Object} options - Query options
 * @param {string} [options.status] - Filter by status
 * @param {number} [options.limit=10] - Max results per page
 * @param {number} [options.offset=0] - Pagination offset
 * @param {string} [options.tab] - Tab context (failed, recent, all)
 * @param {boolean} [options.includeTotal=false] - Include total count in response
 * @returns {Array|Object} Array of jobs, or {jobs: Array, total: number} if includeTotal=true
 */
export function getJobs(pipelineId, options = {}) {
  const { status, limit = 10, offset = 0, tab, includeTotal = false } = options;

  // Build count query (only if includeTotal requested)
  let totalCount = null;
  if (includeTotal) {
    let countQuery = 'SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?';
    const countParams = [pipelineId];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    } else if (tab === 'failed') {
      countQuery += ' AND status = ?';
      countParams.push('failed');
    }

    const countResult = queryOne(countQuery, countParams);
    totalCount = countResult?.count ?? 0;
  }

  // Build data query
  let query = 'SELECT * FROM jobs WHERE pipeline_id = ?';
  /** @type {Array<string|number>} */
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

  const rows = queryAll(query, params);

  // Parse JSON fields with safe fallback to prevent crashes from corrupted data
  const jobs = rows.map(row => ({
    id: row.id,
    pipelineId: row.pipeline_id,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    data: safeJsonParse(row.data),
    result: safeJsonParse(row.result),
    error: safeJsonParse(row.error),
    git: safeJsonParse(row.git)
  }));

  // Return with or without total count based on includeTotal option
  if (includeTotal) {
    return { jobs, total: totalCount };
  } else {
    return jobs;  // Backward compatible - just return array
  }
}

/**
 * Get all jobs across all pipelines
 */
export function getAllJobs(options = {}) {
  const { status, limit = 100, offset = 0 } = options;

  let query = 'SELECT * FROM jobs';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return queryAll(query, params);
}

/**
 * Get job counts for a pipeline
 */
export function getJobCounts(pipelineId) {
  const result = queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued
    FROM jobs
    WHERE pipeline_id = ?
  `, [pipelineId]);

  return result;
}

/**
 * Get the most recent job for a pipeline
 */
export function getLastJob(pipelineId) {
  const row = queryOne(`
    SELECT * FROM jobs
    WHERE pipeline_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [pipelineId]);

  if (!row) return null;

  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    data: safeJsonParse(row.data),
    result: safeJsonParse(row.result),
    error: safeJsonParse(row.error),
    git: safeJsonParse(row.git)
  };
}

/**
 * Get all pipelines with job statistics
 *
 * Returns statistics for ALL pipelines in the database, including job counts
 * by status and last run timestamp.
 *
 * @returns {Array<{pipeline_id: string, total: number, completed: number, failed: number, running: number, queued: number, last_run: string|null}>}
 */
export function getAllPipelineStats() {
  return queryAll(`
    SELECT
      pipeline_id,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
      MAX(completed_at) as last_run
    FROM jobs
    GROUP BY pipeline_id
    ORDER BY pipeline_id
  `);
}

/**
 * Import existing reports into the database
 */
export async function importReportsToDatabase(reportsDir) {
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
      const existing = queryOne('SELECT id FROM jobs WHERE id = ?', [jobId]);
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
 * Import job logs from sidequest/logs directory
 */
export async function importLogsToDatabase(logsDir) {
  if (!fs.existsSync(logsDir)) {
    logger.warn({ logsDir }, 'Logs directory not found');
    return 0;
  }

  const files = fs.readdirSync(logsDir)
    .filter(f => f.endsWith('.json'));

  let imported = 0;

  // Map filename prefixes to pipeline IDs
  const pipelineMap = {
    'git-activity': 'git-activity',
    'claude-health': 'claude-health',
    'plugin-audit': 'plugin-manager',
    'gitignore': 'gitignore-manager',
    'schema-enhancement': 'schema-enhancement',
    'doc-enhancement': 'schema-enhancement', // Legacy compatibility
    'repomix': 'repomix'
  };

  for (const file of files) {
    try {
      const filePath = path.join(logsDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const stats = fs.statSync(filePath);

      // Extract pipeline type from filename
      let pipelineId = 'unknown';
      for (const [prefix, id] of Object.entries(pipelineMap)) {
        if (file.startsWith(prefix)) {
          pipelineId = id;
          break;
        }
      }

      // Create job ID from filename
      const jobId = file.replace('.json', '');

      // Check if already imported
      const existing = queryOne('SELECT id FROM jobs WHERE id = ?', [jobId]);
      if (existing) continue;

      // Determine status from content
      const status = content.error ? 'failed' : 'completed';

      // Import job
      saveJob({
        id: jobId,
        pipelineId,
        status,
        createdAt: content.startTime || stats.mtime.toISOString(),
        startedAt: content.startTime || stats.mtime.toISOString(),
        completedAt: content.endTime || stats.mtime.toISOString(),
        data: content.parameters || content.config || {},
        result: content.result || content.summary || content,
        error: content.error || null
      });

      imported++;
    } catch (err) {
      logger.error({ file, error: err.message }, 'Failed to import log');
    }
  }

  logger.info({ imported, total: files.length }, 'Imported existing logs');
  return imported;
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }

  if (db) {
    // Persist before closing
    persistDatabase();
    db.close();
    db = null;
    logger.info('Database closed');
  }
}

/**
 * Validate job ID format to prevent injection attacks
 * Allows alphanumeric, hyphens, underscores, and periods
 * @param {string} id - Job ID to validate
 * @returns {boolean} True if valid
 */
function isValidJobId(id) {
  if (!id || typeof id !== 'string') return false;
  // Allow alphanumeric, hyphens, underscores, periods (common in UUIDs and timestamps)
  return /^[a-zA-Z0-9_.-]+$/.test(id) && id.length <= 255;
}

/**
 * Bulk import jobs (for database migration)
 * Skips jobs that already exist (by ID)
 * @param {Array} jobs - Array of job objects
 * @returns {{ imported: number, skipped: number, errors: string[] }}
 */
export function bulkImportJobs(jobs) {
  const database = getDatabase();
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const job of jobs) {
    try {
      // Validate job ID format
      if (!isValidJobId(job.id)) {
        errors.push(`Job ${job.id}: Invalid job ID format (must be alphanumeric with hyphens/underscores, max 255 chars)`);
        continue;
      }

      // Validate job status
      if (!isValidJobStatus(job.status)) {
        errors.push(`Job ${job.id}: Invalid status '${job.status}'`);
        continue;
      }

      // Check if job already exists
      const existing = queryOne('SELECT id FROM jobs WHERE id = ?', [job.id]);
      if (existing) {
        skipped++;
        continue;
      }

      database.run(`
        INSERT INTO jobs
        (id, pipeline_id, status, created_at, started_at, completed_at, data, result, error, git)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        job.id,
        job.pipeline_id || job.pipelineId || 'unknown',
        job.status,
        job.created_at || job.createdAt || new Date().toISOString(),
        job.started_at || job.startedAt || null,
        job.completed_at || job.completedAt || null,
        typeof job.data === 'string' ? job.data : (job.data ? JSON.stringify(job.data) : null),
        typeof job.result === 'string' ? job.result : (job.result ? JSON.stringify(job.result) : null),
        typeof job.error === 'string' ? job.error : (job.error ? JSON.stringify(job.error) : null),
        typeof job.git === 'string' ? job.git : (job.git ? JSON.stringify(job.git) : null)
      ]);
      imported++;
    } catch (error) {
      errors.push(`Job ${job.id}: ${error.message}`);
    }
  }

  // Persist after bulk import
  persistDatabase();

  logger.info({ imported, skipped, errorCount: errors.length }, 'Bulk import completed');
  return { imported, skipped, errors };
}

export default {
  initDatabase,
  getDatabase,
  isDatabaseReady,
  saveJob,
  getJobs,
  getAllJobs,
  getJobCounts,
  getLastJob,
  getAllPipelineStats,
  importReportsToDatabase,
  importLogsToDatabase,
  bulkImportJobs,
  closeDatabase
};
