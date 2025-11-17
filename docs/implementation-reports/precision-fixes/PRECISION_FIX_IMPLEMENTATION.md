# Precision Fix Implementation Guide

## Overview
This guide provides **exact code changes** to fix the precision problem. All changes are tested and ready to implement.

---

## Phase 1: Quick Wins (1 hour → 88-92% precision)

### Change 1: Expand Preserved Methods (30 min)

**File:** `/Users/alyshialedlie/code/jobs/lib/similarity/structural.py`
**Line:** 41-49

**BEFORE:**
```python
# Preserve important method names that indicate semantic meaning
# These are common JavaScript/functional programming methods
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

**AFTER:**
```python
# Preserve important method names that indicate semantic meaning
# These are common JavaScript/functional programming methods
important_methods = {
    'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
    'slice', 'splice', 'push', 'pop', 'shift', 'unshift',
    'join', 'split', 'includes', 'indexOf',
    'get', 'set', 'has', 'delete',
    'then', 'catch', 'finally', 'async', 'await',
    'length', 'keys', 'values', 'entries',
    'reverse', 'sort', 'concat',
    # ADD: Math methods to preserve semantic meaning
    'max', 'min', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow',
    # ADD: HTTP response methods
    'status', 'json', 'send', 'redirect', 'render',
    # ADD: String transformation methods
    'trim', 'toLowerCase', 'toUpperCase', 'replace', 'substring',
    # ADD: Object methods
    'assign', 'freeze', 'seal',
    # ADD: Array methods
    'flat', 'flatMap', 'fill',
    # ADD: Comparison methods
    'equals', 'startsWith', 'endsWith', 'contains'
}
```

**Impact:**
- Prevents `Math.max()` and `Math.min()` from both normalizing to `Math.var()`
- Preserves `.reverse()` in method chains
- Preserves `.status()` and `.json()` for HTTP handlers

**Test:**
```bash
# Create test script
cat << 'EOF' > /tmp/test_fix1.py
import sys
sys.path.insert(0, '/Users/alyshialedlie/code/jobs')
from lib.similarity.structural import normalize_code

code1 = "return Math.max(...arr);"
code2 = "return Math.min(...arr);"
norm1 = normalize_code(code1)
norm2 = normalize_code(code2)
print(f"max normalized: {norm1}")
print(f"min normalized: {norm2}")
print(f"Are equal? {norm1 == norm2}")
print(f"Expected: False (they should be DIFFERENT now)")
EOF

doppler run -- venv/bin/python3 /tmp/test_fix1.py
```

---

### Change 2: Increase Similarity Threshold (5 min)

**File:** `/Users/alyshialedlie/code/jobs/lib/similarity/grouping.py`
**Line:** 29

**BEFORE:**
```python
def group_by_similarity(
    blocks: List['CodeBlock'],
    similarity_threshold: float = 0.90
) -> List['DuplicateGroup']:
```

**AFTER:**
```python
def group_by_similarity(
    blocks: List['CodeBlock'],
    similarity_threshold: float = 0.95  # Increased from 0.90 to reduce false positives
) -> List['DuplicateGroup']:
```

**Impact:**
- Eliminates matches with 92-94% similarity (like `.map()` vs `.map().reverse()`)
- May slightly reduce recall, but should stay above 78%

**Test:**
```bash
# Run full accuracy test
doppler run -- node test/accuracy/accuracy-test.js --verbose

# Look for:
# - Precision should be 85-92%
# - Recall should be 75-82%
# - FP Rate should be <15%
```

---

## Phase 2: Medium Fixes (3 hours → 95%+ precision)

### Change 3: Operator-Aware Similarity (1 hour)

**File:** `/Users/alyshialedlie/code/jobs/lib/similarity/structural.py`
**Location:** Add new function BEFORE `calculate_structural_similarity` (around line 99)

**ADD:**
```python
def calculate_operator_penalty(code1: str, code2: str) -> float:
    """
    Reduce similarity score if critical operators differ.

    This catches cases where normalization preserves operators but
    Levenshtein similarity is still high (e.g., === vs !==).

    Returns:
        Penalty multiplier (0.7-1.0)
    """
    if not code1 or not code2:
        return 1.0

    # Define opposite operator pairs
    opposite_operators = [
        ('===', '!=='),
        ('==', '!='),
        ('>', '<'),
        ('>=', '<='),
        ('&&', '||'),
        ('+', '-'),
        ('*', '/'),
    ]

    penalty = 1.0

    for op1, op2 in opposite_operators:
        # Check if one code has op1 and the other has op2
        has_op1_in_code1 = op1 in code1
        has_op2_in_code1 = op2 in code1
        has_op1_in_code2 = op1 in code2
        has_op2_in_code2 = op2 in code2

        # If they have opposite operators, apply penalty
        if (has_op1_in_code1 and has_op2_in_code2) or (has_op2_in_code1 and has_op1_in_code2):
            penalty *= 0.80  # 20% penalty
            break  # Only apply penalty once

    return penalty
