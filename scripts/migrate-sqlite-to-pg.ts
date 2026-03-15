/**
 * One-time SQLite → PostgreSQL data migration script.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node --strip-types scripts/migrate-sqlite-to-pg.ts [path-to-sqlite.db]
 *
 * Idempotent: uses ON CONFLICT (id) DO NOTHING so it can be re-run safely.
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import { SCHEMA_SQL } from '../sidequest/core/database.ts';

const BATCH_SIZE = 100;

const COLUMNS = [
  'id', 'pipeline_id', 'status', 'created_at',
  'started_at', 'completed_at', 'data', 'result', 'error', 'git',
] as const;

const PLACEHOLDERS = COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
const INSERT_SQL = `INSERT INTO jobs (${COLUMNS.join(', ')}) VALUES (${PLACEHOLDERS}) ON CONFLICT (id) DO NOTHING`;

async function main(): Promise<void> {
  const sqlitePath = process.argv[2] ?? 'data/jobs.db';
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // --- Source: SQLite ---
  console.log(`Opening SQLite: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });
  const sourceCount = (sqlite.prepare('SELECT COUNT(*) AS count FROM jobs').get() as { count: number }).count;
  console.log(`Source rows: ${sourceCount}`);

  if (sourceCount === 0) {
    console.log('Nothing to migrate.');
    sqlite.close();
    return;
  }

  // --- Target: PostgreSQL ---
  console.log('Connecting to PostgreSQL...');
  const pool = new pg.Pool({ connectionString: databaseUrl });

  // Ensure schema exists
  await pool.query(SCHEMA_SQL);
  console.log('Schema verified.');

  // --- Read all rows ---
  const rows = sqlite.prepare('SELECT * FROM jobs').all() as Record<string, unknown>[];

  // --- Batch insert ---
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of batch) {
        const values = COLUMNS.map(col => row[col] ?? null);
        const result = await client.query(INSERT_SQL, values);
        if (result.rowCount && result.rowCount > 0) {
          inserted++;
        } else {
          skipped++;
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows processed`);
  }

  // --- Verify ---
  const targetResult = await pool.query('SELECT COUNT(*) AS count FROM jobs');
  const targetCount = Number(targetResult.rows[0].count);

  console.log('\n--- Migration Summary ---');
  console.log(`Source (SQLite):  ${sourceCount}`);
  console.log(`Target (PG):     ${targetCount}`);
  console.log(`Inserted:        ${inserted}`);
  console.log(`Skipped (dupes): ${skipped}`);

  if (targetCount < sourceCount) {
    console.warn(`WARNING: Target has fewer rows than source (${targetCount} < ${sourceCount})`);
  } else {
    console.log('Migration complete.');
  }

  // --- Cleanup ---
  sqlite.close();
  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
