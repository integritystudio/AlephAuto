/**
 * PGlite Test Helper
 *
 * Provides an in-process PostgreSQL instance for unit tests via PGlite.
 * Each test suite gets an isolated database — no external PG server needed.
 */

import { PGlite } from '@electric-sql/pglite';

/** Schema DDL shared between test helper and production database.ts */
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

let client: PGlite | null = null;

/**
 * Create a fresh PGlite instance and run the schema DDL.
 * Returns a connection string that database.ts can use.
 */
export async function createTestDatabase(): Promise<PGlite> {
  // PGlite uses in-memory by default when no path is given
  client = new PGlite();
  await client.exec(SCHEMA_SQL);
  return client;
}

/**
 * Get the active PGlite instance. Throws if not initialized.
 */
export function getTestClient(): PGlite {
  if (!client) {
    throw new Error('Test database not initialized. Call createTestDatabase() first.');
  }
  return client;
}

/**
 * Truncate all rows from the jobs table (fast reset between tests).
 */
export async function truncateJobs(): Promise<void> {
  if (client) {
    await client.exec('DELETE FROM jobs');
  }
}

/**
 * Close and destroy the PGlite instance.
 */
export async function destroyTestDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
