import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Aggregate Test Script Coverage', () => {
  it('package.json wires test:all and test:aall to include Node+Python suites', async () => {
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    const scripts = packageJson.scripts as Record<string, string>;

    assert.equal(
      scripts['test:all:node'],
      'node --strip-types --test --test-timeout=30000 --test-force-exit tests/unit/**/*.test.ts tests/integration/*.test.ts sidequest/core/*.test.ts sidequest/pipeline-runners/*.test.ts sidequest/utils/*.test.ts sidequest/workers/*.test.ts'
    );
    assert.equal(scripts['test:all:py'], 'bash scripts/run-python-tests.sh');
    assert.equal(scripts['test:all'], 'npm run test:all:node && npm run test:all:py');
    assert.equal(scripts['test:aall'], 'npm run test:all');
  });

  it('run-python-tests.sh prefers PYTEST_PYTHON and forwards extra pytest args', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-python-tests-'));
    const fakePython = path.join(tempDir, 'fake-python');
    const argsFile = path.join(tempDir, 'pytest-args.txt');
    const runScript = path.join(PROJECT_ROOT, 'scripts', 'run-python-tests.sh');

    const fakePythonScript = `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "-c" ]]; then
  # Simulate dependency check success for: import pytest, pydantic
  exit 0
fi
if [[ "$1" == "-m" && "$2" == "pytest" ]]; then
  printf '%s\\n' "$@" > "$FAKE_PYTEST_ARGS_FILE"
  exit 0
fi
exit 1
`;

    await fs.writeFile(fakePython, fakePythonScript, 'utf-8');
    await fs.chmod(fakePython, 0o755);

    try {
      const { stdout, stderr } = await execFileAsync(
        'bash',
        [runScript, '--maxfail=1'],
        {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PYTEST_PYTHON: fakePython,
            FAKE_PYTEST_ARGS_FILE: argsFile,
          },
        }
      );

      assert.match(stdout, /Using Python test runner: .*fake-python/);
      assert.equal(stderr, '');

      const forwardedArgs = (await fs.readFile(argsFile, 'utf-8'))
        .trim()
        .split('\n');

      assert.deepEqual(
        forwardedArgs,
        [
          '-m',
          'pytest',
          '-q',
          'sidequest/pipeline-core',
          'sidequest/pipeline-runners/test_collect_git_activity.py',
          '--maxfail=1',
        ]
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
