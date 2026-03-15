/**
 * PostgreSQL Database for Job History Persistence
 *
 * Uses pg (node-postgres) for production and PGlite for in-process testing.
 * Connection string starting with `pglite://` triggers PGlite mode.
 */

import pg from 'pg';
import type { Pool, QueryResultRow } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import path from 'path';
import fsPromises from 'fs/promises';
import { fileURLToPath } from 'url';
import { createComponentLogger, logMetrics } from '../utils/logger.ts';
import { isValidJobStatus } from '#api/types/job-status.ts';
import type { JobStatus } from '#api/types/job-status.ts';
import { LIMITS, PAGINATION, VALIDATION } from './constants.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createComponentLogger('Database');

const DEFAULT_CONNECTION_STRING =
  process.env.DATABASE_URL ||
  `postgresql://localhost:5432/${process.env.PGDATABASE ?? 'jobs'}`;

/** Common interface satisfied by both pg.Pool and PGlite */
interface QueryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  /** Release all resources held by this executor. */
  close(): Promise<void>;
}

/** PGlite adapter that normalises its return shape to match pg.Pool */
class PGliteAdapter implements QueryExecutor {
  private readonly lite: PGlite;

  constructor(lite: PGlite) {
    this.lite = lite;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    const result = await this.lite.query<T>(sql, params);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }

  async close(): Promise<void> {
    await this.lite.close();
  }
}

/** pg.Pool adapter that normalises the lifecycle interface to match QueryExecutor */
class PgPoolAdapter implements QueryExecutor {
  private readonly pgPool: Pool;

  constructor(pgPool: Pool) {
    this.pgPool = pgPool;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount?: number | null }> {
    return this.pgPool.query<T>(sql, params as unknown[]);
  }

  async close(): Promise<void> {
    await this.pgPool.end();
  }
}

export const SCHEMA_SQL = `
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
  CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_status ON jobs(pipeline_id, status);
`;

let pool: QueryExecutor | null = null;

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
  /** Sort by completedAt DESC NULLS LAST, created_at DESC (activity feed order) */
  sortByCompletedAt?: boolean;
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
  persistenceWorking: boolean;
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

/** Attempt to parse a JSON string. Returns `{ ok: true, value }` or `{ ok: false, error }`. */
function tryParseJson(str: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Safely parse JSON with fallback on error
 */
function safeJsonParse(str: string | null, fallback: unknown = null): unknown {
  if (!str) return fallback;
  const result = tryParseJson(str);
  if (!result.ok) {
    logger.error({ error: result.error.message, preview: str.substring(0, LIMITS.LOG_PREVIEW_CHARS) }, 'Failed to parse JSON from database');
    return fallback;
  }
  return result.value;
}

/**
 * Returns true if the string is valid JSON (non-null, parseable).
 */
function isValidJsonString(str: string): boolean {
  return tryParseJson(str).ok;
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
 * Validate job ID format to prevent injection attacks
 */
function isValidJobId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return VALIDATION.JOB_ID_PATTERN.test(id);
}

/** Execute a query and return all result rows */
async function queryAll<T extends QueryResultRow = JobRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!pool) throw new Error('Database not initialized. Call initDatabase() first.');
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

/** Execute a query and return the first result row or null */
async function queryOne<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await queryAll<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Initialize PostgreSQL connection pool (or PGlite for test connections).
 * Returns Promise<void>. Singleton — second call is a no-op.
 *
 * @param connectionString Optional connection string override.
 *   Pass a `pglite://...` string to use PGlite (in-process, for tests).
 */
export async function initDatabase(connectionString?: string): Promise<void> {
  if (pool) return;

  const connStr = connectionString ?? DEFAULT_CONNECTION_STRING;

  try {
    if (connStr.startsWith('pglite://') || connStr === ':memory:') {
      const lite = new PGlite();
      await lite.exec(SCHEMA_SQL);
      pool = new PGliteAdapter(lite);
    } else {
      pg.types.setTypeParser(20, (val: string) => parseInt(val, 10));
      const pgPool = new pg.Pool({ connectionString: connStr });
      // Run schema DDL
      const client = await pgPool.connect();
      try {
        await client.query(SCHEMA_SQL);
      } finally {
        client.release();
      }
      pool = new PgPoolAdapter(pgPool);
    }

    logger.info({ connStr }, 'Database initialized');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to initialize database');
    throw error;
  }
}

