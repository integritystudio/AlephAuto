# Test Infrastructure Guide

Comprehensive guide for the AlephAuto test infrastructure, including fixtures, organization, and best practices.

## Table of Contents

- [Test Organization](#test-organization)
- [Running Tests](#running-tests)
- [Test Fixtures](#test-fixtures)
- [Test Infrastructure Validation](#test-infrastructure-validation)
- [Pre-commit Hooks](#pre-commit-hooks)
- [Writing Tests](#writing-tests)
- [Best Practices](#best-practices)

## Test Organization

Tests are organized by type for clarity and maintainability:

```
tests/
├── unit/              # Unit tests (*.test.js)
│   ├── api-routes.test.js
│   ├── directory-scanner.test.js
│   ├── filepath-imports.test.js
│   ├── readme-scanner.test.js
│   ├── retry-logic.test.js
│   ├── sidequest-server.test.js
│   └── websocket.test.js
│
├── integration/       # Integration tests (test-*.js)
│   ├── test-automated-pipeline.js
│   ├── test-cache-layer.js
│   ├── test-inter-project-scan.js
│   └── test-api-routes.sh
│
├── accuracy/          # Accuracy test suite
│   └── accuracy-test.js
│
├── scripts/           # Test utility scripts
│   ├── test-single-job.js
│   ├── test-directory-scanner.js
│   ├── validate-test-paths.js
│   └── ...
│
└── fixtures/          # Test fixtures and helpers
    └── test-helpers.js
```

### Naming Conventions

- **Unit tests**: `*.test.js` (e.g., `retry-logic.test.js`)
- **Integration tests**: `test-*.js` (e.g., `test-cache-layer.js`)
- **Test scripts**: Descriptive names (e.g., `validate-test-paths.js`)

## Running Tests

### All Tests

```bash
# Run all unit tests
npm test

# Run all integration tests
npm run test:integration

# Run both unit and integration tests
npm run test:all
```

### Specific Test Files

```bash
# Run a single test file
node --test tests/unit/retry-logic.test.js

# Run with verbose output
node --test tests/unit/retry-logic.test.js --verbose

# Run integration test
node tests/integration/test-cache-layer.js
```

### Test Validation

```bash
# Validate test paths (pre-commit check)
npm run test:validate-paths

# Type checking
npm run typecheck
```

### Test Coverage

Current coverage: **106 tests, ~90+ passing (85%+)**

- Sidequest Server: 12/12 ✅
- REST API: 16/16 ✅
- WebSocket: 15/15 ✅
- Filepath Imports: 14/14 ✅
- READMEScanner: 11/11 ✅
- Retry Logic: 12/12 ✅
- DirectoryScanner: 12/13 ⚠️

## Test Fixtures

The `tests/fixtures/test-helpers.js` module provides reusable utilities for creating temporary test repositories.

### Creating Temporary Repositories

```javascript
import { createTempRepository, createMultipleTempRepositories, cleanupRepositories } from '../fixtures/test-helpers.js';

// Single repository
const testRepo = await createTempRepository('test');
console.log(testRepo.path); // /var/folders/.../alephauto-test-test-abc123

// Multiple repositories
const multiRepos = await createMultipleTempRepositories(3);
// Returns: [{ path: '/tmp/...' }, { path: '/tmp/...' }, { path: '/tmp/...' }]
```

### Repository Structure

Each temporary repository is created with a basic git repository structure:

```
temp-repo/
├── .git/              # Git directory
├── src/               # Source directory
└── README.md          # Basic README file
```

### Cleanup

Always cleanup temporary repositories in `afterEach` hooks:

```javascript
let testRepo;
let multiRepos;

beforeEach(async () => {
  testRepo = await createTempRepository('test');
  multiRepos = await createMultipleTempRepositories(2);
});

afterEach(async () => {
  if (testRepo) await testRepo.cleanup();
  if (multiRepos) await cleanupRepositories(multiRepos);
});
```

### Available Fixture Functions

#### `createTempRepository(name = 'test-repo')`

Creates a single temporary repository with basic structure.

**Parameters:**
- `name` (string): Optional name for the repository (default: 'test-repo')

**Returns:**
```javascript
{
  path: string,           // Absolute path to repository
  cleanup: async () => {} // Cleanup function
}
```

#### `createMultipleTempRepositories(count = 2)`

Creates multiple temporary repositories.

**Parameters:**
- `count` (number): Number of repositories to create (default: 2)

**Returns:**
```javascript
[
  { path: string, cleanup: async () => {} },
  { path: string, cleanup: async () => {} },
  // ...
]
```

#### `cleanupRepositories(repos)`

Cleanup multiple repositories at once.

**Parameters:**
- `repos` (array): Array of repository objects from `createMultipleTempRepositories`

**Returns:** `Promise<void>`

### Adding Files to Test Repositories

```javascript
import fs from 'fs/promises';
import path from 'path';

const testRepo = await createTempRepository('test');

// Add a source file
await fs.writeFile(
  path.join(testRepo.path, 'src', 'index.js'),
  'export const foo = "bar";'
);

// Add a .gitignore
await fs.writeFile(
  path.join(testRepo.path, '.gitignore'),
  'node_modules\n.env'
);
```

## Test Infrastructure Validation

### Hardcoded Path Detection

The `validate-test-paths.js` script scans test files for hardcoded paths that should use fixtures instead.

#### What It Detects

- Hardcoded `/tmp/test` paths
- Hardcoded `/tmp/repo` paths
- Hardcoded `repositoryPath` properties
- Hardcoded `repositoryPaths` arrays

#### Running Validation

```bash
# Scan for hardcoded paths
npm run test:validate-paths

# See specific issues with line numbers
node tests/scripts/validate-test-paths.js
```

#### Example Output

```
❌ Found 5 hardcoded path(s):

1. tests/scripts/test-gitignore-respect.js:23:15
   Pattern: Hardcoded /tmp/test paths
   Code: const testRepo = '/tmp/test';
   Match: '/tmp/test'
   Suggestion: Use testRepo.path from test fixtures

📝 Recommended Actions:

1. Import test fixtures:
   import { createTempRepository } from '../fixtures/test-helpers.js';

2. Create temp repos in beforeEach:
   beforeEach(async () => {
     testRepo = await createTempRepository('test');
   });

3. Replace hardcoded paths with:
   testRepo.path

4. Cleanup in afterEach:
   afterEach(async () => {
     if (testRepo) await testRepo.cleanup();
   });
```

## Pre-commit Hooks

Pre-commit hooks prevent hardcoded paths from being committed to the repository.

### Location

- Git: `.git/hooks/pre-commit`
- Husky: `.husky/pre-commit`

### What It Checks

- Runs `npm run test:validate-paths` before every commit
- Blocks commit if hardcoded paths are detected
- Provides clear error messages with fix suggestions

### Output on Failure

```bash
🔍 Running pre-commit checks...
Validating test paths...

❌ Pre-commit validation failed!
Fix hardcoded paths in test files before committing.

Run 'npm run test:validate-paths' to see issues.
```

### Bypassing (Not Recommended)

```bash
# Only use in emergencies
git commit --no-verify -m "Emergency commit"
```

## Writing Tests

### Basic Test Structure

```javascript
import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createTempRepository } from '../fixtures/test-helpers.js';

describe('MyComponent', () => {
  let testRepo;

  beforeEach(async () => {
    testRepo = await createTempRepository('test');
  });

  afterEach(async () => {
    if (testRepo) await testRepo.cleanup();
  });

  test('should do something', async () => {
    // Arrange
    const input = { repositoryPath: testRepo.path };

    // Act
    const result = await myFunction(input);

    // Assert
    assert.strictEqual(result.success, true);
  });
});
```

### Using Test Fixtures

```javascript
import { createTempRepository, createMultipleTempRepositories } from '../fixtures/test-helpers.js';

// ✅ CORRECT - Using fixtures
test('should scan repository', async () => {
  const testRepo = await createTempRepository('test');
  const result = await scanner.scan(testRepo.path);
  await testRepo.cleanup();

  assert.ok(result);
});

// ❌ INCORRECT - Hardcoded path
test('should scan repository', async () => {
  const result = await scanner.scan('/tmp/test');
  assert.ok(result);
});
```

### Testing with Multiple Repositories

```javascript
test('should scan multiple repositories', async () => {
  const repos = await createMultipleTempRepositories(3);
  const paths = repos.map(r => r.path);

  const result = await interProjectScanner.scan(paths);

  await cleanupRepositories(repos);
  assert.strictEqual(result.repositories.length, 3);
});
```

### Testing Error Conditions

```javascript
test('should handle missing repository', async () => {
  const invalidPath = '/nonexistent/path';

  await assert.rejects(
    async () => await scanner.scan(invalidPath),
    {
      name: 'Error',
      message: /Repository not found/
    }
  );
});
```

### Testing Async Code

```javascript
test('should handle async operations', async () => {
  const testRepo = await createTempRepository('test');

  // Use async/await
  const result = await asyncOperation(testRepo.path);

  await testRepo.cleanup();
  assert.ok(result);
});
```

## Best Practices

### 1. Always Use Test Fixtures

**DON'T:**
```javascript
const testPath = '/tmp/test';
const result = await scanner.scan(testPath);
```

**DO:**
```javascript
const testRepo = await createTempRepository('test');
const result = await scanner.scan(testRepo.path);
await testRepo.cleanup();
```

### 2. Always Cleanup

**DON'T:**
```javascript
test('my test', async () => {
  const repo = await createTempRepository('test');
  // ... test code ...
  // Missing cleanup!
});
```

**DO:**
```javascript
test('my test', async () => {
  const repo = await createTempRepository('test');
  try {
    // ... test code ...
  } finally {
    await repo.cleanup();
  }
});

// Or better, use afterEach:
afterEach(async () => {
  if (testRepo) await testRepo.cleanup();
});
```

### 3. Use Descriptive Test Names

**DON'T:**
```javascript
test('test1', () => { ... });
test('should work', () => { ... });
```

**DO:**
```javascript
test('should extract original job ID from single retry suffix', () => { ... });
test('should trigger circuit breaker at absolute max retries', () => { ... });
```

### 4. Organize Tests Logically

```javascript
describe('RetryLogic', () => {
  describe('Original Job ID Extraction', () => {
    test('should extract from single suffix', () => { ... });
    test('should extract from multiple suffixes', () => { ... });
  });

  describe('Circuit Breaker', () => {
    test('should trigger at max attempts', () => { ... });
    test('should reset after success', () => { ... });
  });
});
```

### 5. Test Both Success and Failure Cases

```javascript
describe('Scanner', () => {
  test('should scan valid repository', async () => {
    // Success case
  });

  test('should reject invalid repository', async () => {
    // Failure case
  });

  test('should handle missing files gracefully', async () => {
    // Edge case
  });
});
```

### 6. Run Validation Before Commits

```bash
# Always run before committing
npm run test:validate-paths

# Run all tests
npm test
```

### 7. Keep Tests Fast

- Use fixtures instead of real repositories when possible
- Cleanup resources promptly
- Avoid unnecessary delays or timeouts
- Mock external dependencies

### 8. Isolate Tests

- Each test should be independent
- Don't rely on execution order
- Use `beforeEach` and `afterEach` for setup/teardown
- Don't share state between tests

## Common Issues and Solutions

### Issue: "Cannot find temporary directory"

**Cause:** Repository cleanup ran before test completed

**Solution:** Use `try...finally` or `afterEach` for cleanup

```javascript
test('my test', async () => {
  const repo = await createTempRepository('test');
  try {
    await myAsyncOperation(repo.path);
  } finally {
    await repo.cleanup();
  }
});
```

### Issue: "Pre-commit hook blocking commit"

**Cause:** Test files contain hardcoded paths

**Solution:** Run validation and fix issues

```bash
npm run test:validate-paths
# Fix reported issues
git add .
git commit -m "Fix hardcoded paths"
```

### Issue: "Test fails intermittently"

**Cause:** Race condition or shared state

**Solution:** Ensure proper async/await usage and test isolation

```javascript
// Bad - Missing await
test('bad test', async () => {
  const repo = createTempRepository('test'); // Missing await!
  await scanner.scan(repo.path);
});

// Good - Proper async/await
test('good test', async () => {
  const repo = await createTempRepository('test');
  await scanner.scan(repo.path);
  await repo.cleanup();
});
```

### Issue: "Tests leave temp files behind"

**Cause:** Missing cleanup in error paths

**Solution:** Always use `try...finally` or `afterEach`

```javascript
let testRepo;

beforeEach(async () => {
  testRepo = await createTempRepository('test');
});

afterEach(async () => {
  if (testRepo) await testRepo.cleanup();
  testRepo = null; // Prevent double cleanup
});
```

## Additional Resources

- [Node.js Test Runner Documentation](https://nodejs.org/api/test.html)
- [Assert Module Documentation](https://nodejs.org/api/assert.html)
- Project CLAUDE.md for codebase overview
- `tests/fixtures/test-helpers.js` source code

## Contributing

When adding new tests:

1. Use appropriate test type directory (`unit/`, `integration/`, `accuracy/`)
2. Follow naming conventions (`*.test.js` for unit tests)
3. Use test fixtures from `test-helpers.js`
4. Add cleanup in `afterEach` hooks
5. Run `npm run test:validate-paths` before committing
6. Ensure tests pass: `npm test`

---

**Last Updated:** 2025-11-17
**Test Coverage:** 106 tests, 85%+ passing
**Test Infrastructure:** Test fixtures, validation, pre-commit hooks
