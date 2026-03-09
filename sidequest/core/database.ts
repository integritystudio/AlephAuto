/**
 * SQLite Database for Job History Persistence
 *
 * Uses better-sqlite3 (native file-based SQLite) for multi-process access.
 * With WAL mode, both API server and worker processes read/write the same
 * data/jobs.db file concurrently.
 *
 * Located at: data/jobs.db
 */

import Database from 'better-sqlite3';
type DatabaseType = InstanceType<typeof Database>;
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createComponentLogger, logMetrics } from '../utils/logger.ts';
import { isValidJobStatus } from '#api/types/job-status.ts';
import { DATABASE, LIMITS, PAGINATION, VALIDATION } from './constants.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createComponentLogger('Database');

// Database path - in project root/data directory
const DB_PATH = path.join(__dirname, '../../data/jobs.db');

let db: DatabaseType | null = null;
let activePath = DB_PATH;

/** Raw row shape from the jobs table (snake_case, JSON strings) */
export interface JobRow {
  id: string;
  pipeline_id: string;
  status: string;
  data: string | null;
  result: string | null;
  error: string | null;
  git: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Parsed job error shape (matches Job.error in server.ts) */
export interface ParsedJobError {
  message: string;
  stack?: string;
  code?: string;
  cancelled?: boolean;
}

/** Runtime type guard for ParsedJobError */
function isParsedJobError(value: unknown): value is ParsedJobError {
  if (value === null || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>)['message'] === 'string';
}

/** Parsed job object returned by query functions (camelCase, parsed JSON) */
export interface ParsedJob {
  id: string;
  pipelineId: string;
  status: string;
  data: unknown;
  result: unknown;
  error: ParsedJobError | null;
  git: unknown;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** Options for getJobs query */
export interface JobQueryOptions {
  status?: string;
  limit?: number;
  offset?: number;
  tab?: string;
  includeTotal?: boolean;
}

/** Options for getAllJobs query */
export interface AllJobsQueryOptions {
  status?: string;
  limit?: number;
  offset?: number;
}

/** Job count result per pipeline */
export interface JobCounts {
  total: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
}

/** Pipeline stats row */
export interface PipelineStats {
  pipelineId: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
  lastRun: string | null;
}

/** Bulk import result */
export interface BulkImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Health status */
export interface HealthStatus {
  initialized: boolean;
  degradedMode: boolean;
  persistenceWorking: boolean;
  persistFailureCount: number;
  recoveryAttempts: number;
  queuedWrites: number;
  queueStalenessMs: number;
  dbPath: string;
  dbSizeBytes: number;
  memoryPressure: string;
  status: string;
  message: string;
}

/** Input job object for saveJob (accepts camelCase) */
export interface SaveJobInput {
  id: string;
  pipelineId?: string;
  status: string;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  data?: unknown;
  result?: unknown;
  error?: unknown;
  git?: unknown;
}

/** Input job for bulk import (accepts both snake_case and camelCase) */
export interface BulkImportJob {
  id: string;
  /** @deprecated Use pipelineId instead */
  pipeline_id?: string;
  pipelineId?: string;
  status: string;
  /** @deprecated Use createdAt instead */
  created_at?: string;
  createdAt?: string;
  /** @deprecated Use startedAt instead */
  started_at?: string | null;
  startedAt?: string | null;
  /** @deprecated Use completedAt instead */
  completed_at?: string | null;
  completedAt?: string | null;
  data?: unknown;
  result?: unknown;
  error?: unknown;
  git?: unknown;
}

/**
 * Safely parse JSON with fallback on error
 */
function safeJsonParse(str: string | null, fallback: unknown = null): unknown {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (error) {
    logger.error({ error: (error as Error).message, preview: str.substring(0, LIMITS.LOG_PREVIEW_CHARS) }, 'Failed to parse JSON from database');
    return fallback;
  }
}

/**
 * Serialize a value for JSON TEXT storage.
 * Preserves falsy primitives (`0`, `false`, `''`) and only maps `undefined` to SQL NULL.
 */
function serializeJsonForStorage(value: unknown): string | null {
  if (value === undefined) return null;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : serialized;
}

/** Convert a JobRow to a ParsedJob */
function rowToParsedJob(row: JobRow): ParsedJob {
  const rawError = safeJsonParse(row.error);
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    data: safeJsonParse(row.data),
    result: safeJsonParse(row.result),
    error: isParsedJobError(rawError) ? rawError : null,
    git: safeJsonParse(row.git),
  };
}

/**
 * Initialize better-sqlite3 database with WAL mode
 * Must be called before any database operations
 *
 * @param dbPath Optional database path override.
 * @returns Initialized database instance.
 */
export async function initDatabase(dbPath?: string): Promise<DatabaseType> {
  if (db) return db;

  const targetPath = dbPath ?? DB_PATH;

  try {
    // Ensure data directory exists (skip for in-memory databases)
    if (targetPath !== ':memory:') {
      const dataDir = path.dirname(targetPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    }

    // Open file-based database (creates if not exists)
    db = new Database(targetPath);
    activePath = targetPath;

    // Enable WAL mode for concurrent multi-process access (file-based only)
    if (targetPath !== ':memory:') {
      db.pragma('journal_mode = WAL');
    }
    // Wait up to 5s for locks instead of failing immediately
    db.pragma(`busy_timeout = ${DATABASE.BUSY_TIMEOUT_MS}`);

    // Create jobs table if not exists
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
      )
    `);

    // Create indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_id ON jobs(pipeline_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)');
    // Composite index for efficient pipeline+status queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_status ON jobs(pipeline_id, status)');

    logger.info({ dbPath: targetPath }, 'Database initialized with WAL mode');
    return db;
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to initialize database');
    throw error;
  }
}

/**
 * Get database instance (initializes if needed)
 * Note: This is synchronous but requires initDatabase() to be called first
 *
 * @returns Initialized database instance.
 */
export function getDatabase(): DatabaseType {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Check if database is initialized
 *
 * @returns `true` when a database instance is ready.
 */
export function isDatabaseReady(): boolean {
  return db !== null;
}

/**
 * Save a job to the database
 *
 * @param job Job payload to persist.
 */
export function saveJob(job: SaveJobInput): void {
  if (!isValidJobId(job.id)) {
    throw new Error(`Invalid job ID format: ${job.id} (must be alphanumeric with hyphens/underscores, max 100 chars)`);
  }

  const database = getDatabase();

  database.prepare(`
    INSERT OR REPLACE INTO jobs
    (id, pipeline_id, status, created_at, started_at, completed_at, data, result, error, git)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id,
    job.pipelineId ?? 'unknown',
    job.status,
    job.createdAt ?? new Date().toISOString(),
    job.startedAt ?? null,
    job.completedAt ?? null,
    serializeJsonForStorage(job.data),
    serializeJsonForStorage(job.result),
    serializeJsonForStorage(job.error),
    serializeJsonForStorage(job.git)
  );

  logger.debug({ jobId: job.id, status: job.status }, 'Job saved to database');
}

/**
 * Execute a query and return all results as objects
 */
function queryAll(sql: string, params: (string | number)[] = []): JobRow[] {
  const database = getDatabase();
  return database.prepare(sql).all(...params) as JobRow[];
}

/**
 * Execute a query and return the first result as object
 */
function queryOne<T = Record<string, unknown>>(sql: string, params: (string | number)[] = []): T | null {
  const database = getDatabase();
  return (database.prepare(sql).get(...params) as T | undefined) ?? null;
}

/**
 * Get jobs for a pipeline with filtering and pagination
 *
 * @param pipelineId Pipeline identifier.
 * @param options Query options.
 * @returns Job array or `{ jobs, total }` when `includeTotal` is enabled.
 */
export function getJobs(pipelineId: string, options: JobQueryOptions = {}): ParsedJob[] | { jobs: ParsedJob[]; total: number } {
  const { status, limit = PAGINATION.DEFAULT_QUERY_LIMIT, offset = 0, tab, includeTotal = false } = options;

  // Build count query (only if includeTotal requested)
  let totalCount: number | null = null;
  if (includeTotal) {
    let countQuery = 'SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?';
    const countParams: (string | number)[] = [pipelineId];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    } else if (tab === 'failed') {
      countQuery += ' AND status = ?';
      countParams.push('failed');
    }

    const countResult = queryOne<{ count: number }>(countQuery, countParams);
    totalCount = countResult?.count ?? 0;
  }