/**
 * Check if database pool is initialized.
 *
 * @returns `true` when a pool is ready.
 */
export function isDatabaseReady(): boolean {
  return pool !== null;
}

/**
 * Close the database connection pool and reset singleton state.
 * Safe to call multiple times (no-op if already closed).
 *
 * @returns Promise<void>
 */
export async function closeDatabase(): Promise<void> {
  if (!pool) return;

  const current = pool;
  pool = null;

  try {
    await current.close();
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'Error closing database pool');
  }

  logger.info('Database closed');
}

/**
 * Save a job to the database
 *
 * @param job Job payload to persist.
 */
export async function saveJob(job: SaveJobInput): Promise<void> {
  if (!isValidJobId(job.id)) {
    throw new Error(`Invalid job ID format: ${job.id} (must be alphanumeric with hyphens/underscores, max 100 chars)`);
  }

  const jsonFields = { data: job.data, result: job.result, error: job.error, git: job.git } as const;
  const invalidField = Object.entries(jsonFields).find(
    ([, val]) => typeof val === 'string' && !isValidJsonString(val)
  );
  if (invalidField) {
    throw new Error(`Job ${job.id}: field '${invalidField[0]}' is a string but not valid JSON`);
  }

  await queryAll(`
    INSERT INTO jobs
      (id, pipeline_id, status, created_at, started_at, completed_at, data, result, error, git)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      pipeline_id  = EXCLUDED.pipeline_id,
      status       = EXCLUDED.status,
      created_at   = EXCLUDED.created_at,
      started_at   = EXCLUDED.started_at,
      completed_at = EXCLUDED.completed_at,
      data         = EXCLUDED.data,
      result       = EXCLUDED.result,
      error        = EXCLUDED.error,
      git          = EXCLUDED.git
  `, [
    job.id,
    job.pipelineId ?? 'unknown',
    job.status,
    job.createdAt ?? new Date().toISOString(),
    job.startedAt ?? null,
    job.completedAt ?? null,
    serializeJsonForStorage(job.data),
    serializeJsonForStorage(job.result),
    serializeJsonForStorage(job.error),
    serializeJsonForStorage(job.git),
  ]);

  logger.debug({ jobId: job.id, status: job.status }, 'Job saved to database');
}

/**
 * Get jobs for a pipeline with filtering and pagination
 *
 * @param pipelineId Pipeline identifier.
 * @param options Query options.
 * @returns Job array or `{ jobs, total }` when `includeTotal` is enabled.
 */
export async function getJobs(
  pipelineId: string,
  options: JobQueryOptions = {}
): Promise<ParsedJob[] | { jobs: ParsedJob[]; total: number }> {
  const { status, limit = PAGINATION.DEFAULT_QUERY_LIMIT, offset = 0, tab, includeTotal = false } = options;

  let totalCount: number | null = null;
  if (includeTotal) {
    let countQuery = 'SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = $1';
    const countParams: unknown[] = [pipelineId];

    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    } else if (tab === 'failed') {
      countQuery += ' AND status = $2';
      countParams.push('failed');
    }

    const countRow = await queryOne<{ count: number }>(countQuery, countParams);
    totalCount = countRow?.count ?? 0;
  }

  let query = 'SELECT * FROM jobs WHERE pipeline_id = $1';
  const params: unknown[] = [pipelineId];
  let paramIdx = 2;

  if (status) {
    query += ` AND status = $${paramIdx++}`;
    params.push(status);
  } else if (tab === 'failed') {
    query += ` AND status = $${paramIdx++}`;
    params.push('failed');
  }

  query += ' ORDER BY created_at DESC';
  query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(limit, offset);

  const rows = await queryAll<JobRow>(query, params);
  const jobs = rows.map(rowToParsedJob);

  if (includeTotal) {
    return { jobs, total: totalCount ?? 0 };
  }
  return jobs;
}

/**
 * Get a single job by ID
 *
 * @param id Job identifier.
 * @returns Parsed job or `null` when not found.
 */
export async function getJobById(id: string): Promise<ParsedJob | null> {
  const row = await queryOne<JobRow>('SELECT * FROM jobs WHERE id = $1', [id]);
  if (!row) return null;
  return rowToParsedJob(row);
}

/**
 * Get total job count with optional status filter
 *
 * @param options Optional status filter.
 * @returns Count of matching jobs.
 */
