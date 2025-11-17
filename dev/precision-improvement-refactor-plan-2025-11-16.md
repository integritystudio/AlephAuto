# Duplicate Detection Precision Improvement: Refactoring Plan

**Created:** 2025-11-16
**Goal:** Improve precision from 59.09% to 90% while maintaining recall ≥81.25%
**Current Status:** Recall ✅ 81.25% | Precision ❌ 59.09% | F1 ❌ 68.42% | FP Rate ❌ 64.29%

---

## Executive Summary

The duplicate detection system has achieved excellent recall (81.25%), successfully identifying most true duplicates. However, precision is critically low at 59.09%, with 9 false positives out of 22 detected groups (40.9% error rate). This refactoring plan addresses the root causes through 15 discrete, testable changes organized into 5 phases.

**Key Findings:**
- **Root Cause #1:** Lack of semantic differentiation (e.g., `Math.max` vs `Math.min` detected as duplicates)
- **Root Cause #2:** No validation of logical equivalence (e.g., `!== 'production'` vs `=== 'production'`)
- **Root Cause #3:** Missing operation chain validation (e.g., `.reverse()` added makes it different)
- **Root Cause #4:** Over-aggressive normalization removes critical semantic signals
- **Root Cause #5:** No verification of side effects and return value semantics

**Expected Outcomes:**
- Phase 1-2: +15% precision (59% → 74%)
- Phase 3: +10% precision (74% → 84%)
- Phase 4-5: +6-8% precision (84% → 90-92%)
- Recall maintained at ≥80% throughout

---

## Table of Contents

