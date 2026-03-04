import test from 'node:test';
import assert from 'node:assert/strict';

async function assertImportDoesNotRegisterSignalHandlers(modulePath: string): Promise<void> {
  const sigintBefore = process.listenerCount('SIGINT');
  const sigtermBefore = process.listenerCount('SIGTERM');
  const originalRunOnStartup = process.env.RUN_ON_STARTUP;

  process.env.RUN_ON_STARTUP = 'false';
  try {
    await import(modulePath);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(process.listenerCount('SIGINT'), sigintBefore);
    assert.equal(process.listenerCount('SIGTERM'), sigtermBefore);
  } finally {
    if (originalRunOnStartup === undefined) {
      delete process.env.RUN_ON_STARTUP;
    } else {
      process.env.RUN_ON_STARTUP = originalRunOnStartup;
    }
  }
}

test('dashboard populate pipeline is import-safe', async () => {
  await assertImportDoesNotRegisterSignalHandlers('./dashboard-populate-pipeline.ts');
});

test('gitignore pipeline is import-safe', async () => {
  await assertImportDoesNotRegisterSignalHandlers('./gitignore-pipeline.ts');
});

test('repo cleanup pipeline is import-safe', async () => {
  await assertImportDoesNotRegisterSignalHandlers('./repo-cleanup-pipeline.ts');
});
