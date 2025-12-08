# Code Quality Issues - AlephAuto Tests

This document contains instructions for fixing code quality issues identified by automated analysis tools.

---

## Table of Contents

1. [Critical Security Issues](#critical-security-issues)
2. [Code Smells](#code-smells)
3. [Complexity Issues](#complexity-issues)

---

## Critical Security Issues

### 1. Command Injection via eval() (CWE-95)

**Severity:** CRITICAL
**File:** `tests/integration/test-deployment-workflow.js`
**Line:** 1

#### Problem

Using `eval()` with any input allows arbitrary code execution. This is one of the most dangerous security vulnerabilities in JavaScript.

```javascript
// DANGEROUS - Never do this
eval(someVariable);
eval(userInput);
```

#### How to Fix

**Option A: For JSON parsing, use JSON.parse()**
```javascript
// Before (vulnerable)
const data = eval('(' + jsonString + ')');

// After (safe)
const data = JSON.parse(jsonString);
```

**Option B: For dynamic property access, use bracket notation**
```javascript
// Before (vulnerable)
const value = eval('obj.' + propertyName);

// After (safe)
const value = obj[propertyName];
```

**Option C: For dynamic function calls, use a lookup object**
```javascript
// Before (vulnerable)
eval(functionName + '()');

// After (safe)
const allowedFunctions = {
  doSomething: doSomething,
  doOther: doOther
};
if (allowedFunctions[functionName]) {
  allowedFunctions[functionName]();
}
```

**Option D: For template evaluation, use template literals**
```javascript
// Before (vulnerable)
eval('`Hello ${name}`');

// After (safe)
const greeting = `Hello ${name}`;
```

#### References
- [CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code](https://cwe.mitre.org/data/definitions/95.html)
- [MDN: Never use eval()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval#never_use_eval!)

---

## Code Smells

### 1. Magic Number

**Severity:** Low
**File:** `tests/unit/test-scan-orchestrator-validation.ts`
**Line:** 111

#### Problem

Magic numbers are numeric literals used directly in code without explanation. They reduce readability and make maintenance difficult.

```typescript
// Before - What does 123 mean?
const result = someFunction(123);
```

#### How to Fix

Extract the magic number to a named constant with a descriptive name:

```typescript
// After - Clear intent
const EXPECTED_SCAN_COUNT = 123;
const result = someFunction(EXPECTED_SCAN_COUNT);

// Or for test fixtures
const TEST_PROJECT_ID = 123;
const result = someFunction(TEST_PROJECT_ID);
```

**Best Practices:**
- Use SCREAMING_SNAKE_CASE for constants
- Place constants at the top of the file or in a dedicated constants file
- Choose names that explain the purpose, not the value

---

## Complexity Issues

The following functions exceed complexity thresholds and should be refactored for better maintainability.

### Thresholds
- **Cyclomatic Complexity:** ≤10 (branches/decision points)
- **Cognitive Complexity:** ≤15 (mental effort to understand)
- **Function Length:** ≤50 lines
- **Nesting Depth:** ≤4 levels

---

### 1. accuracy/accuracy-test.js (Lines 139-336)

**Metrics:** Cyclomatic: 31, Cognitive: 24, Length: 198 lines

#### Problem

This function is nearly 200 lines with 31 decision points, making it extremely difficult to understand, test, and maintain.

#### How to Fix

**Step 1: Identify logical sections**
Break the function into smaller, focused helper functions:

```javascript
// Before - One massive function
async function runAccuracyTest() {
  // 200 lines of mixed concerns
}

// After - Decomposed into focused functions
async function runAccuracyTest() {
  const testData = await prepareTestData();
  const results = await executeTestSuite(testData);
  const metrics = calculateMetrics(results);
  return formatReport(metrics);
}

async function prepareTestData() {
  // 20-30 lines focused on data preparation
}

async function executeTestSuite(testData) {
  // 20-30 lines focused on execution
}

function calculateMetrics(results) {
  // 20-30 lines focused on calculations
}

function formatReport(metrics) {
  // 20-30 lines focused on formatting
}
```

**Step 2: Extract repeated patterns**
Look for similar code blocks and create reusable helpers.

**Step 3: Use early returns**
Reduce nesting by handling edge cases first:

```javascript
// Before
function process(data) {
  if (data) {
    if (data.isValid) {
      // main logic deeply nested
    }
  }
}

// After
function process(data) {
  if (!data) return null;
  if (!data.isValid) return null;

  // main logic at top level
}
```

---

### 2. integration/lib/errors/error-classifier.js (Lines 114-201)

**Metrics:** Cyclomatic: 25, Cognitive: 23, Length: 88 lines

#### Problem

High cyclomatic complexity (25) indicates too many conditional branches, likely a long if-else chain or switch statement.

#### How to Fix

**Option A: Use a lookup object (Strategy Pattern)**

```javascript
// Before - Long if-else chain
function classifyError(error) {
  if (error.code === 'ENOENT') {
    return { type: 'file_not_found', severity: 'error' };
  } else if (error.code === 'EACCES') {
    return { type: 'permission_denied', severity: 'error' };
  } else if (error.code === 'ETIMEDOUT') {
    return { type: 'timeout', severity: 'warning' };
  }
  // ... 20 more conditions
}

// After - Configuration-driven
const ERROR_CLASSIFICATIONS = {
  ENOENT: { type: 'file_not_found', severity: 'error' },
  EACCES: { type: 'permission_denied', severity: 'error' },
  ETIMEDOUT: { type: 'timeout', severity: 'warning' },
  // ... easy to add more
};

function classifyError(error) {
  return ERROR_CLASSIFICATIONS[error.code] || { type: 'unknown', severity: 'info' };
}
```

**Option B: Extract classification logic into separate functions**

```javascript
const classifiers = [
  classifyNetworkError,
  classifyFileSystemError,
  classifyValidationError,
  classifyAuthError
];

function classifyError(error) {
  for (const classify of classifiers) {
    const result = classify(error);
    if (result) return result;
  }
  return { type: 'unknown', severity: 'info' };
}
```

---

### 3. accuracy/metrics.js (Lines 71-191)

**Metrics:** Cyclomatic: 17, Cognitive: 20, Length: 121 lines

#### How to Fix

Similar to above - decompose into smaller functions:

```javascript
// Extract calculation functions
function calculatePrecision(results) { /* ... */ }
function calculateRecall(results) { /* ... */ }
function calculateF1Score(precision, recall) { /* ... */ }
function calculateConfusionMatrix(results) { /* ... */ }

// Main function becomes a coordinator
function calculateMetrics(results) {
  const precision = calculatePrecision(results);
  const recall = calculateRecall(results);
  const f1 = calculateF1Score(precision, recall);
  const confusion = calculateConfusionMatrix(results);

  return { precision, recall, f1, confusion };
}
```

---

### 4. scripts/test-multi-channel-discord.js (Lines 79-237)

**Metrics:** Cyclomatic: 19, Cognitive: 13, Length: 159 lines

#### How to Fix

**Step 1: Extract test setup and teardown**

```javascript
async function setupDiscordTest() {
  // Create test channels, webhooks, etc.
}

async function teardownDiscordTest() {
  // Clean up test resources
}
```

**Step 2: Create focused test helpers**

```javascript
async function testSingleChannelPost(channel, message) { /* ... */ }
async function testMultiChannelBroadcast(channels, message) { /* ... */ }
async function verifyMessageDelivery(channel, messageId) { /* ... */ }
```

**Step 3: Use test data builders**

```javascript
function createTestMessage(overrides = {}) {
  return {
    content: 'Test message',
    embed: null,
    ...overrides
  };
}
```

---

### 5. integration/test-error-classification-ui.js (Lines 236-303 and 308-374)

**Metrics:** Cyclomatic: 16/14, Cognitive: 12, Length: 68/67 lines

#### How to Fix

These appear to be UI test functions. Extract page object patterns:

```javascript
// Create a page object for the error classification UI
class ErrorClassificationPage {
  constructor(page) {
    this.page = page;
  }

  async selectErrorType(type) {
    await this.page.click(`[data-error-type="${type}"]`);
  }

  async submitClassification() {
    await this.page.click('[data-testid="submit-btn"]');
  }

  async getDisplayedErrors() {
    return this.page.$$eval('.error-item', items =>
      items.map(i => i.textContent)
    );
  }
}

// Test becomes cleaner
test('should classify errors correctly', async () => {
  const errorPage = new ErrorClassificationPage(page);
  await errorPage.selectErrorType('network');
  await errorPage.submitClassification();

  const errors = await errorPage.getDisplayedErrors();
  expect(errors).toContain('Network Error');
});
```

---

## General Refactoring Patterns

### Pattern 1: Extract Method
When a function does too much, extract logical sections into separate functions.

### Pattern 2: Configuration-Driven Design
Replace long if-else/switch chains with lookup objects.

### Pattern 3: Early Returns (Guard Clauses)
Handle edge cases at the start to reduce nesting.

### Pattern 4: Strategy Pattern
For multiple algorithms/behaviors, use an object mapping or array of handlers.

### Pattern 5: Page Object Pattern (for UI tests)
Encapsulate UI interactions in reusable classes.

---

## Running Quality Checks

To verify fixes, run the ast-grep-mcp quality tools:

```bash
# From ast-grep-mcp directory
cd ~/code/ast-grep-mcp

# Run complexity analysis
doppler run -- uv run python -c "
from ast_grep_mcp.features.complexity.tools import analyze_complexity_tool
result = analyze_complexity_tool(
    project_folder='/Users/alyshialedlie/code/ISPublicSites/AlephAuto/tests',
    language='javascript',
    include_patterns=['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    exclude_patterns=['**/node_modules/**'],
    cyclomatic_threshold=10,
    cognitive_threshold=15,
    length_threshold=50
)
print(f'Functions exceeding thresholds: {result[\"summary\"][\"exceeding_threshold\"]}')
"

# Run security scan
doppler run -- uv run python -c "
from ast_grep_mcp.features.quality.security_scanner import detect_security_issues_impl
result = detect_security_issues_impl(
    project_folder='/Users/alyshialedlie/code/ISPublicSites/AlephAuto/tests',
    language='javascript'
)
print(f'Security issues found: {len(result.issues)}')
"
```

---

**Generated:** 2025-12-01
**Tool:** ast-grep-mcp code quality analysis