export async function getJobCount(options: { status?: string } = {}): Promise<number> {
  const { status } = options;

  let query = 'SELECT COUNT(*) as count FROM jobs';
  const params: unknown[] = [];

  if (status) {
    query += ' WHERE status = $1';
    params.push(status);
  }

  const result = await queryOne<{ count: number }>(query, params);
  return result?.count ?? 0;
}

/**
 * Bulk-cancel non-terminal jobs for a specific pipeline.
 *
 * @param pipelineId Pipeline identifier.
 * @param statuses Status values to target (e.g. ['queued', 'running']).
 * @returns Number of rows updated.
 */
export async function bulkCancelJobsByPipeline(pipelineId: string, statuses: JobStatus[]): Promise<number> {
  if (statuses.length === 0) return 0;
  const result = await pool!.query(
    `UPDATE jobs SET status = 'cancelled', completed_at = $1
     WHERE pipeline_id = $2 AND status = ANY($3::text[])`,
    [new Date().toISOString(), pipelineId, statuses]
  );
  return result.rowCount ?? 0;
}

/**
 * Get all jobs across all pipelines
 *
 * @param options Query options.
 * @returns Matching parsed jobs.
 */
export async function getAllJobs(options: AllJobsQueryOptions = {}): Promise<ParsedJob[]> {
  const { status, limit = PAGINATION.DEFAULT_ALL_LIMIT, offset = 0, sortByCompletedAt = false } = options;

  let query = 'SELECT * FROM jobs';
  const params: unknown[] = [];
  let paramIdx = 1;

  if (status) {
    query += ` WHERE status = $${paramIdx++}`;
    params.push(status);
  }

  // orderBy is hardcoded from two literal strings — not user-supplied. Safe from injection.
  const orderBy = sortByCompletedAt
    ? 'completed_at DESC NULLS LAST, created_at DESC'
    : 'created_at DESC';
  query += ` ORDER BY ${orderBy} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(limit, offset);

  const rows = await queryAll<JobRow>(query, params);
  return rows.map(rowToParsedJob);
}

/**
 * Get job counts for a pipeline
 *
 * @param pipelineId Pipeline identifier.
 * @returns Aggregate counts or `null` when no rows exist.
 */
export async function getJobCounts(pipelineId: string): Promise<JobCounts | null> {
  return queryOne<JobCounts>(`
    SELECT
      COUNT(*)::integer as total,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::integer as completed,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)::integer as failed,
      COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::integer as running,
      COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0)::integer as queued
    FROM jobs
    WHERE pipeline_id = $1
  `, [pipelineId]);
}

/**
 * Get the most recent job for a pipeline
 *
 * @param pipelineId Pipeline identifier.
 * @returns Most recent parsed job or `null`.
 */
export async function getLastJob(pipelineId: string): Promise<ParsedJob | null> {
  const row = await queryOne<JobRow>(`
    SELECT * FROM jobs
    WHERE pipeline_id = $1
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
export async function getAllPipelineStats(): Promise<PipelineStats[]> {
  return queryAll<PipelineStats>(`
    SELECT
      pipeline_id AS "pipelineId",
      COUNT(*)::integer as total,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::integer as completed,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)::integer as failed,
      COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::integer as running,
      COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0)::integer as queued,
      MAX(completed_at) AS "lastRun"
    FROM jobs
    GROUP BY pipeline_id
    ORDER BY pipeline_id
  `);
}

/**
 * Import existing reports into the database
 *
 * @param reportsDir Directory containing summary report JSON files.
 * @returns Number of imported report jobs.
 */
