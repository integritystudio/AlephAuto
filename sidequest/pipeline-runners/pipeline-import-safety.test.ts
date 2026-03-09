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

async function assertImportWithPmIdDoesNotStartTimers(modulePath: string): Promise<void> {
  const sigintBefore = process.listenerCount('SIGINT');
  const sigtermBefore = process.listenerCount('SIGTERM');
  const originalRunOnStartup = process.env.RUN_ON_STARTUP;
  const originalPmId = process.env.pm_id;
  const originalSetInterval = global.setInterval;
  let intervalCalls = 0;

  (global as unknown as { setInterval: typeof setInterval }).setInterval =
    (((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      intervalCalls++;
      return originalSetInterval(handler, 1, ...args);
    }) as unknown as typeof setInterval);

  process.env.RUN_ON_STARTUP = 'false';
  process.env.pm_id = '1';
  try {
    await import(modulePath);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(intervalCalls, 0);
    assert.equal(process.listenerCount('SIGINT'), sigintBefore);
    assert.equal(process.listenerCount('SIGTERM'), sigtermBefore);
  } finally {
    (global as unknown as { setInterval: typeof setInterval }).setInterval = originalSetInterval;
    if (originalRunOnStartup === undefined) {
      delete process.env.RUN_ON_STARTUP;
    } else {
      process.env.RUN_ON_STARTUP = originalRunOnStartup;
    }
    if (originalPmId === undefined) {
      delete process.env.pm_id;
    } else {
      process.env.pm_id = originalPmId;
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

test('claude health pipeline is import-safe', async () => {
  await assertImportDoesNotRegisterSignalHandlers('./claude-health-pipeline.ts');
});

test('duplicate detection pipeline stays import-safe even when pm_id is set', async () => {
  await assertImportWithPmIdDoesNotStartTimers('./duplicate-detection-pipeline.ts');
});
