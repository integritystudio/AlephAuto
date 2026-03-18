import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Aggregate Test Script Coverage', () => {
  it('package.json wires core/env/full aggregate scripts for Node suites', async () => {
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    const scripts = packageJson.scripts as Record<string, string>;

    assert.equal(
      scripts['test:all:core'],
      "SKIP_ENV_SENSITIVE_TESTS=1 node --strip-types --test --test-timeout=30000 --test-force-exit $(rg --files tests/unit -g '*.test.ts' -g '!api-routes.test.ts') $(rg --files tests/integration -g '*.test.ts' -g '!error-recovery.integration.test.ts' -g '!pipeline-execution.integration.test.ts' -g '!port-manager.integration.test.ts') sidequest/core/*.test.ts sidequest/pipeline-runners/*.test.ts sidequest/utils/*.test.ts sidequest/workers/*.test.ts"
    );
    assert.equal(
      scripts['test:all:env'],
      'node --strip-types --test --test-timeout=60000 --test-force-exit tests/unit/api-routes.test.ts tests/unit/port-manager.test.ts tests/unit/websocket.test.ts tests/integration/error-recovery.integration.test.ts tests/integration/pipeline-execution.integration.test.ts tests/integration/port-manager.integration.test.ts sidequest/pipeline-runners/startup-once-mode.test.ts'
    );
    assert.equal(scripts['test:all:full'], 'npm run test:all:core && npm run test:all:env');
  });
});
