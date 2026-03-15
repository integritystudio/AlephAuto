/**
 * Unit Tests for models/validation.ts
 *
 * Tests Zod schemas, path traversal prevention, and edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PatternMatchInputSchema,
  RepositoryInfoInputSchema,
  PipelineInputSchema,
} from '../../sidequest/pipeline-core/models/validation.ts';

// ---------------------------------------------------------------------------
// PatternMatchInputSchema
// ---------------------------------------------------------------------------

describe('PatternMatchInputSchema', () => {
  const validMatch = {
    file_path: 'src/utils.ts',
    rule_id: 'object-manipulation',
    matched_text: 'Object.keys(data)',
    line_start: 1,
    line_end: 5,
  };

  it('should accept valid pattern match', () => {
    const result = PatternMatchInputSchema.safeParse(validMatch);
    assert.equal(result.success, true);
  });

  it('should reject path traversal (..)', () => {
    const result = PatternMatchInputSchema.safeParse({
      ...validMatch,
      file_path: '../../../etc/passwd',
    });
    assert.equal(result.success, false);
  });

  it('should reject absolute paths', () => {
    const result = PatternMatchInputSchema.safeParse({
      ...validMatch,
      file_path: '/etc/passwd',
    });
    assert.equal(result.success, false);
  });

  it('should reject line_end < line_start', () => {
    const result = PatternMatchInputSchema.safeParse({
      ...validMatch,
      line_start: 10,
      line_end: 5,
    });
    assert.equal(result.success, false);
  });

  it('should reject negative line numbers', () => {
    const result = PatternMatchInputSchema.safeParse({
      ...validMatch,
      line_start: -1,
    });
    assert.equal(result.success, false);
  });

  it('should accept optional fields', () => {
    const result = PatternMatchInputSchema.safeParse({
      ...validMatch,
      column_start: 0,
      column_end: 20,
      severity: 'warning',
      confidence: 0.95,
    });
    assert.equal(result.success, true);
  });

  it('should reject confidence > 1', () => {
    const result = PatternMatchInputSchema.safeParse({
      ...validMatch,
      confidence: 1.5,
    });
    assert.equal(result.success, false);
  });

  it('should reject overly long file_path', () => {
    const result = PatternMatchInputSchema.safeParse({
      ...validMatch,
      file_path: 'a'.repeat(501),
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// RepositoryInfoInputSchema
// ---------------------------------------------------------------------------

describe('RepositoryInfoInputSchema', () => {
  it('should accept valid repository info', () => {
    const result = RepositoryInfoInputSchema.safeParse({
      path: '/Users/dev/projects/my-app',
    });
    assert.equal(result.success, true);
  });

  it('should accept optional fields', () => {
    const result = RepositoryInfoInputSchema.safeParse({
      path: '/repo',
      name: 'my-app',
      git_remote: 'https://github.com/user/repo',
      git_branch: 'main',
      git_commit: 'abc123',
    });
    assert.equal(result.success, true);
  });

  it('should reject overly long path', () => {
    const result = RepositoryInfoInputSchema.safeParse({
      path: 'a'.repeat(1001),
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// PipelineInputSchema
// ---------------------------------------------------------------------------

describe('PipelineInputSchema', () => {
  it('should accept valid pipeline input', () => {
    const result = PipelineInputSchema.safeParse({
      repository_info: { path: '/repo' },
      pattern_matches: [
        {
          file_path: 'src/utils.ts',
          rule_id: 'test',
          matched_text: 'code',
          line_start: 1,
          line_end: 1,
        },
      ],
    });
    assert.equal(result.success, true);
  });

  it('should accept empty pattern matches', () => {
    const result = PipelineInputSchema.safeParse({
      repository_info: { path: '/repo' },
      pattern_matches: [],
    });
    assert.equal(result.success, true);
  });

  it('should ignore extra fields (passthrough)', () => {
    const result = PipelineInputSchema.safeParse({
      repository_info: { path: '/repo' },
      pattern_matches: [],
      extra_field: 'ignored',
    });
    assert.equal(result.success, true);
  });

  it('should reject missing repository_info', () => {
    const result = PipelineInputSchema.safeParse({
      pattern_matches: [],
    });
    assert.equal(result.success, false);
  });

  it('should reject missing pattern_matches', () => {
    const result = PipelineInputSchema.safeParse({
      repository_info: { path: '/repo' },
    });
    assert.equal(result.success, false);
  });
});