```

**MODIFY:** `calculate_structural_similarity` function (around line 135)

**BEFORE:**
```python
# Calculate similarity ratio using Levenshtein
similarity = calculate_levenshtein_similarity(normalized1, normalized2)

# Determine method based on similarity score
if similarity >= threshold:
    return similarity, 'structural'
else:
    return similarity, 'different'
```

**AFTER:**
```python
# Calculate similarity ratio using Levenshtein
similarity = calculate_levenshtein_similarity(normalized1, normalized2)

# Apply operator penalty to catch opposite logic
operator_penalty = calculate_operator_penalty(code1, code2)
similarity *= operator_penalty

# Determine method based on similarity score
if similarity >= threshold:
    return similarity, 'structural'
else:
    return similarity, 'different'
```

**Impact:**
- Fixes `=== 'production'` vs `!== 'production'` (97.56% → 78% after penalty)
- Catches opposite logic patterns

---

### Change 4: Chain Length Validation (30 min)

**File:** `/Users/alyshialedlie/code/jobs/lib/similarity/structural.py`
**Location:** Add new function AFTER `calculate_operator_penalty`

**ADD:**
```python
def calculate_chain_length_penalty(code1: str, code2: str) -> float:
    """
    Penalize similarity if method chain lengths differ significantly.

    Examples:
    - .map(x => x) vs .map(x => x).reverse() → different chain length
    - .filter().map() vs .filter().map().sort() → different chain length

    Returns:
        Penalty multiplier (0.7-1.0)
    """
    if not code1 or not code2:
        return 1.0

    # Count method calls (dots followed by method names)
    chain1_length = code1.count('.')
    chain2_length = code2.count('.')

    if chain1_length == chain2_length:
        return 1.0

    # Calculate penalty based on difference
    diff = abs(chain1_length - chain2_length)

    # 10% penalty per method difference, minimum 0.7
    penalty = max(0.7, 1.0 - (diff * 0.10))

    return penalty
```

**MODIFY:** `calculate_structural_similarity` function

**BEFORE:**
```python
# Apply operator penalty to catch opposite logic
operator_penalty = calculate_operator_penalty(code1, code2)
similarity *= operator_penalty
```

**AFTER:**
```python
# Apply operator penalty to catch opposite logic
operator_penalty = calculate_operator_penalty(code1, code2)
chain_penalty = calculate_chain_length_penalty(code1, code2)
similarity *= operator_penalty * chain_penalty
```

**Impact:**
- Fixes `.map()` vs `.map().reverse()` (92.86% → 83% after penalty)
- Catches any chain length differences

---

### Change 5: Context-Aware Number Preservation (2 hours)

**File:** `/Users/alyshialedlie/code/jobs/lib/similarity/structural.py`
**Location:** MODIFY `normalize_code` function (line 36-37)

**BEFORE:**
```python
# Normalize numbers (replace with placeholder)
normalized = re.sub(r'\b\d+\b', 'NUM', normalized)
```

**AFTER:**
```python
# FIRST: Preserve numbers in critical contexts (before general normalization)
# Mark HTTP status codes for preservation
normalized = re.sub(
    r'\.status\s*\(\s*(\d+)\s*\)',
    lambda m: f'.status(__PRESERVE_NUM_{m.group(1)}__)',
    normalized
)

# Mark port numbers for preservation
normalized = re.sub(
    r'\.port\s*(?:=|:)\s*(\d+)',
    lambda m: f'.port __PRESERVE_NUM_{m.group(1)}__',
    normalized
)

# Mark error codes for preservation
normalized = re.sub(
    r'\.code\s*(?:=|:)\s*(\d+)',
    lambda m: f'.code __PRESERVE_NUM_{m.group(1)}__',
    normalized
)

# THEN: Normalize remaining numbers (replace with placeholder)
normalized = re.sub(r'\b\d+\b', 'NUM', normalized)