1. [Current Architecture Assessment](#current-architecture-assessment)
2. [Identified Issues and Code Smells](#identified-issues-and-code-smells)
3. [Refactoring Plan (15 Steps)](#refactoring-plan)
4. [Risk Assessment](#risk-assessment)
5. [Testing Strategy](#testing-strategy)
6. [Success Metrics](#success-metrics)

---

## Current Architecture Assessment

### System Overview

**Pipeline Architecture:**
```
JavaScript (Stages 1-2)
  ├─ Repository Scanner
  └─ AST-Grep Detector
       ↓ JSON via stdin/stdout
Python (Stages 3-7)
  ├─ Block Extraction (extract_blocks.py)
  ├─ Semantic Annotation (basic category mapping)
  ├─ Duplicate Grouping (grouping.py)
  │   ├─ Layer 1: Exact Hash Matching
  │   ├─ Layer 2: Structural Similarity (structural.py)
  │   └─ Layer 3: Semantic Grouping [NOT IMPLEMENTED]
  ├─ Suggestion Generation
  └─ Report Generation
```

### Critical Components Analysis

#### 1. **`lib/similarity/structural.py`** - Code Normalization (Lines 14-74)

**Current Behavior:**
```python
def normalize_code(source_code: str) -> str:
    # Removes: comments, whitespace
    # Normalizes: strings → 'STR', numbers → 'NUM'
    # Preserves: 27 important methods (map, filter, reduce, etc.)
    # Normalizes: other identifiers → 'var'
```

**Strengths:**
- ✅ Preserves critical functional methods (map, filter, reduce)
- ✅ Handles whitespace and comment differences correctly
- ✅ Good string/number normalization

**Critical Gaps:**
- ❌ **No semantic operator preservation** - `Math.max` vs `Math.min` both become `var.var`
- ❌ **No logical operator tracking** - `!==` vs `===` normalized to same
- ❌ **No method chain length validation** - `.map().filter()` vs `.map().filter().reverse()` are similar
- ❌ **Over-normalization of critical APIs** - `fetch('/api/data')` loses endpoint information

**False Positive Example:**
```javascript
// These are detected as duplicates (WRONG!)
function findMax(arr) { return Math.max(...arr); }
function findMin(arr) { return Math.min(...arr); }

// After normalization (identical):
"return var.var(...var);"
```

#### 2. **`lib/similarity/grouping.py`** - Similarity Grouping (Lines 27-172)

**Current Behavior:**
```python
def group_by_similarity(blocks, similarity_threshold=0.90):
    # Layer 1: Exact hash matching → 1.0 similarity
    # Layer 2: Structural matching → 0.0-1.0 (Levenshtein on normalized code)
    # Layer 3: NOT IMPLEMENTED
```

**Strengths:**
- ✅ Two-layer approach is sound
- ✅ Threshold increased from 0.85 to 0.90 (recent improvement)
- ✅ Efficient O(n*k) complexity for structural matching

**Critical Gaps:**
- ❌ **No semantic layer** - Pattern ID and category not used for validation
- ❌ **No post-grouping validation** - Groups accepted without verification
- ❌ **No minimum complexity threshold** - Trivial code (e.g., `return user.name;`) grouped
- ❌ **No chain length validation** - Method chains not compared for semantic equivalence

**False Positive Example:**
```javascript
// Group 16: These are detected as duplicates (WRONG!)
res.status(200).json({ success: true });  // HTTP 200 OK
res.status(201).json({ success: true });  // HTTP 201 Created (different semantic meaning!)
```

#### 3. **`lib/extractors/extract_blocks.py`** - Block Extraction (Lines 34-246)

**Current Behavior:**
- ✅ **Function name extraction** working correctly (backward search)
- ✅ **Deduplication** working correctly (function-based)
- ✅ **Category mapping** accurate

**No Critical Issues** - This component is working well.

### Architecture Strengths

1. ✅ **Clean separation of concerns** - JS for scanning, Python for analysis
2. ✅ **Function-level extraction** - 81% recall proves this works
3. ✅ **Deduplication logic** - Reduced false positives by 48%
4. ✅ **Pydantic data models** - Type-safe, well-structured

### Architecture Weaknesses

1. ❌ **Missing semantic layer** - Layer 3 of algorithm not implemented
2. ❌ **No validation gates** - Groups created without post-validation
3. ❌ **Over-reliance on text similarity** - Levenshtein alone misses semantic differences
4. ❌ **No complexity filtering** - Trivial code creates noise

---

## Identified Issues and Code Smells

### Issue #1: Semantic Operator Loss (CRITICAL - 3 FPs)

**Location:** `lib/similarity/structural.py:39-62`

**Code Smell:** Over-normalization - critical semantic operators are lost

**Current Code:**
```python
# Lines 56-58
# All identifiers normalized to 'var' - loses Math.max vs Math.min
normalized = re.sub(r'\b[a-z][a-zA-Z0-9_]*\b', 'var', normalized)
```

**False Positives Caused:**
1. `findMax` (Math.max) vs `findMin` (Math.min) - **Opposite logic!**
2. Different fetch URLs normalized to same string
3. Different property names lost

**Impact:** 13.6% of false positives (3/22 detected groups)

**Severity:** CRITICAL

---

### Issue #2: Logical Operator Equivalence (CRITICAL - 1 FP)

**Location:** `lib/similarity/structural.py:66`

**Code Smell:** No semantic understanding of boolean logic

**Current Code:**
```python
# Line 66 - Operators normalized but not tracked
normalized = re.sub(r'\s*(=>|===?|!==?|[+\-*/%<>=&|])\s*', r' \1 ', normalized)
```

**False Positive Caused:**
```javascript
// Group 5: Detected as duplicates (WRONG!)
function isProductionMode() {
  return process.env.NODE_ENV === 'production';  // True when production
}

function isDevelopment() {
  return process.env.NODE_ENV !== 'production';  // True when NOT production (OPPOSITE!)
}
```

**After normalization:**
```
"return var.var.var !== 'STR';"  // Lost that one is === and one is !==
```

**Impact:** 4.5% of false positives (1/22 detected groups)

**Severity:** CRITICAL

---

### Issue #3: Method Chain Length Validation (HIGH - 1 FP)

**Location:** `lib/similarity/structural.py:100-141` (no chain validation)

**Code Smell:** Missing structural validation - method chains not compared

**False Positive Caused:**
```javascript
// Group 15: Detected as duplicates (WRONG!)
users.filter(u => u.active).map(u => u.name);            // 2 operations
users.filter(u => u.active).map(u => u.name).reverse();  // 3 operations (different!)
```

**After normalization:**
```
// Both become similar because .reverse() is just one more method call
var.filter(var=>var.var).map(var=>var.var);
var.filter(var=>var.var).map(var=>var.var).reverse();
// Levenshtein similarity: 0.92 (above 0.90 threshold) → FALSE POSITIVE
```

**Impact:** 4.5% of false positives

**Severity:** HIGH

---

### Issue #4: Missing Semantic Validation Layer (HIGH - 2 FPs)

**Location:** `lib/similarity/grouping.py:91-92` (Layer 3 TODO)

**Code Smell:** Incomplete implementation - semantic layer commented as TODO

**Current Code:**
```python
# Lines 91-92
# TODO: Layer 3 - Semantic similarity
# Group remaining blocks by category + semantic tags
```

**False Positives Caused:**
1. Edge case functions from `edge-cases.js` - no semantic understanding
2. Different API endpoints grouped together

**Impact:** 9.1% of false positives (2/22 detected groups)

**Severity:** HIGH

---

### Issue #5: No Minimum Complexity Threshold (MEDIUM - 2 FPs)

**Location:** `lib/similarity/grouping.py:76-83` (no complexity check)

**Code Smell:** Grouping trivial code creates noise

**Examples of Trivial Code Detected as Duplicates:**
```javascript
// Edge cases that shouldn't be grouped:
const singleLine = (arr) => arr.filter(x => x > 0).map(x => x * 2);
function multiLine(arr) {
  return arr.filter(x => x > 0).map(x => x * 2);
}
// These are trivial - no real consolidation benefit
```

**Impact:** 9.1% of false positives

**Severity:** MEDIUM

---

### Issue #6: No Post-Grouping Validation (MEDIUM)

**Location:** `lib/similarity/grouping.py:174-193` (creates groups without validation)

**Code Smell:** No validation gates - groups accepted unconditionally

**Current Code:**
```python
def _create_duplicate_group(blocks, similarity_score, similarity_method):
    # Creates group without any semantic validation
    return DuplicateGroup(
        group_id=f"dg_{blocks[0].content_hash[:12]}",
        # ... no validation checks ...
    )
```

**Missing Validations:**
1. ❌ No pattern_id consistency check (all blocks should match same pattern)
2. ❌ No category consistency check
3. ❌ No minimum group size validation (2 members minimum)
4. ❌ No semantic tag overlap check

**Impact:** Contributes to all false positives

**Severity:** MEDIUM

---

### Issue #7: String Literal Content Lost (LOW - 1 FP)

**Location:** `lib/similarity/structural.py:31-34`

**Code Smell:** Over-normalization of string literals

**Current Code:**
```python
# Lines 31-34 - All strings become 'STR'
normalized = re.sub(r"'[^']*'", "'STR'", normalized)
normalized = re.sub(r'"[^"]*"', '"STR"', normalized)
```

**False Positive Example:**
```javascript
// HTTP status codes lost
res.status(200).json({ success: true });  // OK
res.status(201).json({ success: true });  // Created (different!)
// Both normalized to: res.status(NUM).json({var:var})
```

**Impact:** 4.5% of false positives

**Severity:** LOW (can be addressed with semantic checks)

---

## Code Quality Issues

### Maintainability Issues

1. **Magic Numbers:**
   - `structural.py:100` - Threshold `0.85` (updated to `0.90`)
   - `grouping.py:29` - Threshold `0.90`
   - Should be configuration constants

2. **Lack of Docstring Details:**
   - `normalize_code()` doesn't document what's preserved
   - `_create_duplicate_group()` doesn't explain validation

3. **Debug Print Statements:**
   - `extract_blocks.py:44, 74, 97, 100, 130, 150` - Many debug prints
   - Should use proper logging levels

### Performance Issues

**None identified** - Algorithm complexity is acceptable:
- Layer 1: O(n) - hash-based
- Layer 2: O(n*k) - structural comparison where k is small
- Total: O(n*k) which is acceptable for typical codebases

---

## Refactoring Plan

### Phase 1: Semantic Operator Preservation (Target: +8% Precision)

**Goal:** Preserve critical semantic operators and method calls to prevent false positives from opposite logic.

**Expected Precision Improvement:** 59% → 67% (+8%)

---

#### Step 1.1: Add Semantic Operator Whitelist

**File:** `lib/similarity/structural.py`

**Change Type:** Enhancement (Low Risk)

**Description:** Extend the `important_methods` list to include critical semantic operators and Math methods.

**Current Code (Lines 41-49):**
```python
important_methods = {
    'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
    'slice', 'splice', 'push', 'pop', 'shift', 'unshift',
    'join', 'split', 'includes', 'indexOf',
    'get', 'set', 'has', 'delete',
    'then', 'catch', 'finally', 'async', 'await',
    'length', 'keys', 'values', 'entries',
    'reverse', 'sort', 'concat'
}
```

**New Code:**
```python
# Semantic operator and method whitelist
# These methods have semantic meaning and should be preserved during normalization
SEMANTIC_METHODS = {
    # Array functional methods (already preserved)
    'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
    'slice', 'splice', 'push', 'pop', 'shift', 'unshift',
    'join', 'split', 'includes', 'indexOf',

    # Object methods (already preserved)
    'get', 'set', 'has', 'delete',
    'keys', 'values', 'entries',

    # Async patterns (already preserved)
    'then', 'catch', 'finally', 'async', 'await',

    # Array transformations (already preserved)
    'reverse', 'sort', 'concat',

    # NEW: Math operations (opposite semantics)
    'max', 'min', 'abs', 'floor', 'ceil', 'round',

    # NEW: String operations (semantic meaning)
    'trim', 'toLowerCase', 'toUpperCase', 'replace',

    # NEW: HTTP/API methods (semantic differences)
    'status', 'json', 'send', 'redirect',

    # NEW: Properties with semantic value
    'length', 'name', 'value', 'id', 'type'
}

# Preserve important objects
SEMANTIC_OBJECTS = {
    'Math', 'Object', 'Array', 'String', 'Number', 'Boolean',
    'console', 'process', 'JSON', 'Date', 'Promise'
}
```

**Updated normalize_code() (Lines 39-62):**
```python
# Preserve important objects (Math, Object, etc.)
for obj in SEMANTIC_OBJECTS:
    normalized = re.sub(rf'\b{obj}\b', f'__PRESERVE_OBJ_{obj.upper()}__', normalized)

# Preserve important methods (existing logic)
for method in SEMANTIC_METHODS:
    normalized = re.sub(rf'\b{method}\b', f'__PRESERVE_{method.upper()}__', normalized)

# Normalize other identifiers → 'var'
normalized = re.sub(r'\b[a-z][a-zA-Z0-9_]*\b', 'var', normalized)
normalized = re.sub(r'\b[A-Z][A-Z0-9_]*\b', 'CONST', normalized)

# Restore preserved objects
for obj in SEMANTIC_OBJECTS:
    normalized = normalized.replace(f'__PRESERVE_OBJ_{obj.upper()}__', obj)

# Restore preserved methods (existing logic)
for method in SEMANTIC_METHODS:
    normalized = normalized.replace(f'__PRESERVE_{method.upper()}__', method)
```

**Testing:**
```python
# Test case 1: Math.max vs Math.min
code1 = "return Math.max(...arr);"
code2 = "return Math.min(...arr);"

norm1 = normalize_code(code1)  # "return Math.max(...var);"
norm2 = normalize_code(code2)  # "return Math.min(...var);"
assert norm1 != norm2  # ✅ Should be different!
```

**Rollback Strategy:**
- Revert to original `important_methods` set
- Remove `SEMANTIC_OBJECTS` preservation
- No data migration needed

**Estimated Effort:** 2 hours

**Dependencies:** None

**Expected Impact:**
- ✅ Fixes findMax vs findMin false positive
- ✅ Fixes other Math method false positives
- ⚠️ Recall impact: None (more specific matching)

**Risk Level:** LOW

---

#### Step 1.2: Add Logical Operator Tracking

**File:** `lib/similarity/structural.py`

**Change Type:** Enhancement (Low Risk)

**Description:** Track and preserve logical operators (`===`, `!==`, `!`) to detect opposite logic patterns.

**New Function:**
```python
def extract_logical_operators(source_code: str) -> set:
    """
    Extract logical operators from source code for semantic comparison.

    Returns:
        Set of logical operators found (e.g., {'===', '!=='})
    """
    operators = set()

    # Find all logical operators
    operator_patterns = [
        r'!==',  # Strict inequality
        r'===',  # Strict equality
        r'!=',   # Loose inequality
        r'==',   # Loose equality
        r'!',    # Logical NOT (when not part of !== or !=)
    ]

    for pattern in operator_patterns:
        if pattern in ['!==', '!=']:
            # Direct string search for compound operators
            if pattern in source_code:
                operators.add(pattern)
        elif pattern == '!':
            # Match standalone ! (not part of !== or !=)
            matches = re.finditer(r'(?<![!=])!(?![=])', source_code)
            if any(matches):
                operators.add('!')
        else:
            if pattern in source_code:
                operators.add(pattern)

    return operators
```

**Updated calculate_structural_similarity() (Lines 100-141):**
```python
def calculate_structural_similarity(code1: str, code2: str, threshold: float = 0.90) -> Tuple[float, str]:
    """
    Calculate structural similarity with logical operator validation.
    """
    if not code1 or not code2:
        return 0.0, 'different'

    # Layer 1: Exact content match (fastest)
    hash1 = hashlib.sha256(code1.encode()).hexdigest()
    hash2 = hashlib.sha256(code2.encode()).hexdigest()

    if hash1 == hash2:
        return 1.0, 'exact'

    # NEW: Layer 1.5: Logical operator check
    # If operators are opposite, reduce similarity
    ops1 = extract_logical_operators(code1)
    ops2 = extract_logical_operators(code2)

    # Check for opposite logic (=== vs !==, or presence of ! in one but not other)
    opposite_pairs = [
        ({'==='}, {'!=='}),
        ({'=='}, {'!='}),
        ({'!'}, set()),  # One has !, other doesn't
    ]

    has_opposite_logic = False
    for pair1, pair2 in opposite_pairs:
        if (pair1.issubset(ops1) and pair2.issubset(ops2)) or \
           (pair2.issubset(ops1) and pair1.issubset(ops2)):
            has_opposite_logic = True
            break

    # Layer 2: Structural match (normalize and compare)
    normalized1 = normalize_code(code1)
    normalized2 = normalize_code(code2)

    # Check if normalized versions are identical (structural duplicate)
    if normalized1 == normalized2:
        # If opposite logic detected, demote to lower similarity
        if has_opposite_logic:
            return 0.75, 'structural_opposite_logic'  # Below threshold
        return 0.95, 'structural'

    # Calculate similarity ratio using Levenshtein
    similarity = calculate_levenshtein_similarity(normalized1, normalized2)

    # Penalize opposite logic even if structurally similar
    if has_opposite_logic and similarity >= threshold:
        similarity *= 0.8  # 20% penalty → likely falls below threshold

    # Determine method based on similarity score
    if similarity >= threshold:
        return similarity, 'structural'
    else:
        return similarity, 'different'
```

**Testing:**
```python
# Test case 2: Opposite logic
code1 = "return process.env.NODE_ENV === 'production';"
code2 = "return process.env.NODE_ENV !== 'production';"

similarity, method = calculate_structural_similarity(code1, code2)
assert similarity < 0.90  # ✅ Should be below threshold (opposite logic)
assert method == 'different'
```

**Rollback Strategy:**
- Remove `extract_logical_operators()` function
- Remove logical operator checks from `calculate_structural_similarity()`
- Revert to original similarity calculation

**Estimated Effort:** 3 hours

**Dependencies:** Step 1.1

**Expected Impact:**
- ✅ Fixes `isProductionMode` vs `isDevelopment` false positive
- ⚠️ Recall impact: None (only affects opposite logic)

**Risk Level:** LOW

---

#### Step 1.3: Add HTTP Status Code Validation

**File:** `lib/similarity/structural.py`

**Change Type:** Enhancement (Low Risk)

**Description:** Special handling for HTTP status codes - preserve their semantic meaning.

**New Function:**
```python
def extract_http_status_codes(source_code: str) -> set:
    """
    Extract HTTP status codes from response patterns.

    Returns:
        Set of status codes (e.g., {200, 201, 404})
    """
    status_codes = set()

    # Pattern: res.status(200), response.status(404), etc.
    pattern = r'(?:res|response)\.status\((\d{3})\)'
    matches = re.finditer(pattern, source_code)

    for match in matches:
        status_codes.add(int(match.group(1)))

    return status_codes
```

**Updated calculate_structural_similarity():**
```python
# After logical operator check, add HTTP status code check:

# NEW: Layer 1.6: HTTP status code check
# Different status codes = different semantics (200 OK vs 201 Created)
status_codes1 = extract_http_status_codes(code1)
status_codes2 = extract_http_status_codes(code2)

if status_codes1 and status_codes2 and status_codes1 != status_codes2:
    # Different status codes → reduce similarity
    similarity *= 0.7  # 30% penalty
```

**Testing:**
```python
# Test case 3: Different HTTP status codes
code1 = "res.status(200).json({ success: true });"
code2 = "res.status(201).json({ success: true });"

similarity, method = calculate_structural_similarity(code1, code2)
assert similarity < 0.90  # ✅ Should be below threshold
```

**Rollback Strategy:**
- Remove `extract_http_status_codes()` function
- Remove status code checks from similarity calculation

**Estimated Effort:** 1.5 hours

**Dependencies:** Step 1.2

**Expected Impact:**
- ✅ Fixes `sendCreatedResponse` (201) vs other responses (200) false positive
- ⚠️ Recall impact: None

**Risk Level:** LOW

---

### Phase 1 Summary

**Total Effort:** 6.5 hours
**Expected Precision:** 59% → 67% (+8%)
**Risk Level:** LOW
**Rollback:** Easy (isolated changes)

**Tests to Run After Phase 1:**
```bash
node test/accuracy/accuracy-test.js --verbose
# Expected: 3 fewer false positives (findMax/findMin, isDevelopment, sendCreatedResponse)
```

---

### Phase 2: Method Chain Validation (Target: +7% Precision)

**Goal:** Validate that method chains have the same operations and length.

**Expected Precision Improvement:** 67% → 74% (+7%)

---

#### Step 2.1: Extract Method Chain Structure

**File:** `lib/similarity/structural.py`

**Change Type:** New Feature (Medium Risk)

**Description:** Parse and compare method chains to ensure structural equivalence.

**New Function:**
```python
def extract_method_chain(source_code: str) -> list:
    """
    Extract method chain structure from code.

    Returns:
        List of methods in chain order (e.g., ['filter', 'map', 'reverse'])
    """
    # Pattern: .method1().method2().method3()
    # Handles both arr.filter().map() and arr.filter(fn).map(fn)

    chains = []

    # Find chained method calls
    # Pattern: .method_name( ... ).method_name( ... )
    pattern = r'\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\('
    matches = re.finditer(pattern, source_code)

    current_chain = []
    last_end = -1

    for match in matches:
        method_name = match.group(1)

        # Check if this is part of same chain (consecutive matches)
        if last_end == -1 or match.start() > last_end:
            if current_chain:
                chains.append(current_chain)
            current_chain = [method_name]
        else:
            current_chain.append(method_name)

        # Find matching closing paren to get end position
        # (simplified - in production would need proper paren matching)
        last_end = source_code.find(')', match.end())

    if current_chain:
        chains.append(current_chain)

    # Return longest chain (most significant)
    return max(chains, key=len) if chains else []


def compare_method_chains(code1: str, code2: str) -> float:
    """
    Compare method chain structure between two code blocks.

    Returns:
        Similarity score 0.0-1.0 based on chain overlap
    """
    chain1 = extract_method_chain(code1)
    chain2 = extract_method_chain(code2)

    if not chain1 and not chain2:
        return 1.0  # No chains in either

    if not chain1 or not chain2:
        return 0.5  # One has chain, other doesn't

    # Exact match
    if chain1 == chain2:
        return 1.0

    # Check if one is a subset of the other (additional operation)
    if len(chain1) != len(chain2):
        # Different length chains → likely different behavior
        # e.g., [filter, map] vs [filter, map, reverse]

        # Check if shorter is prefix of longer
        shorter = chain1 if len(chain1) < len(chain2) else chain2
        longer = chain1 if len(chain1) > len(chain2) else chain2

        if longer[:len(shorter)] == shorter:
            # One is extension of other → partial match
            # Similarity based on overlap ratio
            return len(shorter) / len(longer)
        else:
            # Different chains entirely
            return 0.0

    # Same length but different methods → check overlap
    overlap = sum(1 for m1, m2 in zip(chain1, chain2) if m1 == m2)
    return overlap / len(chain1)
```

**Testing:**
```python
# Test case 4: Method chain differences
code1 = "users.filter(u => u.active).map(u => u.name);"
code2 = "users.filter(u => u.active).map(u => u.name).reverse();"

chain1 = extract_method_chain(code1)  # ['filter', 'map']
chain2 = extract_method_chain(code2)  # ['filter', 'map', 'reverse']

similarity = compare_method_chains(code1, code2)
assert similarity == 2/3  # ✅ 66.7% overlap (2 of 3 methods match)
```

**Rollback Strategy:**
- Remove `extract_method_chain()` and `compare_method_chains()`
- No impact on existing functionality

**Estimated Effort:** 4 hours

**Dependencies:** None

**Risk Level:** MEDIUM (new parsing logic)

---

#### Step 2.2: Integrate Method Chain Validation

**File:** `lib/similarity/structural.py`

**Change Type:** Enhancement (Medium Risk)

**Description:** Use method chain comparison to adjust similarity scores.

**Updated calculate_structural_similarity():**
```python
def calculate_structural_similarity(code1: str, code2: str, threshold: float = 0.90) -> Tuple[float, str]:
    # ... existing logic ...

    # Calculate similarity ratio using Levenshtein
    similarity = calculate_levenshtein_similarity(normalized1, normalized2)

    # NEW: Layer 2.5: Method chain validation
    chain_similarity = compare_method_chains(code1, code2)

    if chain_similarity < 1.0:
        # Different chain structure → penalize similarity
        # Weight: 70% Levenshtein + 30% chain similarity
        similarity = (similarity * 0.7) + (chain_similarity * 0.3)

    # Penalize opposite logic (existing)
    if has_opposite_logic and similarity >= threshold:
        similarity *= 0.8

    # Determine method based on similarity score
    if similarity >= threshold:
        return similarity, 'structural'
    else:
        return similarity, 'different'
```

**Testing:**
```python
# Test case 5: Chain validation integration
code1 = "users.filter(u => u.active).map(u => u.name);"
code2 = "users.filter(u => u.active).map(u => u.name).reverse();"

similarity, method = calculate_structural_similarity(code1, code2)

# Levenshtein on normalized: ~0.92
# Chain similarity: 0.667 (2/3)
# Weighted: (0.92 * 0.7) + (0.667 * 0.3) = 0.644 + 0.200 = 0.844
assert similarity < 0.90  # ✅ Should be below threshold
assert method == 'different'
```

**Rollback Strategy:**
- Remove method chain validation from similarity calculation
- Revert to pure Levenshtein-based similarity

**Estimated Effort:** 2 hours

**Dependencies:** Step 2.1

**Expected Impact:**
- ✅ Fixes `getUserNamesReversed` false positive
- ⚠️ May catch additional chain-related false positives

**Risk Level:** MEDIUM

---

### Phase 2 Summary

**Total Effort:** 6 hours
**Expected Precision:** 67% → 74% (+7%)
**Risk Level:** MEDIUM
**Rollback:** Moderate (new parsing logic)

**Tests to Run After Phase 2:**
```bash
node test/accuracy/accuracy-test.js --verbose
# Expected: 1 fewer false positive (getUserNamesReversed)
```

---

### Phase 3: Semantic Validation Layer (Target: +10% Precision)

**Goal:** Implement Layer 3 semantic validation using category and pattern matching.

**Expected Precision Improvement:** 74% → 84% (+10%)

---

#### Step 3.1: Create Semantic Validator Module

**File:** `lib/similarity/semantic.py` (NEW FILE)

**Change Type:** New Feature (Medium Risk)

**Description:** Implement semantic validation using category, pattern_id, and tags.

**New File Content:**
```python
"""
Semantic Similarity Validation

Layer 3 of the multi-layer similarity algorithm.
Validates that structurally similar code blocks are also semantically equivalent.
"""

from typing import List, Optional
import sys

# Import models
try:
    sys.path.insert(0, '.')
    from lib.models.code_block import CodeBlock, SemanticCategory
except ImportError:
    pass


def are_semantically_compatible(block1: 'CodeBlock', block2: 'CodeBlock') -> bool:
    """
    Check if two code blocks are semantically compatible for grouping.

    Returns True if blocks can be considered semantic duplicates.

    Validation checks:
    1. Same pattern_id (ast-grep rule)
    2. Same category (semantic categorization)
    3. Compatible tags (if present)
    4. Similar complexity (line count within 50%)
    """

    # Check 1: Must match same ast-grep pattern
    if block1.pattern_id != block2.pattern_id:
        return False

    # Check 2: Must be same semantic category
    if block1.category != block2.category:
        return False

    # Check 3: Tag compatibility
    # If both have function tags, they must be different functions
    # (same function in same file = already deduplicated)
    tags1 = set(block1.tags)
    tags2 = set(block2.tags)

    func1 = _extract_function_tag(tags1)
    func2 = _extract_function_tag(tags2)

    if func1 and func2:
        # Both are named functions
        if func1 == func2 and block1.location.file_path == block2.location.file_path:
            # Same function in same file → already deduplicated, should not group
            return False

    # Check 4: Complexity similarity
    # Blocks should have similar size (within 50% difference)
    line_ratio = min(block1.line_count, block2.line_count) / max(block1.line_count, block2.line_count)
    if line_ratio < 0.5:
        # One block is more than 2x the size of the other
        return False

    return True


def calculate_tag_overlap(block1: 'CodeBlock', block2: 'CodeBlock') -> float:
    """
    Calculate semantic tag overlap between two blocks.

    Returns:
        Overlap ratio 0.0-1.0
    """
    tags1 = set(block1.tags)
    tags2 = set(block2.tags)

    if not tags1 and not tags2:
        return 1.0  # No tags on either

    if not tags1 or not tags2:
        return 0.5  # One has tags, other doesn't

    # Calculate Jaccard similarity
    intersection = tags1 & tags2
    union = tags1 | tags2

    return len(intersection) / len(union) if union else 0.0


def _extract_function_tag(tags: set) -> Optional[str]:
    """Extract function name from tag set."""
    for tag in tags:
        if tag.startswith('function:'):
            return tag[9:]  # Remove 'function:' prefix
    return None


def validate_duplicate_group(blocks: List['CodeBlock']) -> bool:
    """
    Validate that a group of blocks are truly semantic duplicates.

    All blocks must:
    - Match same pattern
    - Have same category
    - Be semantically compatible pairwise
    """
    if len(blocks) < 2:
        return False

    # All blocks must have same pattern_id
    pattern_ids = set(b.pattern_id for b in blocks)
    if len(pattern_ids) > 1:
        return False

    # All blocks must have same category
    categories = set(b.category for b in blocks)
    if len(categories) > 1:
        return False

    # Pairwise semantic compatibility
    for i, block1 in enumerate(blocks):
        for block2 in blocks[i+1:]:
            if not are_semantically_compatible(block1, block2):
                return False

    return True
```

**Testing:**
```python
# Test semantic validation
from lib.models.code_block import CodeBlock, SourceLocation

# Create test blocks
block1 = CodeBlock(
    block_id='test1',
    pattern_id='array-map-filter',
    category='utility',
    location=SourceLocation(file_path='test.js', line_start=1, line_end=3),
    relative_path='test.js',
    source_code='users.filter(u => u.active).map(u => u.name)',
    language='javascript',
    repository_path='/test',
    line_count=1,
    tags=['function:getUserNames']
)

block2 = CodeBlock(
    block_id='test2',
    pattern_id='array-map-filter',
    category='utility',
    location=SourceLocation(file_path='test.js', line_start=5, line_end=7),
    relative_path='test.js',
    source_code='users.filter(u => u.active).map(u => u.name).reverse()',
    language='javascript',
    repository_path='/test',
    line_count=1,
    tags=['function:getUserNamesReversed']
)

# Should be compatible (same pattern, same category)
assert are_semantically_compatible(block1, block2) == True

# Different pattern → not compatible
block3 = CodeBlock(
    block_id='test3',
    pattern_id='object-manipulation',  # DIFFERENT
    category='utility',
    location=SourceLocation(file_path='test.js', line_start=10, line_end=12),
    relative_path='test.js',
    source_code='Object.keys(data)',
    language='javascript',
    repository_path='/test',
    line_count=1,
    tags=[]
)

assert are_semantically_compatible(block1, block3) == False
```

**Rollback Strategy:**
- Delete `lib/similarity/semantic.py`
- No impact on existing code

**Estimated Effort:** 5 hours

**Dependencies:** None

**Risk Level:** MEDIUM (new module)

---

#### Step 3.2: Integrate Semantic Validation into Grouping

**File:** `lib/similarity/grouping.py`

**Change Type:** Enhancement (Medium Risk)

**Description:** Add semantic validation to group creation.

**Updated Code:**
```python
# Add import at top
from .semantic import are_semantically_compatible, validate_duplicate_group

# Update _group_by_structural_similarity (lines 118-171):

def _group_by_structural_similarity(
    blocks: List['CodeBlock'],
    threshold: float
) -> List[tuple[List['CodeBlock'], float]]:
    """
    Group blocks by structural similarity with semantic validation.
    """
    if not blocks:
        return []

    n = len(blocks)
    groups = []
    used = set()

    for i, block1 in enumerate(blocks):
        if i in used:
            continue

        group = [block1]
        similarities = []

        for j in range(i + 1, n):
            if j in used:
                continue

            block2 = blocks[j]

            # NEW: Pre-check semantic compatibility
            if not are_semantically_compatible(block1, block2):
                continue  # Skip incompatible blocks

            # Calculate structural similarity
            similarity, method = calculate_structural_similarity(
                block1.source_code,
                block2.source_code,
                threshold
            )

            if similarity >= threshold:
                group.append(block2)
                similarities.append(similarity)
                used.add(j)

        # NEW: Validate complete group
        if len(group) >= 2:
            if validate_duplicate_group(group):
                used.add(i)
                avg_similarity = sum(similarities) / len(similarities) if similarities else 1.0
                groups.append((group, avg_similarity))
            else:
                # Group failed semantic validation
                print(f"Warning: Group rejected by semantic validation: {[b.block_id for b in group]}", file=sys.stderr)

    return groups
```

**Testing:**
```bash
# Run accuracy test - should see semantic validation warnings
node test/accuracy/accuracy-test.js --verbose 2>&1 | grep "semantic validation"

# Expected: Several groups rejected due to:
# - Different pattern_id
# - Different category
# - Incompatible tags
```

**Rollback Strategy:**
- Remove semantic validation imports
- Remove `are_semantically_compatible` check
- Remove `validate_duplicate_group` check
- Revert to original grouping logic

**Estimated Effort:** 3 hours

**Dependencies:** Step 3.1

**Expected Impact:**
- ✅ Reduces edge-case false positives (different patterns grouped together)
- ✅ Prevents cross-pattern contamination
- ⚠️ May reduce some groups that were borderline

**Risk Level:** MEDIUM

---

#### Step 3.3: Add Minimum Complexity Threshold

**File:** `lib/similarity/grouping.py`

**Change Type:** Enhancement (Low Risk)

**Description:** Filter out trivial code duplicates that provide little value.

**New Configuration:**
```python
# Add at top of grouping.py
MIN_COMPLEXITY_THRESHOLD = {
    'min_line_count': 3,  # At least 3 lines of code
    'min_unique_tokens': 8,  # At least 8 meaningful tokens
}

def calculate_code_complexity(source_code: str) -> dict:
    """
    Calculate basic complexity metrics for code block.

    Returns:
        {
            'line_count': int,
            'unique_tokens': int,
            'has_control_flow': bool
        }
    """
    lines = [line.strip() for line in source_code.split('\n') if line.strip()]
    line_count = len(lines)

    # Count unique tokens (simple tokenization)
    tokens = re.findall(r'\b\w+\b', source_code)
    unique_tokens = len(set(tokens))

    # Check for control flow
    control_flow_keywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch']
    has_control_flow = any(keyword in source_code for keyword in control_flow_keywords)

    return {
        'line_count': line_count,
        'unique_tokens': unique_tokens,
        'has_control_flow': has_control_flow
    }


def is_complex_enough(block: 'CodeBlock') -> bool:
    """
    Check if block meets minimum complexity threshold.

    Trivial code (e.g., `return user.name;`) should not be grouped
    unless there are many occurrences.
    """
    complexity = calculate_code_complexity(block.source_code)

    # Must meet minimum thresholds
    if complexity['line_count'] < MIN_COMPLEXITY_THRESHOLD['min_line_count']:
        return False

    if complexity['unique_tokens'] < MIN_COMPLEXITY_THRESHOLD['min_unique_tokens']:
        # Exception: If has control flow, allow lower token count
        if not complexity['has_control_flow']:
            return False

    return True
```

**Updated group_by_similarity():**
```python
def group_by_similarity(
    blocks: List['CodeBlock'],
    similarity_threshold: float = 0.90
) -> List['DuplicateGroup']:
    """
    Group code blocks using multi-layer similarity algorithm with complexity filtering.
    """
    # NEW: Filter out trivial blocks before grouping
    complex_blocks = [b for b in blocks if is_complex_enough(b)]
    trivial_count = len(blocks) - len(complex_blocks)

    if trivial_count > 0:
        print(f"Layer 0: Filtered {trivial_count} trivial blocks (below complexity threshold)", file=sys.stderr)

    groups = []
    grouped_block_ids = set()

    # Layer 1: Exact matching (hash-based)
    print(f"Layer 1: Grouping by exact content hash...", file=sys.stderr)
    exact_groups = _group_by_exact_hash(complex_blocks)

    # ... rest of existing logic ...
```

**Testing:**
```python
# Test complexity filtering
trivial_code = "return user.name;"
complex_code = """
if (!user) return false;
if (!user.name) return false;
if (!user.email) return false;
return true;
"""

block1 = CodeBlock(..., source_code=trivial_code, line_count=1)
block2 = CodeBlock(..., source_code=complex_code, line_count=4)

assert is_complex_enough(block1) == False  # Too simple
assert is_complex_enough(block2) == True   # Complex enough
```

**Rollback Strategy:**
- Remove complexity filtering
- Process all blocks regardless of complexity

**Estimated Effort:** 2 hours

**Dependencies:** None

**Expected Impact:**
- ✅ Reduces noise from trivial duplicates
- ✅ Improves precision by focusing on meaningful duplicates
- ⚠️ May filter some valid but simple duplicates

**Risk Level:** LOW

---

### Phase 3 Summary

**Total Effort:** 10 hours
**Expected Precision:** 74% → 84% (+10%)
**Risk Level:** MEDIUM
**Rollback:** Moderate (new module + integration)

**Tests to Run After Phase 3:**
```bash
node test/accuracy/accuracy-test.js --verbose
# Expected: 2-3 fewer false positives from edge cases
# Expected: Semantic validation warnings for rejected groups
```

---

### Phase 4: Post-Grouping Validation (Target: +4% Precision)

**Goal:** Add validation gates to filter out low-quality duplicate groups.

**Expected Precision Improvement:** 84% → 88% (+4%)

---

#### Step 4.1: Add Group Quality Metrics

**File:** `lib/similarity/grouping.py`

**Change Type:** Enhancement (Low Risk)

**Description:** Calculate quality metrics for each group to filter low-confidence duplicates.

**New Function:**
```python
def calculate_group_quality_score(
    blocks: List['CodeBlock'],
    similarity_score: float
) -> float:
    """
    Calculate quality score for a duplicate group.

    Factors:
    - Similarity score (40%)
    - Member count (20%)
    - Complexity consistency (20%)
    - Tag overlap (20%)

    Returns:
        Quality score 0.0-1.0
    """
    if len(blocks) < 2:
        return 0.0

    # Factor 1: Similarity score (40% weight)
    similarity_factor = similarity_score * 0.4

    # Factor 2: Member count (20% weight)
    # More members = higher confidence (up to 5 members)
    member_count_factor = min(len(blocks) / 5.0, 1.0) * 0.2

    # Factor 3: Complexity consistency (20% weight)
    # All blocks should have similar line counts
    line_counts = [b.line_count for b in blocks]
    avg_lines = sum(line_counts) / len(line_counts)
    max_deviation = max(abs(lc - avg_lines) for lc in line_counts)

    if avg_lines > 0:
        consistency = 1.0 - (max_deviation / avg_lines)
        consistency_factor = max(0.0, consistency) * 0.2
    else:
        consistency_factor = 0.0

    # Factor 4: Tag overlap (20% weight)
    # Semantic tags should overlap
    from .semantic import calculate_tag_overlap

    tag_overlaps = []
    for i, block1 in enumerate(blocks):
        for block2 in blocks[i+1:]:
            overlap = calculate_tag_overlap(block1, block2)
            tag_overlaps.append(overlap)

    avg_tag_overlap = sum(tag_overlaps) / len(tag_overlaps) if tag_overlaps else 0.5
    tag_factor = avg_tag_overlap * 0.2

    # Total quality score
    quality_score = similarity_factor + member_count_factor + consistency_factor + tag_factor

    return quality_score


# Configuration
MIN_GROUP_QUALITY = 0.70  # Groups below this threshold are filtered out
```

**Testing:**
```python
# Test quality scoring
blocks = [
    CodeBlock(..., line_count=5, tags=['function:func1']),
    CodeBlock(..., line_count=5, tags=['function:func2']),
    CodeBlock(..., line_count=6, tags=['function:func3']),
]

quality = calculate_group_quality_score(blocks, similarity_score=0.95)
# Similarity: 0.95 * 0.4 = 0.38
# Member count: 3/5 * 0.2 = 0.12
# Consistency: ~0.95 * 0.2 = 0.19 (small deviation)
# Tag overlap: ~0.0 * 0.2 = 0.0 (no overlap)
# Total: ~0.69

assert 0.65 <= quality <= 0.75
```

**Rollback Strategy:**
- Remove quality scoring function
- Accept all groups regardless of quality

**Estimated Effort:** 2 hours

**Dependencies:** Step 3.1 (semantic module)

**Risk Level:** LOW

---

#### Step 4.2: Filter Low-Quality Groups

**File:** `lib/similarity/grouping.py`

**Change Type:** Enhancement (Low Risk)

**Description:** Apply quality threshold to filter out unreliable groups.

**Updated group_by_similarity():**
```python
def group_by_similarity(
    blocks: List['CodeBlock'],
    similarity_threshold: float = 0.90
) -> List['DuplicateGroup']:
    """
    Group code blocks using multi-layer similarity algorithm with quality filtering.
    """
    # ... existing logic ...

    # Layer 2: Structural similarity (for ungrouped blocks)
    structural_groups = _group_by_structural_similarity(
        ungrouped_blocks,
        similarity_threshold
    )

    for group_blocks, similarity_score in structural_groups:
        if len(group_blocks) >= 2:
            # NEW: Calculate group quality
            quality_score = calculate_group_quality_score(group_blocks, similarity_score)

            if quality_score >= MIN_GROUP_QUALITY:
                group = _create_duplicate_group(
                    group_blocks,
                    similarity_score=similarity_score,
                    similarity_method='structural'
                )
                groups.append(group)

                # Mark these blocks as grouped
                for block in group_blocks:
                    grouped_block_ids.add(block.block_id)
            else:
                print(f"Warning: Group rejected due to low quality ({quality_score:.2f}): {[b.block_id for b in group_blocks]}", file=sys.stderr)

    print(f"Layer 2: Found {len(structural_groups)} structural groups, {len([g for g in groups if g.similarity_method == 'structural'])} passed quality filter", file=sys.stderr)

    # ... rest of logic ...
```

**Testing:**
```bash
# Run accuracy test
node test/accuracy/accuracy-test.js --verbose 2>&1 | grep "low quality"

# Expected: Some edge-case groups filtered out
```

**Rollback Strategy:**
- Remove quality score calculation
- Remove quality threshold check
- Accept all groups

**Estimated Effort:** 1 hour

**Dependencies:** Step 4.1

**Expected Impact:**
- ✅ Filters 1-2 low-confidence false positives
- ⚠️ May filter some borderline true positives (but improves precision)

**Risk Level:** LOW

---

### Phase 4 Summary

**Total Effort:** 3 hours
**Expected Precision:** 84% → 88% (+4%)
**Risk Level:** LOW
**Rollback:** Easy

**Tests to Run After Phase 4:**
```bash
node test/accuracy/accuracy-test.js --verbose
# Expected: 1-2 fewer false positives from quality filtering
```

---

### Phase 5: Fine-Tuning and Edge Cases (Target: +2-4% Precision)

**Goal:** Address remaining edge cases and fine-tune thresholds.

**Expected Precision Improvement:** 88% → 90-92% (+2-4%)

---

#### Step 5.1: Add Configuration System for Thresholds

**File:** `lib/similarity/config.py` (NEW FILE)

**Change Type:** New Feature (Low Risk)

**Description:** Centralize all thresholds and make them configurable.

**New File Content:**
```python
"""
Similarity Algorithm Configuration

Centralized configuration for all similarity thresholds and parameters.
"""

from typing import Dict, Any
import os


class SimilarityConfig:
    """Configuration for duplicate detection similarity algorithm."""

    def __init__(self):
        # Structural similarity thresholds
        self.STRUCTURAL_THRESHOLD = float(os.getenv('STRUCTURAL_THRESHOLD', '0.90'))

        # Method chain weighting
        self.LEVENSHTEIN_WEIGHT = float(os.getenv('LEVENSHTEIN_WEIGHT', '0.70'))
        self.CHAIN_SIMILARITY_WEIGHT = float(os.getenv('CHAIN_SIMILARITY_WEIGHT', '0.30'))

        # Penalty factors
        self.OPPOSITE_LOGIC_PENALTY = float(os.getenv('OPPOSITE_LOGIC_PENALTY', '0.80'))
        self.HTTP_STATUS_PENALTY = float(os.getenv('HTTP_STATUS_PENALTY', '0.70'))

        # Complexity thresholds
        self.MIN_LINE_COUNT = int(os.getenv('MIN_LINE_COUNT', '3'))
        self.MIN_UNIQUE_TOKENS = int(os.getenv('MIN_UNIQUE_TOKENS', '8'))

        # Quality thresholds
        self.MIN_GROUP_QUALITY = float(os.getenv('MIN_GROUP_QUALITY', '0.70'))

        # Quality scoring weights
        self.QUALITY_SIMILARITY_WEIGHT = 0.40
        self.QUALITY_MEMBER_COUNT_WEIGHT = 0.20
        self.QUALITY_CONSISTENCY_WEIGHT = 0.20
        self.QUALITY_TAG_OVERLAP_WEIGHT = 0.20

    def to_dict(self) -> Dict[str, Any]:
        """Export configuration as dictionary."""
        return {
            'structural_threshold': self.STRUCTURAL_THRESHOLD,
            'levenshtein_weight': self.LEVENSHTEIN_WEIGHT,
            'chain_similarity_weight': self.CHAIN_SIMILARITY_WEIGHT,
            'opposite_logic_penalty': self.OPPOSITE_LOGIC_PENALTY,
            'http_status_penalty': self.HTTP_STATUS_PENALTY,
            'min_line_count': self.MIN_LINE_COUNT,
            'min_unique_tokens': self.MIN_UNIQUE_TOKENS,
            'min_group_quality': self.MIN_GROUP_QUALITY,
        }


# Global configuration instance
config = SimilarityConfig()
```

**Update all modules to use config:**
```python
# In structural.py:
from .config import config

def calculate_structural_similarity(code1: str, code2: str, threshold: float = None) -> Tuple[float, str]:
    if threshold is None:
        threshold = config.STRUCTURAL_THRESHOLD
    # ... rest of function ...

# In grouping.py:
from .config import config

def group_by_similarity(
    blocks: List['CodeBlock'],
    similarity_threshold: float = None
) -> List['DuplicateGroup']:
    if similarity_threshold is None:
        similarity_threshold = config.STRUCTURAL_THRESHOLD
    # ... rest of function ...
```

**Rollback Strategy:**
- Delete config.py
- Revert to hard-coded thresholds

**Estimated Effort:** 2 hours

**Dependencies:** None

**Risk Level:** LOW

---

#### Step 5.2: Threshold Tuning Based on Test Results

**File:** Multiple (config-based)

**Change Type:** Tuning (Low Risk)

**Description:** Run accuracy tests with different threshold values to find optimal configuration.

**Tuning Process:**
```bash
# Test different structural thresholds
export STRUCTURAL_THRESHOLD=0.88
node test/accuracy/accuracy-test.js --save-results
# Record precision/recall

export STRUCTURAL_THRESHOLD=0.90
node test/accuracy/accuracy-test.js --save-results
# Record precision/recall

export STRUCTURAL_THRESHOLD=0.92
node test/accuracy/accuracy-test.js --save-results
# Record precision/recall

# Test different penalty factors
export OPPOSITE_LOGIC_PENALTY=0.75
node test/accuracy/accuracy-test.js --save-results

export OPPOSITE_LOGIC_PENALTY=0.80
node test/accuracy/accuracy-test.js --save-results

export OPPOSITE_LOGIC_PENALTY=0.85
node test/accuracy/accuracy-test.js --save-results

# Find optimal configuration that maximizes precision while maintaining recall ≥80%
```

**Expected Optimal Configuration:**
```python
STRUCTURAL_THRESHOLD = 0.92  # Slightly higher than current 0.90
OPPOSITE_LOGIC_PENALTY = 0.75  # More aggressive penalty
HTTP_STATUS_PENALTY = 0.65  # More aggressive penalty
MIN_GROUP_QUALITY = 0.72  # Slightly higher threshold
```

**Rollback Strategy:**
- Revert to default configuration values
- No code changes needed

**Estimated Effort:** 3 hours (testing and analysis)

**Dependencies:** Step 5.1

**Risk Level:** LOW

---

#### Step 5.3: Add Detailed Logging for Debugging

**File:** `lib/similarity/grouping.py`, `lib/similarity/structural.py`

**Change Type:** Enhancement (Low Risk)

**Description:** Add comprehensive logging to understand why groups are created or rejected.

**Updated Functions:**
```python
import logging

# Configure logger
logger = logging.getLogger(__name__)

def calculate_structural_similarity(code1: str, code2: str, threshold: float = None) -> Tuple[float, str]:
    # ... existing logic ...

    # Log decision points
    if has_opposite_logic:
        logger.debug(f"Opposite logic detected: {ops1} vs {ops2}, applying penalty")

    if status_codes1 != status_codes2:
        logger.debug(f"Different HTTP status codes: {status_codes1} vs {status_codes2}, applying penalty")

    if chain_similarity < 1.0:
        logger.debug(f"Different method chains: {extract_method_chain(code1)} vs {extract_method_chain(code2)}, similarity={chain_similarity:.2f}")

    logger.debug(f"Final similarity: {similarity:.3f}, method: {method}")

    return similarity, method


def _group_by_structural_similarity(...):
    # ... existing logic ...

    for j in range(i + 1, n):
        if not are_semantically_compatible(block1, block2):
            logger.debug(f"Blocks {block1.block_id} and {block2.block_id} not semantically compatible")
            continue

        similarity, method = calculate_structural_similarity(...)

        if similarity >= threshold:
            logger.debug(f"Adding {block2.block_id} to group (similarity={similarity:.3f})")
            group.append(block2)
```

**Rollback Strategy:**
- Remove debug logging statements
- Keep error/warning logs

**Estimated Effort:** 1 hour

**Dependencies:** None

**Risk Level:** LOW

---

### Phase 5 Summary

**Total Effort:** 6 hours
**Expected Precision:** 88% → 90-92% (+2-4%)
**Risk Level:** LOW
**Rollback:** Easy

**Tests to Run After Phase 5:**
```bash
# Test with different configurations
STRUCTURAL_THRESHOLD=0.92 OPPOSITE_LOGIC_PENALTY=0.75 node test/accuracy/accuracy-test.js --verbose

# Compare results
node test/accuracy/accuracy-test.js --save-results
# Review test/accuracy/results/accuracy-report.json
```

---

## Risk Assessment

### Overall Risk Matrix

| Phase | Changes | Risk Level | Rollback Complexity | Impact on Recall |
|-------|---------|------------|---------------------|------------------|
| Phase 1 | Semantic operator preservation | LOW | Easy | None (more specific) |
| Phase 2 | Method chain validation | MEDIUM | Moderate | Minimal (<2%) |
| Phase 3 | Semantic validation layer | MEDIUM | Moderate | Low (<5%) |
| Phase 4 | Post-grouping validation | LOW | Easy | Minimal (<2%) |
| Phase 5 | Fine-tuning and config | LOW | Easy | Tunable |

### Risk Mitigation Strategies

#### 1. Recall Protection

**Strategy:** Run accuracy tests after each phase to ensure recall stays ≥80%

**Implementation:**
```bash
# After each phase:
node test/accuracy/accuracy-test.js --verbose --save-results

# Check recall metric:
# If recall < 80%, rollback that phase and investigate
```

**Contingency Plan:**
- If recall drops below 80%, rollback last phase
- Analyze which specific groups were lost
- Adjust thresholds to recover recall

#### 2. Incremental Deployment

**Strategy:** Deploy phases incrementally to production

**Implementation:**
1. Deploy Phase 1 → Monitor for 1 week
2. Deploy Phase 2 → Monitor for 1 week
3. Deploy Phase 3 → Monitor for 1 week
4. Deploy Phase 4-5 together → Monitor

**Monitoring:**
- Track precision/recall metrics in production
- Compare detected duplicate counts before/after
- Review Sentry error reports for any issues

#### 3. Feature Flags

**Strategy:** Make each phase toggleable via environment variables

**Implementation:**
```python
# In config.py
ENABLE_SEMANTIC_OPERATORS = os.getenv('ENABLE_SEMANTIC_OPERATORS', 'true') == 'true'
ENABLE_LOGICAL_OPERATOR_CHECK = os.getenv('ENABLE_LOGICAL_OPERATOR_CHECK', 'true') == 'true'
ENABLE_METHOD_CHAIN_VALIDATION = os.getenv('ENABLE_METHOD_CHAIN_VALIDATION', 'true') == 'true'
ENABLE_SEMANTIC_LAYER = os.getenv('ENABLE_SEMANTIC_LAYER', 'true') == 'true'
ENABLE_QUALITY_FILTERING = os.getenv('ENABLE_QUALITY_FILTERING', 'true') == 'true'

# In code:
if config.ENABLE_SEMANTIC_OPERATORS:
    # Apply semantic operator preservation
    pass
```

**Rollback:**
```bash
# Disable individual features without code changes
export ENABLE_METHOD_CHAIN_VALIDATION=false
doppler run -- node duplicate-detection-pipeline.js
```

#### 4. Backward Compatibility

**Strategy:** Maintain support for old behavior during transition

**Implementation:**
- Keep old normalization function as `normalize_code_legacy()`
- Add `--legacy-mode` flag to accuracy tests
- Gradual deprecation over 3-6 months

---

## Testing Strategy

### Test Coverage Goals

| Test Type | Coverage Target | Current | After Refactoring |
|-----------|----------------|---------|-------------------|
| Unit Tests | 90% | 75% | 90% |
| Integration Tests | 85% | 70% | 85% |
| Accuracy Tests | 100% | 100% | 100% |

### Test Plan by Phase

#### Phase 1 Tests (Semantic Operators)

```python
# test/similarity/test_semantic_operators.py (NEW)

import unittest
from lib.similarity.structural import (
    normalize_code,
    extract_logical_operators,
    extract_http_status_codes,
    calculate_structural_similarity
)


class TestSemanticOperators(unittest.TestCase):

    def test_math_methods_preserved(self):
        """Math.max and Math.min should remain different after normalization."""
        code1 = "return Math.max(...arr);"
        code2 = "return Math.min(...arr);"

        norm1 = normalize_code(code1)
        norm2 = normalize_code(code2)

        self.assertIn('Math.max', norm1)
        self.assertIn('Math.min', norm2)
        self.assertNotEqual(norm1, norm2)

    def test_logical_operators_extracted(self):
        """Logical operators should be correctly extracted."""
        code1 = "if (x === y) return true;"
        code2 = "if (x !== y) return true;"

        ops1 = extract_logical_operators(code1)
        ops2 = extract_logical_operators(code2)

        self.assertIn('===', ops1)
        self.assertIn('!==', ops2)
        self.assertNotEqual(ops1, ops2)

    def test_opposite_logic_penalty(self):
        """Opposite logic should reduce similarity below threshold."""
        code1 = "return process.env.NODE_ENV === 'production';"
        code2 = "return process.env.NODE_ENV !== 'production';"

        similarity, method = calculate_structural_similarity(code1, code2)

        self.assertLess(similarity, 0.90)
        self.assertEqual(method, 'different')

    def test_http_status_codes_extracted(self):
        """HTTP status codes should be correctly extracted."""
        code1 = "res.status(200).json({ success: true });"
        code2 = "res.status(201).json({ success: true });"

        status1 = extract_http_status_codes(code1)
        status2 = extract_http_status_codes(code2)

        self.assertEqual(status1, {200})
        self.assertEqual(status2, {201})

    def test_different_status_codes_penalty(self):
        """Different HTTP status codes should reduce similarity."""
        code1 = "res.status(200).json({ success: true });"
        code2 = "res.status(201).json({ success: true });"

        similarity, method = calculate_structural_similarity(code1, code2)

        self.assertLess(similarity, 0.90)


if __name__ == '__main__':
    unittest.main()
```

**Run Tests:**
```bash
python -m pytest test/similarity/test_semantic_operators.py -v
```

#### Phase 2 Tests (Method Chains)

```python
# test/similarity/test_method_chains.py (NEW)

import unittest
from lib.similarity.structural import (
    extract_method_chain,
    compare_method_chains,
    calculate_structural_similarity
)


class TestMethodChains(unittest.TestCase):

    def test_extract_method_chain(self):
        """Method chains should be correctly extracted."""
        code = "users.filter(u => u.active).map(u => u.name).reverse();"

        chain = extract_method_chain(code)

        self.assertEqual(chain, ['filter', 'map', 'reverse'])

    def test_compare_identical_chains(self):
        """Identical chains should have 1.0 similarity."""
        code1 = "arr.filter(x => x > 0).map(x => x * 2);"
        code2 = "items.filter(i => i.active).map(i => i.value);"

        similarity = compare_method_chains(code1, code2)

        self.assertEqual(similarity, 1.0)

    def test_compare_extended_chain(self):
        """Extended chain should have partial similarity."""
        code1 = "arr.filter(x => x > 0).map(x => x * 2);"
        code2 = "arr.filter(x => x > 0).map(x => x * 2).reverse();"

        similarity = compare_method_chains(code1, code2)

        self.assertAlmostEqual(similarity, 2/3, places=2)

    def test_extended_chain_below_threshold(self):
        """Extended chain should result in similarity below threshold."""
        code1 = "users.filter(u => u.active).map(u => u.name);"
        code2 = "users.filter(u => u.active).map(u => u.name).reverse();"

        similarity, method = calculate_structural_similarity(code1, code2)

        self.assertLess(similarity, 0.90)
        self.assertEqual(method, 'different')


if __name__ == '__main__':
    unittest.main()
```

#### Phase 3 Tests (Semantic Validation)

```python
# test/similarity/test_semantic_validation.py (NEW)

import unittest
from lib.similarity.semantic import (
    are_semantically_compatible,
    validate_duplicate_group,
    calculate_tag_overlap
)
from lib.models.code_block import CodeBlock, SourceLocation


class TestSemanticValidation(unittest.TestCase):

    def test_same_pattern_compatible(self):
        """Blocks with same pattern should be compatible."""
        block1 = self._create_block('test1', 'array-map-filter', 'utility')
        block2 = self._create_block('test2', 'array-map-filter', 'utility')

        self.assertTrue(are_semantically_compatible(block1, block2))

    def test_different_pattern_incompatible(self):
        """Blocks with different patterns should be incompatible."""
        block1 = self._create_block('test1', 'array-map-filter', 'utility')
        block2 = self._create_block('test2', 'object-manipulation', 'utility')

        self.assertFalse(are_semantically_compatible(block1, block2))

    def test_different_category_incompatible(self):
        """Blocks with different categories should be incompatible."""
        block1 = self._create_block('test1', 'prisma-operations', 'database_operation')
        block2 = self._create_block('test2', 'prisma-operations', 'api_handler')

        self.assertFalse(are_semantically_compatible(block1, block2))

    def test_validate_group(self):
        """Group with same pattern and category should validate."""
        blocks = [
            self._create_block('test1', 'array-map-filter', 'utility'),
            self._create_block('test2', 'array-map-filter', 'utility'),
            self._create_block('test3', 'array-map-filter', 'utility'),
        ]

        self.assertTrue(validate_duplicate_group(blocks))

    def test_validate_mixed_group_fails(self):
        """Group with mixed patterns should fail validation."""
        blocks = [
            self._create_block('test1', 'array-map-filter', 'utility'),
            self._create_block('test2', 'object-manipulation', 'utility'),
        ]

        self.assertFalse(validate_duplicate_group(blocks))

    def _create_block(self, block_id, pattern_id, category):
        return CodeBlock(
            block_id=block_id,
            pattern_id=pattern_id,
            category=category,
            location=SourceLocation(file_path='test.js', line_start=1, line_end=3),
            relative_path='test.js',
            source_code='test code',
            language='javascript',
            repository_path='/test',
            line_count=3,
            tags=[]
        )


if __name__ == '__main__':
    unittest.main()
```

#### Phase 4 Tests (Quality Filtering)

```python
# test/similarity/test_quality_filtering.py (NEW)

import unittest
from lib.similarity.grouping import calculate_group_quality_score
from lib.models.code_block import CodeBlock, SourceLocation


class TestQualityFiltering(unittest.TestCase):

    def test_high_quality_group(self):
        """High-quality group should score above threshold."""
        blocks = [
            self._create_block('test1', 5, ['function:func1']),
            self._create_block('test2', 5, ['function:func2']),
            self._create_block('test3', 5, ['function:func3']),
        ]

        quality = calculate_group_quality_score(blocks, similarity_score=0.95)

        self.assertGreater(quality, 0.70)

    def test_low_quality_group(self):
        """Low-quality group should score below threshold."""
        blocks = [
            self._create_block('test1', 5, []),
            self._create_block('test2', 15, []),  # Very different size
        ]

        quality = calculate_group_quality_score(blocks, similarity_score=0.85)

        self.assertLess(quality, 0.70)

    def _create_block(self, block_id, line_count, tags):
        return CodeBlock(
            block_id=block_id,
            pattern_id='test-pattern',
            category='utility',
            location=SourceLocation(file_path='test.js', line_start=1, line_end=line_count),
            relative_path='test.js',
            source_code='test code',
            language='javascript',
            repository_path='/test',
            line_count=line_count,
            tags=tags
        )


if __name__ == '__main__':
    unittest.main()
```

### Integration Testing

**Test Workflow:**
```bash
# 1. Run unit tests for each phase
python -m pytest test/similarity/ -v

# 2. Run accuracy test after each phase
node test/accuracy/accuracy-test.js --verbose --save-results

# 3. Compare before/after metrics
# Before: Precision 59.09%, Recall 81.25%
# After Phase 1: Precision ~67%, Recall ~81%
# After Phase 2: Precision ~74%, Recall ~80%
# After Phase 3: Precision ~84%, Recall ~80%
# After Phase 4: Precision ~88%, Recall ~80%
# After Phase 5: Precision ~90%, Recall ~80%

# 4. Run full pipeline test
doppler run -- node test-inter-project-scan.js

# 5. Validate no regressions
npm test
```

### Regression Testing

**Create Baseline:**
```bash
# Before refactoring
node test/accuracy/accuracy-test.js --save-results
cp test/accuracy/results/accuracy-report.json test/accuracy/results/baseline-before-refactor.json
```

**After Each Phase:**
```bash
# After phase X
node test/accuracy/accuracy-test.js --save-results
cp test/accuracy/results/accuracy-report.json test/accuracy/results/accuracy-report-phase-X.json

# Compare metrics
node test/accuracy/compare-reports.js \
  test/accuracy/results/baseline-before-refactor.json \
  test/accuracy/results/accuracy-report-phase-X.json
```

---

## Success Metrics

### Primary Metrics

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Target |
|--------|----------|---------|---------|---------|---------|---------|--------|
| **Precision** | 59.09% | 67% | 74% | 84% | 88% | 90-92% | **≥90%** |
| **Recall** | 81.25% | 81% | 80% | 80% | 80% | 80% | **≥80%** |
| **F1 Score** | 68.42% | 73% | 77% | 82% | 84% | 85% | **≥85%** |
| **FP Rate** | 64.29% | 45% | 32% | 18% | 12% | 8-10% | **<10%** |

### False Positive Reduction

| False Positive Type | Count (Before) | Target (After) | Phases Addressing |
|---------------------|----------------|----------------|-------------------|
| Opposite logic (=== vs !==) | 1 | 0 | Phase 1 |
| Math.max vs Math.min | 1 | 0 | Phase 1 |
| HTTP 200 vs 201 | 1 | 0 | Phase 1 |
| Extended chains (.reverse()) | 1 | 0 | Phase 2 |
| Edge case mismatches | 5 | 0-1 | Phase 3, 4 |
| **Total FPs** | **9** | **0-1** | **All Phases** |

### Secondary Metrics

1. **Group Quality:**
   - Average quality score ≥0.75
   - % high-confidence groups (quality >0.80) ≥70%

2. **Coverage:**
   - Unit test coverage ≥90%
   - Integration test coverage ≥85%

3. **Performance:**
   - Scan time increase <15%
   - Memory usage increase <20%

### Acceptance Criteria

**✅ Phase Complete When:**
- All unit tests passing
- Accuracy test shows expected precision improvement
- Recall maintained ≥80%
- No critical bugs introduced
- Code review approved

**✅ Project Complete When:**
- Precision ≥90%
- Recall ≥80%
- F1 Score ≥85%
- False Positive Rate <10%
- All phases deployed to production
- Documentation updated
- Team trained on new configuration

---

## Implementation Timeline

### Week 1: Phase 1 (Semantic Operators)
- **Days 1-2:** Implement semantic operator preservation (Steps 1.1-1.3)
- **Day 3:** Unit tests and accuracy validation
- **Days 4-5:** Code review, bug fixes, deployment to staging

### Week 2: Phase 2 (Method Chains)
- **Days 1-3:** Implement method chain validation (Steps 2.1-2.2)
- **Day 4:** Unit tests and accuracy validation
- **Day 5:** Code review, bug fixes, deployment to staging

### Week 3: Phase 3 (Semantic Validation)
- **Days 1-2:** Create semantic validation module (Step 3.1)
- **Day 3:** Integrate semantic validation (Step 3.2)
- **Day 4:** Add complexity filtering (Step 3.3)
- **Day 5:** Unit tests, accuracy validation, code review

### Week 4: Phase 4-5 (Quality + Fine-Tuning)
- **Days 1-2:** Implement quality filtering (Phase 4)
- **Days 3-4:** Configuration system and threshold tuning (Phase 5)
- **Day 5:** Final integration tests, documentation, deployment

### Week 5: Production Rollout
- **Day 1:** Deploy to production with feature flags
- **Days 2-4:** Monitor metrics, gather feedback
- **Day 5:** Full rollout, team training, documentation handoff

**Total Timeline:** 5 weeks

---

## Rollback Procedures

### Quick Rollback (Emergency)

```bash
# Disable all new features immediately
export ENABLE_SEMANTIC_OPERATORS=false
export ENABLE_LOGICAL_OPERATOR_CHECK=false
export ENABLE_METHOD_CHAIN_VALIDATION=false
export ENABLE_SEMANTIC_LAYER=false
export ENABLE_QUALITY_FILTERING=false

# Restart pipeline
pm2 restart duplicate-scanner

# Verify rollback
node test/accuracy/accuracy-test.js --verbose
# Should show baseline metrics (59% precision, 81% recall)
```

### Phase-Specific Rollback

**Phase 1 Rollback:**
```bash
git revert <commit-hash-phase-1>
# Or:
export ENABLE_SEMANTIC_OPERATORS=false
export ENABLE_LOGICAL_OPERATOR_CHECK=false
```

**Phase 2 Rollback:**
```bash
git revert <commit-hash-phase-2>
# Or:
export ENABLE_METHOD_CHAIN_VALIDATION=false
```

**Phase 3 Rollback:**
```bash
git revert <commit-hash-phase-3>
# Or:
export ENABLE_SEMANTIC_LAYER=false
```

**Phase 4-5 Rollback:**
```bash
git revert <commit-hash-phase-4> <commit-hash-phase-5>
# Or:
export ENABLE_QUALITY_FILTERING=false
export STRUCTURAL_THRESHOLD=0.90
```

### Data Recovery

**No data migration required** - all changes are algorithmic, no schema changes.

---

## Documentation Updates Required

### 1. CLAUDE.md Updates
- Update accuracy metrics section
- Document new configuration options
- Update algorithm description

### 2. New Documentation Files
- `/dev/similarity-algorithm-detailed.md` - Comprehensive algorithm explanation
- `/dev/configuration-guide.md` - All thresholds and tuning guide
- `/test/accuracy/README.md` updates - New test cases

### 3. Code Documentation
- Docstrings for all new functions
- Inline comments explaining penalty factors
- Configuration file with comments

---

## Conclusion

This refactoring plan provides a **structured, low-risk path** to improving precision from 59.09% to 90% while maintaining the excellent 81.25% recall. The plan is organized into 5 phases with 15 discrete steps, each independently testable and reversible.

**Key Success Factors:**
1. ✅ **Incremental approach** - Small, testable changes
2. ✅ **Comprehensive testing** - Unit + integration + accuracy tests
3. ✅ **Feature flags** - Easy rollback without code changes
4. ✅ **Clear metrics** - Measurable progress at each phase
5. ✅ **Low risk** - Minimal impact on existing functionality

**Expected Timeline:** 5 weeks
**Expected Precision:** 90-92%
**Expected Recall:** ≥80%
**Risk Level:** LOW-MEDIUM (mitigated through incremental approach)

The refactoring addresses all identified root causes:
- ✅ Semantic operator preservation
- ✅ Logical operator validation
- ✅ Method chain verification
- ✅ Semantic layer implementation
- ✅ Quality filtering
- ✅ Configuration-driven tuning

**Next Steps:**
1. Review and approve this plan
2. Create GitHub issues for each phase
3. Set up feature flags in configuration
4. Begin Phase 1 implementation
5. Monitor metrics after each phase

---

**Document Version:** 1.0
**Last Updated:** 2025-11-16
**Author:** Claude Code (Refactoring Architect)
**Status:** Ready for Review
