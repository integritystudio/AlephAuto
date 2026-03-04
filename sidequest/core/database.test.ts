import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bulkImportJobs,
  closeDatabase,
  getDatabase,
  initDatabase,
  saveJob,
} from './database.ts';

interface RawJobJsonColumns {
  data: string | null;
  result: string | null;
  error: string | null;
  git: string | null;
}

function getRawJsonColumns(jobId: string): RawJobJsonColumns | null {
  const db = getDatabase();
  const row = db.prepare('SELECT data, result, error, git FROM jobs WHERE id = ?').get(jobId) as RawJobJsonColumns | undefined;
  return row ?? null;
}

test('saveJob preserves falsy JSON values instead of coercing to null', async (t) => {
  closeDatabase();
  await initDatabase(':memory:');
  t.after(() => closeDatabase());

  saveJob({
    id: 'save-falsy-values',
    pipelineId: 'unit-test',
    status: 'queued',
    data: 0,
    result: false,
    error: '',
    git: ''
  });

  const row = getRawJsonColumns('save-falsy-values');
  assert.ok(row, 'expected row to exist');
  assert.equal(row.data, '0');
  assert.equal(row.result, 'false');
  assert.equal(row.error, '""');
  assert.equal(row.git, '""');
});

test('bulkImportJobs preserves falsy non-string JSON values instead of coercing to null', async (t) => {
  closeDatabase();
  await initDatabase(':memory:');
  t.after(() => closeDatabase());

  const outcome = bulkImportJobs([{
    id: 'import-falsy-values',
    pipelineId: 'unit-test',
    status: 'completed',
    data: 0,
    result: false,
    error: 0,
    git: false
  }]);

  assert.equal(outcome.imported, 1);
  assert.equal(outcome.skipped, 0);
  assert.deepEqual(outcome.errors, []);

  const row = getRawJsonColumns('import-falsy-values');
  assert.ok(row, 'expected imported row to exist');
  assert.equal(row.data, '0');
  assert.equal(row.result, 'false');
  assert.equal(row.error, '0');
  assert.equal(row.git, 'false');
});
