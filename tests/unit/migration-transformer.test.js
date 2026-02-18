/**
 * Tests for MigrationTransformer
 *
 * Tests AST-based code transformation for consolidation migrations.
 * Includes pattern-based file detection tests that exercise _resolveAffectedFiles
 * when no code_example is provided.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { MigrationTransformer } from '../../sidequest/pipeline-core/git/migration-transformer.ts';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MigrationTransformer', () => {
  let transformer;
  let tempDir;

  before(async () => {
    // Create temp directory for test files
    tempDir = path.join(__dirname, '..', 'fixtures', 'temp-migration-test');
    await fs.mkdir(tempDir, { recursive: true });

    transformer = new MigrationTransformer({
      dryRun: false
    });
  });

  after(async () => {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('parseMigrationStep', () => {
    it('should parse update import step', async () => {
      const suggestion = {
        suggestion_id: 'test-1',
        migration_steps: [
          {
            step_number: 1,
            description: 'Update import from \'./utils/json.js\' to \'../shared/json-utils.js\'',
            automated: true
          }
        ]
      };

      // Create test file
      const testFile = path.join(tempDir, 'test-import.js');
      await fs.writeFile(testFile, `
import { writeJsonFile } from './utils/json.js';

const data = { foo: 'bar' };
writeJsonFile('output.json', data);
      `.trim());

      const result = await transformer.applyMigrationSteps(suggestion, tempDir);

      // File detection should find test-import.js (contains `from './utils/json.js'`)
      assert.ok(result.filesModified.length > 0, 'Should detect and modify file');

      const transformed = await fs.readFile(testFile, 'utf-8');
      assert.ok(transformed.includes('../shared/json-utils.js'), 'Should update import path');
    });

    it('should parse replace call step via file detection', async () => {
      const suggestion = {
        suggestion_id: 'test-2',
        migration_steps: [
          {
            step_number: 1,
            description: 'Replace calls to writeJsonFile with jsonUtils.writeJsonFile',
            automated: true
          }
        ]
      };

      const testFile = path.join(tempDir, 'test-calls.js');
      await fs.writeFile(testFile, `
import { writeJsonFile } from './utils/json.js';

const data = { foo: 'bar' };
writeJsonFile('output.json', data);
      `.trim());

      const result = await transformer.applyMigrationSteps(suggestion, tempDir);

      // Read transformed file
      const transformed = await fs.readFile(testFile, 'utf-8');

      // Should have replaced function call
      assert.ok(transformed.includes('jsonUtils.writeJsonFile'), 'Should replace function call');
    });

    it('should parse add import step via file detection (association)', async () => {
      const testFile = path.join(tempDir, 'test-add-import.js');
      await fs.writeFile(testFile, `
const data = { foo: 'bar' };
legacyWrite(data);
      `.trim());

      const suggestion = {
        suggestion_id: 'test-3',
        migration_steps: [
          {
            step_number: 1,
            description: 'Replace calls to legacyWrite with writeJsonFile',
            automated: true
          },
          {
            step_number: 2,
            description: 'Add import \'{ writeJsonFile }\' from \'../shared/json-utils.js\'',
            automated: true
          }
        ]
      };

      const result = await transformer.applyMigrationSteps(suggestion, tempDir);

      // Read transformed file
      const transformed = await fs.readFile(testFile, 'utf-8');

      // Should have added import
      assert.ok(transformed.includes('import'), 'Should add import statement');
      assert.ok(transformed.includes('writeJsonFile'), 'Should import writeJsonFile');
    });

    it('should parse remove declaration step via file detection', async () => {
      const suggestion = {
        suggestion_id: 'test-4',
        migration_steps: [
          {
            step_number: 1,
            description: 'Remove duplicate function writeJsonFile from legacy.js',
            automated: true
          }
        ]
      };

      const testFile = path.join(tempDir, 'test-remove.js');
      await fs.writeFile(testFile, `
function writeJsonFile(path, data) {
  console.log('Old implementation');
}

function otherFunction() {
  return true;
}
      `.trim());

      const result = await transformer.applyMigrationSteps(suggestion, tempDir);

      // Read transformed file
      const transformed = await fs.readFile(testFile, 'utf-8');

      // Should have removed writeJsonFile but kept otherFunction
      assert.ok(!transformed.includes('writeJsonFile'), 'Should remove writeJsonFile');
      assert.ok(transformed.includes('otherFunction'), 'Should keep otherFunction');
    });
  });

  describe('AST transformations', () => {
    it('should update import paths via file detection', async () => {
      const testFile = path.join(tempDir, 'import-test.js');
      await fs.writeFile(testFile, `
import { foo } from './old-path.js';
import bar from '../another-path.js';
      `.trim());

      const suggestion = {
        suggestion_id: 'import-test',
        migration_steps: [
          {
            step_number: 1,
            description: 'Update import from \'./old-path.js\' to \'./new-path.js\'',
            automated: true
          }
        ]
      };

      await transformer.applyMigrationSteps(suggestion, tempDir);

      const result = await fs.readFile(testFile, 'utf-8');
      assert.ok(result.includes('./new-path.js'), 'Should update import path');
      assert.ok(result.includes('../another-path.js'), 'Should keep other imports');
    });

    it('should replace function calls with namespaced calls via file detection', async () => {
      const testFile = path.join(tempDir, 'call-test.js');
      await fs.writeFile(testFile, `
import { oldFunc } from './utils.js';

const result1 = oldFunc(1, 2);
const result2 = oldFunc(3, 4);
      `.trim());

      const suggestion = {
        suggestion_id: 'call-test',
        migration_steps: [
          {
            step_number: 1,
            description: 'Replace calls to oldFunc with utils.newFunc',
            automated: true
          }
        ]
      };

      await transformer.applyMigrationSteps(suggestion, tempDir);

      const result = await fs.readFile(testFile, 'utf-8');
      assert.ok(result.includes('utils.newFunc'), 'Should replace with namespaced call');
    });

    it('should handle multiple transformations in one file via file detection', async () => {
      const testFile = path.join(tempDir, 'multi-test.js');
      await fs.writeFile(testFile, `
import { helper } from './old-utils.js';

function legacyHelper(a, b) {
  return a + b;
}

const result = legacyHelper(1, 2);
      `.trim());

      const suggestion = {
        suggestion_id: 'multi-test',
        migration_steps: [
          {
            step_number: 1,
            description: 'Update import from \'./old-utils.js\' to \'./new-utils.js\'',
            automated: true
          },
          {
            step_number: 2,
            description: 'Remove duplicate function legacyHelper',
            automated: true
          },
          {
            step_number: 3,
            description: 'Replace calls to legacyHelper with utils.legacyHelper',
            automated: true
          }
        ]
      };

      await transformer.applyMigrationSteps(suggestion, tempDir);

      const result = await fs.readFile(testFile, 'utf-8');
      assert.ok(result.includes('./new-utils.js'), 'Should update import');
      assert.ok(!result.includes('function legacyHelper'), 'Should remove duplicate');
      assert.ok(result.includes('utils.legacyHelper'), 'Should replace calls');
    });
  });

  describe('backup and rollback', () => {
    it('should create backups before transformation', async () => {
      const testFile = path.join(tempDir, 'backup-test.js');
      const originalContent = 'const original = true;';
      await fs.writeFile(testFile, originalContent);

      const suggestion = {
        suggestion_id: 'backup-test',
        migration_steps: [
          {
            step_number: 1,
            description: 'Add import \'foo\' from \'./bar.js\'',
            automated: true,
            code_example: '// backup-test.js'
          }
        ]
      };

      const result = await transformer.applyMigrationSteps(suggestion, tempDir);

      // Backup path should be created
      assert.ok(result.backupPath, 'Should create backup path');

      // Verify backup directory exists
      const backupExists = await fs.access(result.backupPath)
        .then(() => true)
        .catch(() => false);

      assert.ok(backupExists, 'Backup directory should exist');
    });

    it('should rollback on transformation error', async () => {
      const testFile = path.join(tempDir, 'rollback-test.js');
      const originalContent = 'const original = true;';
      await fs.writeFile(testFile, originalContent);

      // Create a suggestion that will fail during transformation
      const suggestion = {
        suggestion_id: 'rollback-test',
        migration_steps: [
          {
            step_number: 1,
            description: 'This will not be parseable',
            automated: true,
            code_example: '// rollback-test.js'
          }
        ]
      };

      // This should complete without throwing (just no transformations)
      const result = await transformer.applyMigrationSteps(suggestion, tempDir);

      // File should remain unchanged
      const fileContent = await fs.readFile(testFile, 'utf-8');
      assert.strictEqual(fileContent, originalContent, 'File should be unchanged');
    });
  });

  describe('dry run mode', () => {
    it('should not modify files in dry run mode', async () => {
      const dryRunTransformer = new MigrationTransformer({ dryRun: true });

      const testFile = path.join(tempDir, 'dryrun-test.js');
      const originalContent = 'const original = true;';
      await fs.writeFile(testFile, originalContent);

      const suggestion = {
        suggestion_id: 'dryrun-test',
        migration_steps: [
          {
            step_number: 1,
            description: 'Update import from \'./old.js\' to \'./new.js\'',
            automated: true,
            code_example: '// dryrun-test.js'
          }
        ]
      };

      await dryRunTransformer.applyMigrationSteps(suggestion, tempDir);

      // File should remain unchanged
      const fileContent = await fs.readFile(testFile, 'utf-8');
      assert.strictEqual(fileContent, originalContent, 'File should be unchanged in dry run');
    });
  });

  describe('error handling', () => {
    it('should handle non-JavaScript files gracefully', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'This is not JavaScript');

      const suggestion = {
        suggestion_id: 'error-test',
        migration_steps: [
          {
            step_number: 1,
            description: 'Update import from \'./old.js\' to \'./new.js\'',
            automated: true,
            code_example: '// test.txt'
          }
        ]
      };

      // Should not throw, just skip the file
      const result = await transformer.applyMigrationSteps(suggestion, tempDir);
      assert.strictEqual(result.filesModified.length, 0, 'Should not modify non-JS files');
    });

    it('should continue on individual transformation errors', async () => {
      const testFile1 = path.join(tempDir, 'error1.js');
      const testFile2 = path.join(tempDir, 'error2.js');

      await fs.writeFile(testFile1, 'const a = 1;');
      await fs.writeFile(testFile2, 'const b = 2;');

      const suggestion = {
        suggestion_id: 'error-continue-test',
        migration_steps: [
          {
            step_number: 1,
            description: 'Update import from \'./old.js\' to \'./new.js\'',
            automated: true,
            code_example: '// error1.js'
          },
          {
            step_number: 2,
            description: 'Add import \'foo\' from \'./bar.js\'',
            automated: true,
            code_example: '// error2.js'
          }
        ]
      };

      // Should not throw even if some transformations fail
      const result = await transformer.applyMigrationSteps(suggestion, tempDir);
      assert.ok(result, 'Should return result even with errors');
    });
  });
});