  // Build data query
  let query = 'SELECT * FROM jobs WHERE pipeline_id = ?';
  const params: (string | number)[] = [pipelineId];

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
  const jobs = rows.map(rowToParsedJob);

  // Return with or without total count based on includeTotal option
  if (includeTotal) {
    return { jobs, total: totalCount ?? 0 };
  } else {
    return jobs;  // Backward compatible - just return array
  }
}

/**
 * Get a single job by ID
 *
 * @param id Job identifier.
 * @returns Parsed job or `null` when not found.
 */
export function getJobById(id: string): ParsedJob | null {
  const row = queryOne<JobRow>('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!row) return null;
  return rowToParsedJob(row);
}

/**
 * Get total job count with optional status filter
 *
 * @param options Optional status filter.
 * @returns Count of matching jobs.
 */
export function getJobCount(options: { status?: string } = {}): number {
  const { status } = options;

  let query = 'SELECT COUNT(*) as count FROM jobs';
  const params: (string | number)[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  const result = queryOne<{ count: number }>(query, params);
  return result?.count ?? 0;
}

/**
 * Get all jobs across all pipelines
 *
 * @param options Query options.
 * @returns Matching parsed jobs.
 */
export function getAllJobs(options: AllJobsQueryOptions = {}): ParsedJob[] {
  const { status, limit = PAGINATION.DEFAULT_ALL_LIMIT, offset = 0 } = options;

  let query = 'SELECT * FROM jobs';
  const params: (string | number)[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = queryAll(query, params);
  return rows.map(rowToParsedJob);
}

/**
 * Get job counts for a pipeline
 *
 * @param pipelineId Pipeline identifier.
 * @returns Aggregate counts or `null` when no rows exist.
 */
export function getJobCounts(pipelineId: string): JobCounts | null {
  return queryOne<JobCounts>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued
    FROM jobs
    WHERE pipeline_id = ?
  `, [pipelineId]);
}

/**
 * Get the most recent job for a pipeline
 *
 * @param pipelineId Pipeline identifier.
 * @returns Most recent parsed job or `null`.
 */
export function getLastJob(pipelineId: string): ParsedJob | null {
  const row = queryOne<JobRow>(`
    SELECT * FROM jobs
    WHERE pipeline_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [pipelineId]);

  if (!row) return null;
  return rowToParsedJob(row);
}

/**
 * Get all pipelines with job statistics
 *
 * @returns Pipeline-level aggregate stats.
 */
export function getAllPipelineStats(): PipelineStats[] {
  const database = getDatabase();
  return database.prepare(`
    SELECT
      pipeline_id AS pipelineId,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
      MAX(completed_at) AS lastRun
    FROM jobs
    GROUP BY pipeline_id
    ORDER BY pipeline_id
  `).all() as PipelineStats[];
}

/**
 * Import existing reports into the database
 *
 * @param reportsDir Directory containing summary report JSON files.
 * @returns Number of imported report jobs.
 */
export async function importReportsToDatabase(reportsDir: string): Promise<number> {
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
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
      const stats = fs.statSync(filePath);

      // Extract date from filename (e.g., inter-project-scan-2repos-2025-11-24-summary.json)
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = dateMatch ? dateMatch[1] : stats.mtime.toISOString().split('T')[0];

      // Create job ID from filename (sanitize for isValidJobId)
      const jobId = file.replace('-summary.json', '').replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, VALIDATION.JOB_ID_MAX_LENGTH);

      // Check if already imported
      const existing = queryOne<{ id: string }>('SELECT id FROM jobs WHERE id = ?', [jobId]);
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
      logger.error({ file, error: (err as Error).message }, 'Failed to import report');
    }
  }

  logMetrics(logger, 'report import', { imported, total: files.length });
  return imported;
}

