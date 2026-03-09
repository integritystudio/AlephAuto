import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { resolvePluginAuditScriptPath } from './plugin-manager.ts';

test('resolvePluginAuditScriptPath points to pipeline-runners plugin audit script', async () => {
  const scriptPath = resolvePluginAuditScriptPath();

  assert.equal(path.basename(scriptPath), 'plugin-management-audit.sh');
  const stats = await fs.stat(scriptPath);
  assert.equal(stats.isFile(), true);
});