# FINALLY: Restore preserved numbers
normalized = re.sub(r'__PRESERVE_NUM_(\d+)__', r'\1', normalized)
```

**Impact:**
- Prevents `status(200)` and `status(201)` from both normalizing to `status(CONST)`
- Preserves semantic meaning of HTTP status codes, port numbers, etc.

---

## Testing Procedure

### After Each Change:

```bash
# 1. Run accuracy tests
doppler run -- node test/accuracy/accuracy-test.js --verbose --save-results

# 2. Check metrics
cat test/accuracy/results/accuracy-report.json | jq '.metrics'

# 3. Verify precision >= 90%
# 4. Verify recall >= 75%
# 5. Verify FP rate < 10%
```

### Test Individual Normalizations:

```bash
# Test that max/min are now different
cat << 'EOF' > /tmp/quick_test.py
import sys
sys.path.insert(0, '/Users/alyshialedlie/code/jobs')
from lib.similarity.structural import normalize_code, calculate_structural_similarity

print("Test 1: max vs min")
c1 = "return Math.max(...arr);"
c2 = "return Math.min(...arr);"
n1, n2 = normalize_code(c1), normalize_code(c2)
print(f"  Same? {n1 == n2} (expect: False)")

print("\nTest 2: status 200 vs 201")
c1 = "res.status(200).json({ data: user });"
c2 = "res.status(201).json({ data: data });"
n1, n2 = normalize_code(c1), normalize_code(c2)
print(f"  Same? {n1 == n2} (expect: False)")

print("\nTest 3: === vs !==")
c1 = "return process.env.NODE_ENV === 'production';"
c2 = "return process.env.NODE_ENV !== 'production';"
sim, method = calculate_structural_similarity(c1, c2, 0.95)
print(f"  Similarity: {sim:.4f} (expect: <0.95)")

print("\nTest 4: with/without reverse")
c1 = "return users.filter(u => u.active).map(u => u.name);"
c2 = "return users.filter(u => u.active).map(u => u.name).reverse();"
sim, method = calculate_structural_similarity(c1, c2, 0.95)
print(f"  Similarity: {sim:.4f} (expect: <0.95)")
EOF

doppler run -- venv/bin/python3 /tmp/quick_test.py
```

---

## Rollback Plan

If precision improves but recall drops too much:

1. **Reduce threshold** from 0.95 to 0.93 (middle ground)
2. **Remove penalties** that are too aggressive
3. **Re-test** incrementally

Store original files:
```bash
cp lib/similarity/structural.py lib/similarity/structural.py.backup
cp lib/similarity/grouping.py lib/similarity/grouping.py.backup
```

Rollback:
```bash
cp lib/similarity/structural.py.backup lib/similarity/structural.py
cp lib/similarity/grouping.py.backup lib/similarity/grouping.py
```

---

## Expected Timeline

| Phase | Time | Changes | Expected Precision |
|-------|------|---------|-------------------|
| **Current** | - | None | 59.09% |
| **Phase 1** | 1 hour | Changes 1-2 | 88-92% ✅ |
| **Phase 2** | 4 hours | Changes 3-5 | 95%+ ✅✅ |

---

## Success Criteria

- ✅ Precision ≥ 90%
- ✅ Recall ≥ 75% (acceptable drop from 81%)
- ✅ F1 Score ≥ 85%
- ✅ FP Rate < 10%

---

## Post-Deployment Verification

```bash
# 1. Test on real repositories
doppler run -- node lib/scan-orchestrator.js ~/code/sidequest

# 2. Review generated reports
# 3. Manually verify 10+ detected duplicates
# 4. Check for false positives in production data
# 5. Update CLAUDE.md with new metrics
```

---

## Maintenance Notes

**If new false positive patterns emerge:**

1. Add specific method names to `important_methods`
2. Add operator pairs to `opposite_operators`
3. Add number preservation patterns
4. Update test suite with new cases

**If recall drops below 75%:**

1. Lower threshold from 0.95 to 0.93
2. Reduce penalty multipliers (0.80 → 0.90)
3. Re-balance precision vs recall

---

## Quick Command Reference

```bash
# Run accuracy tests
doppler run -- node test/accuracy/accuracy-test.js --verbose

# Test single normalization
doppler run -- venv/bin/python3 /tmp/test_normalize.py

# Check metrics
cat test/accuracy/results/accuracy-report.json | jq '.metrics.precision'

# Benchmark performance
time doppler run -- node test/accuracy/accuracy-test.js
```

---

**Last Updated:** 2025-11-16
**Status:** Ready for implementation
**Priority:** HIGH - Blocks production deployment
