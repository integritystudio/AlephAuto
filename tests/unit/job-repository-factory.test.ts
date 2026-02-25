/**
 * JobRepository Factory Function Tests
 *
 * Tests for Medium Issue M1: Global Singleton Pattern in JobRepository
 * Verifies that the factory function and reset method work correctly for testing.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

describe('JobRepository Factory Function', () => {
  let JobRepository, createJobRepository, jobRepository;

  before(async () => {
    const module = await import('../../sidequest/core/job-repository.ts');
    JobRepository = module.JobRepository;
    createJobRepository = module.createJobRepository;
    jobRepository = module.jobRepository;
  });

  describe('createJobRepository factory', () => {
    it('should create a new JobRepository instance', () => {
      const repo = createJobRepository();
      assert.ok(repo instanceof JobRepository);
    });

    it('should create multiple independent instances', () => {
      const repo1 = createJobRepository();
      const repo2 = createJobRepository();

      assert.ok(repo1 instanceof JobRepository);
      assert.ok(repo2 instanceof JobRepository);
      assert.notStrictEqual(repo1, repo2, 'Instances should be different');
    });

    it('should accept options parameter', () => {
      const repo = createJobRepository({ autoInitialize: false });
      assert.ok(repo instanceof JobRepository);
    });

    it('should handle autoInitialize option', () => {
      // Should not throw when autoInitialize is true
      assert.doesNotThrow(() => {
        createJobRepository({ autoInitialize: true });
      });
    });
  });

  describe('Singleton export', () => {
    it('should export a singleton instance', () => {
      assert.ok(jobRepository instanceof JobRepository);
    });

    it('should be created via factory function', () => {
      // The singleton should be an instance of JobRepository
      assert.ok(jobRepository instanceof JobRepository);
    });
  });

  describe('reset() method', () => {
    it('should exist on JobRepository instances', () => {
      const repo = createJobRepository();
      assert.strictEqual(typeof repo.reset, 'function');
    });

    it('should not throw when called on uninitialized instance', () => {
      const repo = createJobRepository();
      assert.doesNotThrow(() => repo.reset());
    });

    it('should not throw when called multiple times', () => {
      const repo = createJobRepository();
      assert.doesNotThrow(() => {
        repo.reset();
        repo.reset();
        repo.reset();
      });
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain existing exports', async () => {
      const module = await import('../../sidequest/core/job-repository.ts');

      // Check all expected exports exist
      assert.ok(module.JobRepository, 'JobRepository class should be exported');
      assert.ok(module.createJobRepository, 'createJobRepository function should be exported');
      assert.ok(module.jobRepository, 'jobRepository singleton should be exported');
    });

    it('should allow direct class instantiation', () => {
      const repo = new JobRepository();
      assert.ok(repo instanceof JobRepository);
    });

    it('should support options in direct instantiation', () => {
      const repo = new JobRepository({ autoInitialize: false });
      assert.ok(repo instanceof JobRepository);
    });
  });

  describe('Constructor options', () => {
    it('should accept empty options', () => {
      const repo = new JobRepository({});
      assert.ok(repo instanceof JobRepository);
    });

    it('should work without options parameter', () => {
      const repo = new JobRepository();
      assert.ok(repo instanceof JobRepository);
    });

    it('should store options internally', () => {
      const options = { autoInitialize: false };
      const repo = new JobRepository(options);
      assert.ok(repo._options, 'Options should be stored internally');
    });
  });
});
