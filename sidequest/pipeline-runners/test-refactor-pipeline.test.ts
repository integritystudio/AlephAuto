import test from 'node:test';
import assert from 'node:assert/strict';

test('test-refactor-pipeline can be imported without starting the runner', async () => {
  const sigintListenersBefore = process.listenerCount('SIGINT');

  const module = await import('./test-refactor-pipeline.ts');
  await new Promise<void>((resolve) => setImmediate(resolve));

  const sigintListenersAfter = process.listenerCount('SIGINT');
  assert.equal(typeof module.runPipeline, 'function');
  assert.equal(sigintListenersAfter, sigintListenersBefore);
});
