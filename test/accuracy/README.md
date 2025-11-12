# Duplicate Detection Accuracy Test Suite

This directory contains a comprehensive test suite for validating the accuracy of the duplicate detection system.

## Contents

### Test Fixtures (`fixtures/`)

A test repository with known duplicates organized by category:

- **`src/utils/`**
  - `array-helpers.js` - Array manipulation patterns (filter, map, etc.)
  - `object-helpers.js` - Object manipulation patterns (stringify, merge, keys)
  - `edge-cases.js` - Edge cases (single-line vs multi-line, arrow vs regular functions)

- **`src/api/`**
  - `routes.js` - Express route handlers, error responses, auth middleware

- **`src/database/`**
  - `queries.js` - Prisma queries, count operations, error handling

- **`src/config/`**
  - `env.js` - Environment variable access, config builders

### Ground Truth (`expected-results.json`)

Defines the expected duplicate groups with:
- 16 duplicate groups
- 41 duplicate functions total
- 11 exact duplicate groups
- 5 structural duplicate groups
- 8 false positive candidates (functions that should NOT be detected)

### Test Framework

- **`metrics.js`** - Accuracy metrics calculations
  - Precision: TP / (TP + FP)
  - Recall: TP / (TP + FN)
  - F1 Score: Harmonic mean of precision and recall
  - False Positive Rate: FP / (FP + TN)

- **`accuracy-test.js`** - Main test suite
  - Runs duplicate detection on test fixtures
  - Compares results against ground truth
  - Calculates accuracy metrics
  - Generates detailed report

## Running Tests

### Basic Test

```bash
node test/accuracy/accuracy-test.js
```

### Verbose Output

Shows detailed results including all true positives, false positives, and false negatives:

```bash
node test/accuracy/accuracy-test.js --verbose
```

### Save Results

Saves full accuracy report to JSON file:

```bash
node test/accuracy/accuracy-test.js --save-results
```

### Combined

```bash
node test/accuracy/accuracy-test.js --verbose --save-results
```

## Accuracy Targets

From `expected-results.json`:

| Metric | Target | Interpretation |
|--------|--------|----------------|
| **Precision** | ≥90% | Minimize false positives |
| **Recall** | ≥80% | Catch most duplicates |
| **F1 Score** | ≥85% | Balance precision/recall |
| **FP Rate** | ≤10% | Low false alarm rate |

## Test Categories

### Exact Duplicates

Functions with identical logic (ignoring comments and whitespace):

- Group 1: `filter().map()` pattern (3 functions)
- Group 3: Comments only different (2 functions)
- Group 4: Whitespace differences (2 functions)
- Group 5: JSON.stringify (3 functions)
- Group 8: 404 error handlers (3 functions)
- Group 10: Auth middleware (2 functions)
- Group 12: Prisma count (2 functions)
- Group 13: Try-catch error handling (2 functions)
- Group 14: ENV with defaults (3 functions)
- Group 16: Config builders (2 functions)

### Structural Duplicates

Functions with same structure but different variable names:

- Group 2: Filter/map with different names (2 functions)
- Group 6: Object spread merging (2 functions)
- Group 7: Object.keys().map() (2 functions)
- Group 9: Success responses (2 functions)
- Group 11: Prisma findMany (3 functions)
- Group 15: Boolean ENV parsing (2 functions)

### False Positive Candidates

Functions that look similar but should NOT be detected as duplicates:

1. `getAllUserNames` - Missing filter step
2. `getUserNamesReversed` - Additional reverse operation
3. `deepMerge` - Different implementation (Object.assign)
4. `listKeys` - Missing map transformation
5. `sendCreatedResponse` - Different status code (201 vs 200)
6. `requireAdmin` - Additional authorization check
7. `countActiveUsers` - Filtered count vs total count
8. `isDevelopment` - Negated logic

## Edge Cases Tested

1. **Single-line vs multi-line formatting**
2. **Arrow functions vs regular functions**
3. **Template literals vs string concatenation**
4. **Destructuring vs property access**
5. **Ternary vs if-else**
6. **Same structure, opposite logic** (max vs min)
7. **Same logic, same order**
8. **Nested functions**
9. **Try-catch with different messages**
10. **Default parameters**
11. **Array methods vs spread operators**
12. **Empty function bodies**
13. **Constants with same values**
14. **Complex nested logic**
15. **Chained method calls**

## Understanding Results

### Precision

**Definition:** Of all the duplicates we detected, how many are actually duplicates?

- **High precision** (≥90%) = Few false positives
- **Low precision** (<70%) = Many false alarms

### Recall

**Definition:** Of all the actual duplicates, how many did we detect?

- **High recall** (≥80%) = Catching most duplicates
- **Low recall** (<70%) = Missing many duplicates

### F1 Score

**Definition:** Harmonic mean balancing precision and recall

- **High F1** (≥85%) = Good balance
- **Low F1** (<70%) = Poor overall performance

### False Positive Rate

**Definition:** Of all non-duplicates, how many did we incorrectly flag?

- **Low FP rate** (≤10%) = Reliable detections
- **High FP rate** (>30%) = Too many false alarms

## Grading System

The test suite assigns an overall grade based on combined metrics:

- **A+ (95%+):** Exceptional accuracy
- **A (90-95%):** Excellent accuracy
- **B+ (85-90%):** Very good accuracy
- **B (80-85%):** Good accuracy
- **C+ (75-80%):** Acceptable accuracy
- **C (70-75%):** Marginal accuracy
- **D (60-70%):** Poor accuracy
- **F (<60%):** Failing accuracy

## Interpreting Output

### Example Output

```
ACCURACY METRICS
======================================================================

Precision:    95.00% - Excellent
              19 correct / 20 detected

Recall:       85.00% - Good
              17 detected / 20 expected

F1 Score:     89.75% - Excellent
              (harmonic mean of precision and recall)

FP Rate:       5.00% - Excellent
              1 false alarms / 20 non-duplicates

TARGET COMPARISON
======================================================================

Precision:   ✅ Target: 90%, Actual: 95.00% (+5.0%)
Recall:      ✅ Target: 80%, Actual: 85.00% (+5.0%)
F1 Score:    ✅ Target: 85%, Actual: 89.75% (+4.8%)
FP Rate:     ✅ Target: <10%, Actual: 5.00% (+5.0%)

OVERALL ASSESSMENT
======================================================================

Grade:              A
All Targets Met:    ✅ YES
```

## Continuous Improvement

Use this test suite to:

1. **Validate changes** - Run after algorithm modifications
2. **Tune thresholds** - Adjust similarity thresholds to optimize metrics
3. **Add test cases** - Expand fixtures with new patterns
4. **Track progress** - Monitor metrics over time
5. **Regression testing** - Ensure changes don't reduce accuracy

## Adding New Test Cases

To add new test cases:

1. Add functions to appropriate fixture file
2. Update `expected-results.json` with new groups
3. Run test to validate
4. Adjust as needed

## Files Generated

When run with `--save-results`:

- `results/accuracy-report.json` - Full accuracy report with all metrics and details
