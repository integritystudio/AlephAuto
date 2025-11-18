// Test file using proper test fixtures (should pass pre-commit hook)
import { describe, it, beforeEach, afterEach } from 'node:test';
import { createTempRepository } from '../fixtures/test-helpers.js';

describe('Test with proper fixtures', () => {
  let testRepo;

  beforeEach(async () => {
    testRepo = await createTempRepository('test-valid');
  });

  afterEach(async () => {
    if (testRepo) await testRepo.cleanup();
  });

  it('should scan repository using test fixture', async () => {
    const result = await scanner.scan(testRepo.path);
  });

  it('should use test fixture for config', async () => {
    const config = {
      repositoryPath: testRepo.path
    };
  });
});
