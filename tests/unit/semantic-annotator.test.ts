/**
 * Unit Tests for annotators/semantic-annotator.ts
 *
 * Tests annotation extraction and intent inference.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SemanticAnnotator } from '../../sidequest/pipeline-core/annotators/semantic-annotator.ts';
import type { CodeBlock } from '../../sidequest/pipeline-core/models/types.ts';

function makeBlock(sourceCode: string, overrides: Partial<CodeBlock> = {}): CodeBlock {
  return {
    blockId: 'cb_test',
    patternId: 'test-pattern',
    location: { filePath: 'src/test.ts', lineStart: 1, lineEnd: 5 },
    relativePath: 'src/test.ts',
    sourceCode,
    language: 'typescript',
    category: 'utility',
    tags: [],
    repositoryPath: '/repo',
    lineCount: 5,
    ...overrides,
  };
}

describe('SemanticAnnotator', () => {
  const annotator = new SemanticAnnotator();

  describe('extractAnnotation', () => {
    it('should extract array operations', () => {
      const block = makeBlock('const result = items.filter(x => x.active).map(x => x.name);');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.operations.has('filter'));
      assert.ok(ann.operations.has('map'));
    });

    it('should extract CRUD operations', () => {
      const block = makeBlock('const data = await api.get("/users");');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.operations.has('read'));
    });

    it('should extract domain concepts', () => {
      const block = makeBlock('const user = await db.query("SELECT * FROM users");');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.domains.has('user'));
      assert.ok(ann.domains.has('database'));
    });

    it('should extract code patterns', () => {
      const block = makeBlock('if (!user) return null;');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.patterns.has('guard_clause'));
    });

    it('should extract null_check patterns', () => {
      const block = makeBlock('if (x === null || y !== undefined) {}');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.patterns.has('null_check'));
    });

    it('should extract data types', () => {
      const block = makeBlock('const items = []; items.push(1); const n = parseInt("42");');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.dataTypes.has('array'));
      assert.ok(ann.dataTypes.has('number'));
    });

    it('should extract async patterns', () => {
      const block = makeBlock('async function fetchData() { const result = await fetch("/api"); }');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.patterns.has('async_await'));
      assert.ok(ann.operations.has('fetch'));
    });

    it('should extract error handling patterns', () => {
      const block = makeBlock('try { doStuff(); } catch (e) { throw new Error("failed"); }');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.patterns.has('error_handling'));
    });

    it('should preserve category from block', () => {
      const block = makeBlock('const x = 1;', { category: 'validator' });
      const ann = annotator.extractAnnotation(block);
      assert.equal(ann.category, 'validator');
    });
  });

  describe('intent inference', () => {
    it('should generate intent with operations and domains', () => {
      const block = makeBlock('const result = items.filter(x => x.active);');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.intent.includes('filter'));
    });

    it('should return unknown for empty code', () => {
      const block = makeBlock('');
      const ann = annotator.extractAnnotation(block);
      assert.equal(ann.intent, 'unknown');
    });

    it('should include domain in intent', () => {
      const block = makeBlock('const users = await getUsers();');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.intent.includes('on:'));
      assert.ok(ann.intent.includes('user'));
    });

    it('should include patterns in intent', () => {
      const block = makeBlock('if (!input) throw new Error("missing");');
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.intent.includes('with:'));
    });
  });

  describe('domains from tags', () => {
    it('should extract domains from tags as well as code', () => {
      const block = makeBlock('const x = 1;', { tags: ['auth', 'user-management'] });
      const ann = annotator.extractAnnotation(block);
      assert.ok(ann.domains.has('auth'));
    });
  });
});