/**
 * Import job logs from sidequest/logs directory
 *
 * @param logsDir Directory containing log JSON files.
 * @returns Number of imported log jobs.
 */
export async function importLogsToDatabase(logsDir: string): Promise<number> {
  if (!fs.existsSync(logsDir)) {
    logger.warn({ logsDir }, 'Logs directory not found');
    return 0;
  }

  const files = fs.readdirSync(logsDir)
    .filter(f => f.endsWith('.json'));

  let imported = 0;

  // Map filename prefixes to pipeline IDs
  const pipelineMap: Record<string, string> = {
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
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
      const stats = fs.statSync(filePath);

      // Extract pipeline type from filename
      let pipelineId = 'unknown';
      for (const [prefix, id] of Object.entries(pipelineMap)) {
        if (file.startsWith(prefix)) {
          pipelineId = id;
          break;
        }
      }

      // Create job ID from filename (sanitize for isValidJobId)
      const jobId = file.replace('.json', '').replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, VALIDATION.JOB_ID_MAX_LENGTH);

      // Check if already imported
      const existing = queryOne<{ id: string }>('SELECT id FROM jobs WHERE id = ?', [jobId]);
      if (existing) continue;

      // Determine status from content
      const status = content.error ? 'failed' : 'completed';

      // Import job
      saveJob({
        id: jobId,
        pipelineId,
        status,
        createdAt: (content.startTime as string) || stats.mtime.toISOString(),
        startedAt: (content.startTime as string) || stats.mtime.toISOString(),
        completedAt: (content.endTime as string) || stats.mtime.toISOString(),
        data: content.parameters || content.config || {},
        result: content.result || content.summary || content,
        error: content.error || null
      });

      imported++;
    } catch (err) {
      logger.error({ file, error: (err as Error).message }, 'Failed to import log');
    }
  }

  logMetrics(logger, 'log import', { imported, total: files.length });
  return imported;
}

