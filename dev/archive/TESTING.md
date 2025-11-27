# AlephAuto Testing Guide

Comprehensive testing documentation for the AlephAuto job queue framework and all pipelines.

## Table of Contents

1. [Overview](#overview)
2. [Test Infrastructure](#test-infrastructure)
3. [Test Suites](#test-suites)
4. [Running Tests](#running-tests)
5. [Writing Tests](#writing-tests)
6. [CI/CD Integration](#cicd-integration)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### Test Statistics

```
Total Tests: 80+
Unit Tests: 24+ tests across 9 files
Integration Tests: 8 test files
Accuracy Tests: 1 comprehensive suite
Test Fixtures: Automatic cleanup system
Path Validation: Pre-commit hook enforcement
```

### Test Organization

```
tests/
├── unit/                               # Unit tests (9 files)
│   ├── api-routes.test.js             # API endpoint tests
│   ├── sidequest-server.test.js       # Job queue tests
│   ├── repomix-worker.test.js         # Repomix worker tests (8/8 passing)
│   ├── mcp-server.test.js             # MCP server tests (10-13/16 passing)
│   ├── directory-scanner.test.js      # Directory scanning tests
│   ├── readme-scanner.test.js         # README discovery tests
│   ├── schema-mcp-tools.test.js       # Schema.org tools tests
│   ├── filepath-imports.test.js       # Import path validation
│   └── test-utilities.test.js         # Test utilities (31/31 passing)
│
├── integration/                        # Integration tests (8 files)
│   ├── test-automated-pipeline.js     # End-to-end pipeline test
│   ├── test-cache-layer.js            # Redis caching test
│   ├── test-inter-project-scan.js     # Multi-repo scanning test
│   ├── test-health-scanner-integration.js
│   ├── test-doc-enhancement-integration.js
│   ├── test-git-activity-integration.js
│   ├── test-websocket-events.js
│   └── test-sentry-integration.js
│
├── accuracy/                           # Accuracy tests
│   ├── accuracy-test.js               # Duplicate detection accuracy
│   ├── expected-results.json          # Expected test outcomes
│   └── fixtures/                      # Test data
│
├── fixtures/                           # Test helpers
│   ├── test-helpers.js                # createTempRepository(), cleanup()
│   └── sample-data/                   # Sample test data
│
├── utils/                              # Test utilities
│   └── test-utilities.js              # Helper functions (31 tests)
│
└── scripts/                            # Test utility scripts
    ├── test-single-job.js             # Test individual job
    ├── test-sentry-connection.js      # Test Sentry integration
    ├── validate-test-paths.js         # Pre-commit path validation
    └── run-all-tests.js               # Run complete test suite
```

### Test Quality Metrics

**Infrastructure Quality:**
- ✅ Test fixtures system with automatic cleanup
- ✅ Pre-commit hooks prevent hardcoded paths
- ✅ Real git repository structures in tests
- ✅ Proper async/await patterns
- ✅ Comprehensive error handling coverage

**Execution Characteristics:**
- **Isolation**: Each test uses unique temporary directories
- **Cleanup**: Automatic cleanup in `afterEach` hooks
- **Speed**: Fast execution with minimal overhead (~2-3 seconds per suite)
- **Reliability**: Deterministic results (except MCP server timing issues)

**Best Practices:**
- No hardcoded `/tmp/` paths
- No shared state between tests
- Proper use of `beforeEach`/`afterEach`
- Clear, descriptive test names
- Comprehensive assertions

---

## Test Infrastructure

### Test Fixtures System

All tests use the centralized test fixtures system from `tests/fixtures/test-helpers.js`.

**Key Features:**
- Automatic cleanup in `afterEach` hooks
- Real git repository structure
- No hardcoded `/tmp/` paths
- Pre-commit validation prevents hardcoded paths
- Unique directory names with random suffixes

**Core Functions:**

#### `createTempRepository(name, options)`

Creates a temporary test repository with real git structure.

```javascript
import { createTempRepository } from '../fixtures/test-helpers.js';

const testRepo = await createTempRepository('test', {
  initGit: true,           // Initialize as git repo (default: true)
  createFiles: ['README.md', 'index.js'],  // Create initial files
  gitignore: ['*.log', 'node_modules/']    // Add .gitignore entries
});

// Access repository properties
console.log(testRepo.path);        // Absolute path
console.log(testRepo.name);        // Repository name
console.log(testRepo.gitDir);      // .git directory path

// Cleanup (automatic in afterEach, but can be manual)
await testRepo.cleanup();
```

**Return Value:**
```javascript
{
  path: '/var/folders/.../alephauto-test-mytest-abc123',
  name: 'mytest',
  gitDir: '/var/folders/.../alephauto-test-mytest-abc123/.git',
  cleanup: async () => { /* cleanup function */ }
}
```

#### `createMultipleTempRepositories(count, namePrefix, options)`

Creates multiple test repositories at once.

```javascript
const repos = await createMultipleTempRepositories(3, 'repo', {
  initGit: true,
  createFiles: ['README.md']
});

// repos = [repo1, repo2, repo3]
console.log(repos[0].path);
console.log(repos[1].path);
console.log(repos[2].path);

// Cleanup all
await cleanupRepositories(repos);
```

#### `cleanupRepositories(repositories)`

Cleanup multiple repositories at once.

```javascript
const repos = await createMultipleTempRepositories(5, 'test');

// ... run tests ...

// Cleanup all repositories
await cleanupRepositories(repos);
```

### Automatic Cleanup

The test fixtures system integrates with Node.js test runner hooks:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import { createTempRepository } from '../fixtures/test-helpers.js';

describe('My Test Suite', () => {
  let testRepo;

  beforeEach(async () => {
    testRepo = await createTempRepository('test');
  });

  afterEach(async () => {
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  it('should do something', async () => {
    // Test uses testRepo.path
    // Automatic cleanup happens in afterEach
  });
});
```

### Pre-Commit Path Validation

A pre-commit hook prevents hardcoded paths from being committed.

**Hook Location:** `git-hooks/pre-commit`

**What It Checks:**
- No hardcoded `/tmp/` paths
- No hardcoded `/var/folders/` paths
- No hardcoded user home paths (`/Users/username/`)
- Exceptions for documentation and examples

**Validation Script:**
```bash
npm run test:validate-paths
```

**Example Output:**
```
✅ No hardcoded paths found in test files
```

**If Validation Fails:**
```
❌ Found hardcoded paths in test files:

tests/unit/my-test.js:15
  const testPath = '/tmp/test-repo';

Use createTempRepository() instead:
  const testRepo = await createTempRepository('test');
  const testPath = testRepo.path;
```

**Installation:**
```bash
# Install git hooks
bash git-hooks/install.sh

# Or manually link
ln -s ../../git-hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

---

## Test Suites

### Unit Tests

#### 1. RepomixWorker Tests (8 tests) ✅

**File:** `tests/unit/repomix-worker.test.js`

**Status:** All 8 tests passing

**Coverage:**
- Job creation with correct structure
- Unique job ID generation
- Output directory structure creation
- Multiple job queuing
- SidequestServer inheritance
- Event emission
- Custom worker options
- Concurrent job processing

**Example Test:**
```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { RepomixWorker } from '../../sidequest/repomix-worker.js';
import { createTempRepository } from '../fixtures/test-helpers.js';

describe('RepomixWorker', () => {
  let worker;
  let testRepo;

  beforeEach(async () => {
    testRepo = await createTempRepository('test');
    worker = new RepomixWorker({
      maxConcurrent: 2,
      outputBaseDir: testRepo.path
    });
  });

  afterEach(async () => {
    if (testRepo) await testRepo.cleanup();
  });

  it('should create job with correct structure', async () => {
    const job = worker.createJob({
      path: testRepo.path,
      outputPath: `${testRepo.path}/output`
    });

    assert.strictEqual(job.type, 'repomix');
    assert.strictEqual(job.status, 'created');
    assert.strictEqual(job.data.path, testRepo.path);
    assert.ok(job.id);
  });

  it('should emit job:created event', async () => {
    let eventFired = false;

    worker.on('job:created', (job) => {
      eventFired = true;
      assert.strictEqual(job.type, 'repomix');
    });

    worker.createJob({ path: testRepo.path });

    assert.strictEqual(eventFired, true);
  });
});
```

#### 2. MCP Server Tests (16 tests) ⚠️

**File:** `tests/unit/mcp-server.test.js`

**Status:** 10-13/16 passing (intermittent MCP server timing issues)

**Coverage:**
- Server initialization and handshake
- Tools discovery (list available tools)
- Resources discovery
- JSONRPC protocol compliance
- Tool execution and validation
- Error handling
- Capability negotiation

**Known Issues:**
- Intermittent failures due to MCP server response timing
- Server startup delays can cause timeout failures
- Tools discovery may fail if server not fully initialized

**Example Test:**
```javascript
describe('MCP Server', () => {
  let mcpClient;

  beforeEach(async () => {
    mcpClient = await initializeMCPServer({
      timeout: 10000  // Increased timeout for server startup
    });
  });

  afterEach(async () => {
    if (mcpClient) {
      await mcpClient.close();
    }
  });

  it('should initialize and handshake', async () => {
    const capabilities = await mcpClient.getCapabilities();
    assert.ok(capabilities.tools);
    assert.ok(capabilities.resources);
  });

  it('should list available tools', async () => {
    const tools = await mcpClient.listTools();
    assert.ok(Array.isArray(tools));
    assert.ok(tools.length > 0);
  });
});
```

#### 3. Directory Scanner Tests (13 tests) ✅

**File:** `tests/unit/directory-scanner.test.js`

**Status:** All 13 tests passing

**Coverage:**
- Directory traversal and recursion
- Exclusion patterns
- Depth limits
- Symlink handling
- Hidden directory filtering
- Statistical reporting
- Error handling

#### 4. Schema MCP Tools Tests (31 tests) ✅

**File:** `tests/unit/schema-mcp-tools.test.js`

**Status:** All 31 tests passing

**Coverage:**
- Schema type detection
- Schema generation
- Schema validation
- Impact measurement
- Rich results eligibility
- SEO improvements tracking

#### 5. Test Utilities Tests (31 tests) ✅

**File:** `tests/utils/test-utilities.test.js`

**Status:** All 31 tests passing

**Coverage:**
- createTempRepository() function
- createMultipleTempRepositories() function
- cleanupRepositories() function
- Path validation
- Git initialization
- File creation helpers
- Cleanup automation

### Integration Tests

#### 1. Automated Pipeline Test

**File:** `tests/integration/test-automated-pipeline.js`

**What It Tests:**
- End-to-end pipeline execution
- Job queue management
- Event emission and handling
- Output file generation
- Error handling and recovery

**Example:**
```javascript
describe('Automated Pipeline Integration', () => {
  it('should process multiple repositories', async () => {
    const repos = await createMultipleTempRepositories(3, 'repo', {
      initGit: true,
      createFiles: ['README.md', 'index.js']
    });

    const worker = new RepomixWorker({ maxConcurrent: 2 });

    // Create jobs for all repos
    repos.forEach(repo => {
      worker.createJob({ path: repo.path });
    });

    // Wait for completion
    await worker.waitForCompletion();

    // Verify outputs
    assert.strictEqual(worker.completedJobs.length, 3);
    assert.strictEqual(worker.failedJobs.length, 0);

    await cleanupRepositories(repos);
  });
});
```

#### 2. Cache Layer Test

**File:** `tests/integration/test-cache-layer.js`

**What It Tests:**
- Redis connection
- Cache key generation
- Cache hit/miss tracking
- TTL expiration
- Cache invalidation on repo changes

#### 3. Inter-Project Scan Test

**File:** `tests/integration/test-inter-project-scan.js`

**What It Tests:**
- Multi-repository scanning
- Duplicate detection across projects
- Similarity scoring
- Report generation

#### 4. WebSocket Events Test

**File:** `tests/integration/test-websocket-events.js`

**What It Tests:**
- WebSocket connection
- Real-time event broadcasting
- Job status updates
- Client subscription
- Event data format

#### 5. Sentry Integration Test

**File:** `tests/integration/test-sentry-integration.js`

**What It Tests:**
- Sentry initialization
- Error capture
- Performance transactions
- Breadcrumb tracking
- Error grouping

### Accuracy Tests

#### Duplicate Detection Accuracy

**File:** `tests/accuracy/accuracy-test.js`

**What It Tests:**
- Duplicate detection accuracy across various code patterns
- False positive/negative rates
- Similarity scoring thresholds
- Expected vs actual results comparison

**Test Data:**
- 50+ code samples in `tests/accuracy/fixtures/`
- Expected results in `tests/accuracy/expected-results.json`
- Various programming languages and patterns

**Example:**
```javascript
describe('Duplicate Detection Accuracy', () => {
  const fixtures = loadFixtures('tests/accuracy/fixtures/');
  const expected = loadExpected('tests/accuracy/expected-results.json');

  fixtures.forEach(fixture => {
    it(`should correctly detect duplicates in ${fixture.name}`, async () => {
      const result = await detectDuplicates(fixture.code);
      const expectedResult = expected[fixture.name];

      assert.deepStrictEqual(result.duplicates, expectedResult.duplicates);
      assert.strictEqual(result.accuracy, expectedResult.accuracy);
    });
  });
});
```

---

## Running Tests

### All Tests

```bash
# Run all unit tests
npm test

# Run integration tests
npm run test:integration

# Run all tests (unit + integration)
npm run test:all

# Run specific test file
doppler run -- node --test tests/unit/repomix-worker.test.js
```

### Specific Test Suites

```bash
# RepomixWorker tests
doppler run -- node --test tests/unit/repomix-worker.test.js

# MCP Server tests
doppler run -- node --test tests/unit/mcp-server.test.js

# Directory Scanner tests
doppler run -- node --test tests/unit/directory-scanner.test.js

# Schema MCP Tools tests
doppler run -- node --test tests/unit/schema-mcp-tools.test.js
```

### Integration Tests

```bash
# Automated pipeline test
doppler run -- node tests/integration/test-automated-pipeline.js

# Cache layer test
doppler run -- node tests/integration/test-cache-layer.js

# WebSocket events test
doppler run -- node tests/integration/test-websocket-events.js
```

### Test Options

```bash
# Verbose output
npm test -- --reporter=spec

# Watch mode (auto-rerun on changes)
npm test -- --watch

# Run tests matching pattern
npm test -- --grep "RepomixWorker"

# Run single test
npm test -- --grep "should create job with correct structure"
```

### Validation Tests

```bash
# Validate test paths (pre-commit check)
npm run test:validate-paths

# Type checking
npm run typecheck

# Lint tests
npm run lint:tests
```

---

## Writing Tests

### Test Template

Use this template for new test files:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createTempRepository, cleanupRepositories } from '../fixtures/test-helpers.js';
import { MyComponent } from '../../lib/my-component.js';

describe('MyComponent', () => {
  let testRepo;
  let component;

  beforeEach(async () => {
    // Setup: Create test repository
    testRepo = await createTempRepository('test', {
      initGit: true,
      createFiles: ['README.md']
    });

    // Initialize component
    component = new MyComponent({
      basePath: testRepo.path
    });
  });

  afterEach(async () => {
    // Cleanup: Remove test repository
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  it('should do something', async () => {
    // Arrange
    const inputData = { /* test data */ };

    // Act
    const result = await component.process(inputData);

    // Assert
    assert.ok(result);
    assert.strictEqual(result.status, 'success');
  });

  it('should handle errors gracefully', async () => {
    // Arrange
    const invalidData = null;

    // Act & Assert
    await assert.rejects(
      async () => await component.process(invalidData),
      {
        name: 'Error',
        message: /Invalid input/
      }
    );
  });
});
```

### Best Practices

#### 1. Use Test Fixtures

**❌ WRONG - Hardcoded paths:**
```javascript
const testPath = '/tmp/test-repo';
fs.mkdirSync(testPath);
// ... test code ...
fs.rmSync(testPath, { recursive: true });
```

**✅ CORRECT - Use fixtures:**
```javascript
const testRepo = await createTempRepository('test');
// ... test code ...
await testRepo.cleanup();  // Automatic in afterEach
```

#### 2. Isolate Tests

**❌ WRONG - Shared state:**
```javascript
let sharedRepo;

beforeEach(() => {
  sharedRepo = createTempRepository('shared');  // Reused across tests
});

it('test 1', () => {
  fs.writeFileSync(`${sharedRepo.path}/file.txt`, 'data');
});

it('test 2', () => {
  // file.txt might exist from test 1!
  const exists = fs.existsSync(`${sharedRepo.path}/file.txt`);
});
```

**✅ CORRECT - Isolated state:**
```javascript
let testRepo;

beforeEach(async () => {
  testRepo = await createTempRepository('test');  // Fresh repo each test
});

afterEach(async () => {
  await testRepo.cleanup();  // Clean up after each test
});

it('test 1', async () => {
  fs.writeFileSync(`${testRepo.path}/file.txt`, 'data');
});

it('test 2', async () => {
  // file.txt will NOT exist - fresh repo
  const exists = fs.existsSync(`${testRepo.path}/file.txt`);
  assert.strictEqual(exists, false);
});
```

#### 3. Use Descriptive Test Names

**❌ WRONG - Vague names:**
```javascript
it('works', () => { /* ... */ });
it('test 1', () => { /* ... */ });
it('should work correctly', () => { /* ... */ });
```

**✅ CORRECT - Descriptive names:**
```javascript
it('should create job with correct structure', () => { /* ... */ });
it('should emit job:created event', () => { /* ... */ });
it('should handle missing directory gracefully', () => { /* ... */ });
```

#### 4. Test Error Cases

**❌ WRONG - Only happy path:**
```javascript
it('should process file', async () => {
  const result = await processFile('file.txt');
  assert.ok(result);
});
```

**✅ CORRECT - Test error cases too:**
```javascript
it('should process file successfully', async () => {
  const result = await processFile('file.txt');
  assert.ok(result);
});

it('should throw error for missing file', async () => {
  await assert.rejects(
    async () => await processFile('missing.txt'),
    { message: /File not found/ }
  );
});

it('should handle invalid file format', async () => {
  await assert.rejects(
    async () => await processFile('invalid.bin'),
    { message: /Invalid format/ }
  );
});
```

#### 5. Use Async/Await Properly

**❌ WRONG - Missing await:**
```javascript
it('should complete async operation', async () => {
  worker.createJob({ path: testRepo.path });  // Missing await!
  assert.strictEqual(worker.jobs.length, 1);  // May fail due to race condition
});
```

**✅ CORRECT - Proper await:**
```javascript
it('should complete async operation', async () => {
  await worker.createJob({ path: testRepo.path });
  assert.strictEqual(worker.jobs.length, 1);
});
```

### Assertion Examples

```javascript
// Equality
assert.strictEqual(actual, expected);
assert.deepStrictEqual(actualObj, expectedObj);

// Truthiness
assert.ok(value);
assert.strictEqual(value, true);

// Type checking
assert.strictEqual(typeof value, 'string');
assert.ok(value instanceof MyClass);

// Array/Object checks
assert.ok(Array.isArray(value));
assert.strictEqual(array.length, 3);
assert.ok(Object.keys(obj).includes('key'));

// Error handling
await assert.rejects(
  async () => await someAsyncFunction(),
  {
    name: 'Error',
    message: /Expected error message/
  }
);

// Custom assertions
assert.ok(value > 0, 'Value should be positive');
assert.strictEqual(result.status, 'success', 'Operation should succeed');
```

---

## CI/CD Integration

### GitHub Actions

**File:** `.github/workflows/test.yml`

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Validate test paths
        run: npm run test:validate-paths

      - name: Run unit tests
        run: npm test

      - name: Run integration tests
        run: npm run test:integration
        env:
          REDIS_URL: redis://localhost:6379

      - name: Type checking
        run: npm run typecheck

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### Pre-Commit Hooks

**File:** `.git/hooks/pre-commit`

```bash
#!/bin/bash

# Validate test paths
echo "Validating test paths..."
npm run test:validate-paths

if [ $? -ne 0 ]; then
  echo "❌ Test path validation failed"
  exit 1
fi

# Run tests
echo "Running tests..."
npm test

if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi

echo "✅ All checks passed"
exit 0
```

**Installation:**
```bash
bash git-hooks/install.sh
```

---

## Troubleshooting

### Common Test Issues

#### Issue: Tests Failing with "Directory Not Found"

**Symptom:**
```
Error: ENOENT: no such file or directory, open '/tmp/test-repo-abc123/file.txt'
```

**Solution:**
Ensure you're using `createTempRepository()` and waiting for it to complete:

```javascript
// ❌ WRONG
const testRepo = createTempRepository('test');  // Missing await!
const file = `${testRepo.path}/file.txt`;  // testRepo is undefined

// ✅ CORRECT
const testRepo = await createTempRepository('test');
const file = `${testRepo.path}/file.txt`;
```

#### Issue: Tests Passing Locally but Failing in CI

**Symptom:**
Tests pass on your machine but fail in GitHub Actions or other CI environments.

**Common Causes:**
1. **Hardcoded paths**: Use test fixtures instead
2. **Timing issues**: Increase timeouts for slower CI environments
3. **Missing dependencies**: Ensure all dependencies are in `package.json`
4. **Environment variables**: Check that CI has access to required env vars

**Solution:**
```javascript
// Increase timeouts for CI
const timeout = process.env.CI ? 10000 : 5000;

it('should complete within timeout', { timeout }, async () => {
  await longRunningOperation();
});
```

#### Issue: MCP Server Tests Intermittently Failing

**Symptom:**
MCP server tests sometimes pass, sometimes fail with timeout errors.

**Solution:**
1. Increase server initialization timeout
2. Add retry logic for server connection
3. Wait for server ready event

```javascript
async function waitForMCPServer(client, timeout = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      await client.ping();
      return;  // Server ready
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw new Error('MCP server initialization timeout');
}

beforeEach(async () => {
  mcpClient = await initializeMCPServer();
  await waitForMCPServer(mcpClient, 10000);
});
```

#### Issue: Memory Leaks in Tests

**Symptom:**
Tests slow down over time, or Node.js runs out of memory.

**Solution:**
1. Ensure proper cleanup in `afterEach`
2. Clear event listeners
3. Close connections and streams

```javascript
afterEach(async () => {
  // Cleanup repository
  if (testRepo) {
    await testRepo.cleanup();
  }

  // Remove event listeners
  if (worker) {
    worker.removeAllListeners();
  }

  // Close connections
  if (dbConnection) {
    await dbConnection.close();
  }

  // Force garbage collection (if enabled)
  if (global.gc) {
    global.gc();
  }
});
```

#### Issue: Redis Connection Errors

**Symptom:**
```
Error: Redis connection to localhost:6379 failed
```

**Solution:**
1. Ensure Redis is running: `redis-cli ping`
2. Start Redis: `brew services start redis` (macOS)
3. Check Redis URL: `echo $REDIS_URL`

```bash
# Install Redis
brew install redis

# Start Redis
brew services start redis

# Test connection
redis-cli ping  # Should return PONG

# Run tests with Redis
npm run test:integration
```

### Debugging Tests

#### Enable Debug Logging

```bash
# Enable debug logs
LOG_LEVEL=debug npm test

# Enable Doppler debug
DOPPLER_DEBUG=1 npm test

# Enable Node.js debug
NODE_DEBUG=* npm test
```

#### Run Single Test

```bash
# Run specific test file
node --test tests/unit/repomix-worker.test.js

# Run single test case
node --test tests/unit/repomix-worker.test.js --grep "should create job"

# Run with inspector (debugger)
node --inspect-brk --test tests/unit/repomix-worker.test.js
```

#### Use Console Logging

```javascript
it('should process data', async () => {
  console.log('Test repo:', testRepo.path);

  const result = await processData(testRepo.path);

  console.log('Result:', JSON.stringify(result, null, 2));

  assert.ok(result);
});
```

---

## Test Coverage

### Generate Coverage Report

```bash
# Generate coverage (requires c8)
npm install -g c8

# Run tests with coverage
c8 npm test

# Generate HTML report
c8 --reporter=html npm test

# Open report
open coverage/index.html
```

### Coverage Goals

- **Unit Tests**: >80% coverage
- **Integration Tests**: >60% coverage
- **Critical Paths**: 100% coverage
  - Job queue management
  - Error handling
  - Event emission
  - Data validation

---

## Additional Resources

- [Node.js Test Runner Documentation](https://nodejs.org/api/test.html)
- [Test Fixtures Guide](../fixtures/README.md)
- [CI/CD Setup Guide](../docs/deployment/ci-cd.md)
- [Debugging Tests Guide](../docs/testing/debugging.md)
