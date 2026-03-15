/**
 * PGlite Test Helper
 *
 * Provides an in-process PostgreSQL instance for unit tests via PGlite.
 * Each test suite gets an isolated database — no external PG server needed.
 */

import { PGlite } from '@electric-sql/pglite';
import { SCHEMA_SQL } from '../../sidequest/core/database.ts';

export { SCHEMA_SQL };

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