export async function importReportsToDatabase(reportsDir: string): Promise<number> {
  try {
    await fsPromises.access(reportsDir);
  } catch {
    logger.warn({ reportsDir }, 'Reports directory not found');
    return 0;
  }

  const entries = await fsPromises.readdir(reportsDir);
  const files = entries.filter(f => f.endsWith('-summary.json'));

  let imported = 0;

  for (const file of files) {
    try {
      const filePath = path.join(reportsDir, file);
      const raw = await fsPromises.readFile(filePath, 'utf8');
      const content = JSON.parse(raw) as Record<string, unknown>;
      const stats = await fsPromises.stat(filePath);

      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = dateMatch ? dateMatch[1] : stats.mtime.toISOString().split('T')[0];

      const jobId = file.replace('-summary.json', '').replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, VALIDATION.JOB_ID_MAX_LENGTH);

      const existing = await queryOne<{ id: string }>('SELECT id FROM jobs WHERE id = $1', [jobId]);
      if (existing) continue;

      await saveJob({
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
  try {
    await fsPromises.access(logsDir);
  } catch {
    logger.warn({ logsDir }, 'Logs directory not found');
    return 0;
  }

  const entries = await fsPromises.readdir(logsDir);
  const files = entries.filter(f => f.endsWith('.json'));

  let imported = 0;

  const pipelineMap: Record<string, string> = {
    'git-activity': 'git-activity',
    'claude-health': 'claude-health',
    'plugin-audit': 'plugin-manager',
    'gitignore': 'gitignore-manager',
    'schema-enhancement': 'schema-enhancement',
    'doc-enhancement': 'schema-enhancement',
    'repomix': 'repomix'
  };

  for (const file of files) {
    try {
      const filePath = path.join(logsDir, file);
      const raw = await fsPromises.readFile(filePath, 'utf8');
      const content = JSON.parse(raw) as Record<string, unknown>;
      const stats = await fsPromises.stat(filePath);

      let pipelineId = 'unknown';
      for (const [prefix, id] of Object.entries(pipelineMap)) {
        if (file.startsWith(prefix)) {
          pipelineId = id;
          break;
        }
      }

      const jobId = file.replace('.json', '').replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, VALIDATION.JOB_ID_MAX_LENGTH);

      const existing = await queryOne<{ id: string }>('SELECT id FROM jobs WHERE id = $1', [jobId]);
      if (existing) continue;

      const status = content.error ? 'failed' : 'completed';

      await saveJob({
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
  return {
    initialized: pool !== null,
    persistenceWorking: pool !== null,
    recoveryAttempts: 0,
    queuedWrites: 0,
    queueStalenessMs: 0,
    dbPath: DEFAULT_CONNECTION_STRING,
    dbSizeBytes: 0,
    memoryPressure: 'normal',
    status: pool ? 'healthy' : 'not_initialized',
    message: pool
      ? 'Database healthy - PostgreSQL connection pool active'
      : 'Database not initialized'
  };
}

/**
 * Bulk import jobs (for database migration)
 * Skips jobs that already exist (by ID)
 *
 * @param jobs Jobs to import.
 * @returns Import summary including skipped records and validation errors.
 */
export async function bulkImportJobs(jobs: BulkImportJob[]): Promise<BulkImportResult> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (!pool) throw new Error('Database not initialized. Call initDatabase() first.');

  for (const job of jobs) {
    try {
      if (!isValidJobId(job.id)) {
        errors.push(`Job ${job.id}: Invalid job ID format (must be alphanumeric with hyphens/underscores, max 100 chars)`);
        continue;
      }

      if (!isValidJobStatus(job.status)) {
        errors.push(`Job ${job.id}: Invalid status '${job.status}'`);
        continue;
      }

      const jsonFields = { data: job.data, result: job.result, error: job.error, git: job.git } as const;
      const invalidField = Object.entries(jsonFields).find(
        ([, val]) => typeof val === 'string' && !isValidJsonString(val)
      );
      if (invalidField) {
        errors.push(`Job ${job.id}: field '${invalidField[0]}' is a string but not valid JSON`);
        continue;
      }

      const existing = await queryOne<{ id: string }>('SELECT id FROM jobs WHERE id = $1', [job.id]);
      if (existing) {
        skipped++;
        continue;
      }

      await queryAll(`
        INSERT INTO jobs
          (id, pipeline_id, status, created_at, started_at, completed_at, data, result, error, git)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        job.id,
        job.pipeline_id || job.pipelineId || 'unknown',
        job.status,
        job.created_at || job.createdAt || new Date().toISOString(),
        job.started_at ?? job.startedAt ?? null,
        job.completed_at ?? job.completedAt ?? null,
        typeof job.data === 'string' ? job.data : serializeJsonForStorage(job.data),
        typeof job.result === 'string' ? job.result : serializeJsonForStorage(job.result),
        typeof job.error === 'string' ? job.error : serializeJsonForStorage(job.error),
        typeof job.git === 'string' ? job.git : serializeJsonForStorage(job.git),
      ]);
      imported++;
    } catch (error) {
      errors.push(`Job ${job.id}: ${(error as Error).message}`);
    }
  }

  logMetrics(logger, 'bulk import', { imported, skipped, errorCount: errors.length });
  return { imported, skipped, errors };
}

export default {
  initDatabase,
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