/**
 * Get database health status with comprehensive metrics
 *
 * @returns Current database health snapshot.
 */
export function getHealthStatus(): HealthStatus {
  let dbSizeBytes = 0;
  if (db && activePath !== ':memory:') {
    try {
      dbSizeBytes = fs.statSync(activePath).size;
    } catch {
      dbSizeBytes = -1;
    }
  }

  return {
    initialized: db !== null,
    degradedMode: false,
    persistenceWorking: db !== null,
    persistFailureCount: 0,
    recoveryAttempts: 0,
    queuedWrites: 0,
    queueStalenessMs: 0,
    dbPath: activePath,
    dbSizeBytes,
    memoryPressure: 'normal',
    status: db ? 'healthy' : 'not_initialized',
    message: db
      ? 'Database healthy - WAL mode, direct disk writes'
      : 'Database not initialized'
  };
}

/**
 * Close the database connection
 *
 * Safely closes the active SQLite connection and resets internal state.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    activePath = DB_PATH;
    logger.info('Database closed');
  }
}

/**
 * Validate job ID format to prevent injection attacks
 */
function isValidJobId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return VALIDATION.JOB_ID_PATTERN.test(id);
}

/**
 * Bulk import jobs (for database migration)
 * Skips jobs that already exist (by ID)
 *
 * @param jobs Jobs to import.
 * @returns Import summary including skipped records and validation errors.
 */
export function bulkImportJobs(jobs: BulkImportJob[]): BulkImportResult {
  const database = getDatabase();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const insertStmt = database.prepare(`
    INSERT INTO jobs
    (id, pipeline_id, status, created_at, started_at, completed_at, data, result, error, git)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const checkStmt = database.prepare('SELECT id FROM jobs WHERE id = ?');

  const importAll = database.transaction(() => {
    for (const job of jobs) {
      try {
        // Validate job ID format
        if (!isValidJobId(job.id)) {
          errors.push(`Job ${job.id}: Invalid job ID format (must be alphanumeric with hyphens/underscores, max 100 chars)`);
          continue;
        }

        // Validate job status
        if (!isValidJobStatus(job.status)) {
          errors.push(`Job ${job.id}: Invalid status '${job.status}'`);
          continue;
        }

        // Check if job already exists
        const existing = checkStmt.get(job.id);
        if (existing) {
          skipped++;
          continue;
        }

        insertStmt.run(
          job.id,
          job.pipeline_id || job.pipelineId || 'unknown',
          job.status,
          job.created_at || job.createdAt || new Date().toISOString(),
          job.started_at ?? job.startedAt ?? null,
          job.completed_at ?? job.completedAt ?? null,
          typeof job.data === 'string' ? job.data : serializeJsonForStorage(job.data),
          typeof job.result === 'string' ? job.result : serializeJsonForStorage(job.result),
          typeof job.error === 'string' ? job.error : serializeJsonForStorage(job.error),
          typeof job.git === 'string' ? job.git : serializeJsonForStorage(job.git)
        );
        imported++;
      } catch (error) {
        errors.push(`Job ${job.id}: ${(error as Error).message}`);
      }
    }
  });

  importAll();

  logMetrics(logger, 'bulk import', { imported, skipped, errorCount: errors.length });
  return { imported, skipped, errors };
}

export default {
  initDatabase,
  getDatabase,
  isDatabaseReady,
  saveJob,
  getJobById,
  getJobCount,
  getJobs,
  getAllJobs,
  getJobCounts,
  getLastJob,
  getAllPipelineStats,
  importReportsToDatabase,
  importLogsToDatabase,
  bulkImportJobs,
  closeDatabase,
  getHealthStatus
};
