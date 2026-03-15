import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bulkImportJobs,
  closeDatabase,
  getJobById,
  initDatabase,
  saveJob,
} from './database.ts';
import { createTestDatabase, destroyTestDatabase } from '../../tests/fixtures/pg-test-helper.ts';

test('saveJob preserves falsy JSON values instead of coercing to null', async (t) => {
  await closeDatabase();
  await createTestDatabase();
  await initDatabase('pglite://memory');
  t.after(async () => {
    await closeDatabase();
    await destroyTestDatabase();
  });

  await saveJob({
    id: 'save-falsy-values',
    pipelineId: 'unit-test',
    status: 'queued',
    data: 0,
    result: false,
    error: null,
    git: null
  });

  const job = await getJobById('save-falsy-values');
  assert.ok(job, 'expected job to exist');
  assert.equal(job.data, 0);
  assert.equal(job.result, false);
  assert.equal(job.error, null);
  assert.equal(job.git, null);
});

test('bulkImportJobs preserves falsy non-string JSON values instead of coercing to null', async (t) => {
  await closeDatabase();
  await createTestDatabase();
  await initDatabase('pglite://memory');
  t.after(async () => {
    await closeDatabase();
    await destroyTestDatabase();
  });

  const outcome = await bulkImportJobs([{
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

  const job = await getJobById('import-falsy-values');
  assert.ok(job, 'expected imported job to exist');
  assert.equal(job.data, 0);
  assert.equal(job.result, false);
});
