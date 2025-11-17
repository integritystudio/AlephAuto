# Implementation Checklist - Precision Improvement Refactoring

**Quick reference for implementing the refactoring plan**

## Pre-Implementation Setup

- [ ] Review full plan: `dev/precision-improvement-refactor-plan-2025-11-16.md`
- [ ] Create baseline metrics: `node test/accuracy/accuracy-test.js --save-results`
- [ ] Create feature branch: `git checkout -b refactor/precision-improvement`
- [ ] Set up Python virtual environment: `source venv/bin/activate`

## Phase 1: Semantic Operator Preservation

### Step 1.1: Semantic Operator Whitelist (2h)
- [ ] File: `lib/similarity/structural.py`
- [ ] Add `SEMANTIC_METHODS` constant (lines ~41-62)
- [ ] Add `SEMANTIC_OBJECTS` constant  
- [ ] Update `normalize_code()` to preserve objects
- [ ] Test: `Math.max` vs `Math.min` remain different
- [ ] Run: `python -m pytest test/similarity/test_semantic_operators.py -v`

### Step 1.2: Logical Operator Tracking (3h)
- [ ] File: `lib/similarity/structural.py`
- [ ] Add `extract_logical_operators()` function
- [ ] Update `calculate_structural_similarity()` with operator check
- [ ] Add opposite logic penalty (0.8 multiplier)
- [ ] Test: `===` vs `!==` detected as opposite
- [ ] Run: `python -m pytest test/similarity/test_semantic_operators.py::test_opposite_logic_penalty`

### Step 1.3: HTTP Status Code Validation (1.5h)
- [ ] File: `lib/similarity/structural.py`
- [ ] Add `extract_http_status_codes()` function
- [ ] Update `calculate_structural_similarity()` with status code check
- [ ] Add status code penalty (0.7 multiplier)
- [ ] Test: 200 vs 201 detected as different
- [ ] Run: `python -m pytest test/similarity/test_semantic_operators.py::test_different_status_codes_penalty`

### Phase 1 Validation
- [ ] Run accuracy test: `node test/accuracy/accuracy-test.js --verbose`
- [ ] Expected: Precision ~67% (+8%), Recall ~81% (maintained)
- [ ] Expected: 3 fewer false positives (findMax/Min, isDevelopment, sendCreatedResponse)
- [ ] Commit: `git commit -m "feat: add semantic operator preservation (Phase 1)"`

## Phase 2: Method Chain Validation

### Step 2.1: Extract Method Chain Structure (4h)
- [ ] File: `lib/similarity/structural.py`
- [ ] Add `extract_method_chain()` function
- [ ] Add `compare_method_chains()` function
- [ ] Test: Chain extraction works correctly
- [ ] Run: `python -m pytest test/similarity/test_method_chains.py::test_extract_method_chain`

### Step 2.2: Integrate Method Chain Validation (2h)
- [ ] File: `lib/similarity/structural.py`
- [ ] Update `calculate_structural_similarity()` with chain validation
- [ ] Add weighted similarity (70% Levenshtein + 30% chain)
- [ ] Test: Extended chains fall below threshold
- [ ] Run: `python -m pytest test/similarity/test_method_chains.py::test_extended_chain_below_threshold`

### Phase 2 Validation
- [ ] Run accuracy test: `node test/accuracy/accuracy-test.js --verbose`
- [ ] Expected: Precision ~74% (+7%), Recall ~80% (slight decrease acceptable)
- [ ] Expected: 1 fewer false positive (getUserNamesReversed)
- [ ] Commit: `git commit -m "feat: add method chain validation (Phase 2)"`

## Phase 3: Semantic Validation Layer

### Step 3.1: Create Semantic Validator Module (5h)
- [ ] Create: `lib/similarity/semantic.py` (NEW FILE)
- [ ] Add `are_semantically_compatible()` function
- [ ] Add `calculate_tag_overlap()` function
- [ ] Add `validate_duplicate_group()` function
- [ ] Test: Semantic compatibility checks
- [ ] Run: `python -m pytest test/similarity/test_semantic_validation.py`

### Step 3.2: Integrate Semantic Validation (3h)
- [ ] File: `lib/similarity/grouping.py`
- [ ] Import semantic validation functions
- [ ] Update `_group_by_structural_similarity()` with pre-check
- [ ] Add group validation before creating DuplicateGroup
- [ ] Test: Invalid groups rejected
- [ ] Run: `node test/accuracy/accuracy-test.js --verbose 2>&1 | grep "semantic validation"`

### Step 3.3: Add Minimum Complexity Threshold (2h)
- [ ] File: `lib/similarity/grouping.py`
- [ ] Add `MIN_COMPLEXITY_THRESHOLD` constant
- [ ] Add `calculate_code_complexity()` function
- [ ] Add `is_complex_enough()` function
- [ ] Update `group_by_similarity()` to filter trivial blocks
- [ ] Test: Trivial code filtered out
- [ ] Run: `node test/accuracy/accuracy-test.js --verbose`

### Phase 3 Validation
- [ ] Run accuracy test: `node test/accuracy/accuracy-test.js --verbose`
- [ ] Expected: Precision ~84% (+10%), Recall ~80%
- [ ] Expected: 2-3 fewer false positives (edge cases)
- [ ] Commit: `git commit -m "feat: implement semantic validation layer (Phase 3)"`

## Phase 4: Post-Grouping Validation

### Step 4.1: Add Group Quality Metrics (2h)
- [ ] File: `lib/similarity/grouping.py`
- [ ] Add `calculate_group_quality_score()` function
- [ ] Add `MIN_GROUP_QUALITY = 0.70` constant
- [ ] Test: Quality scoring works correctly
- [ ] Run: `python -m pytest test/similarity/test_quality_filtering.py`

### Step 4.2: Filter Low-Quality Groups (1h)
- [ ] File: `lib/similarity/grouping.py`
- [ ] Update `group_by_similarity()` with quality check
- [ ] Add warning log for rejected groups
- [ ] Test: Low-quality groups filtered
- [ ] Run: `node test/accuracy/accuracy-test.js --verbose 2>&1 | grep "low quality"`

### Phase 4 Validation
- [ ] Run accuracy test: `node test/accuracy/accuracy-test.js --verbose`
- [ ] Expected: Precision ~88% (+4%), Recall ~80%
- [ ] Expected: 1-2 fewer false positives
- [ ] Commit: `git commit -m "feat: add post-grouping validation (Phase 4)"`

## Phase 5: Fine-Tuning and Configuration

### Step 5.1: Add Configuration System (2h)
- [ ] Create: `lib/similarity/config.py` (NEW FILE)
- [ ] Add `SimilarityConfig` class with all thresholds
- [ ] Update `structural.py` to use config
- [ ] Update `grouping.py` to use config
- [ ] Test: Config loads correctly
- [ ] Run: `python -c "from lib.similarity.config import config; print(config.to_dict())"`

### Step 5.2: Threshold Tuning (3h)
- [ ] Test: `STRUCTURAL_THRESHOLD=0.88 node test/accuracy/accuracy-test.js --save-results`
- [ ] Test: `STRUCTURAL_THRESHOLD=0.90 node test/accuracy/accuracy-test.js --save-results`
- [ ] Test: `STRUCTURAL_THRESHOLD=0.92 node test/accuracy/accuracy-test.js --save-results`
- [ ] Test: `OPPOSITE_LOGIC_PENALTY=0.75 node test/accuracy/accuracy-test.js --save-results`
- [ ] Test: `OPPOSITE_LOGIC_PENALTY=0.80 node test/accuracy/accuracy-test.js --save-results`
- [ ] Analyze results and set optimal configuration
- [ ] Update default values in `config.py`

### Step 5.3: Add Detailed Logging (1h)
- [ ] File: `lib/similarity/structural.py`
- [ ] Add debug logging for operator checks
- [ ] Add debug logging for chain validation
- [ ] File: `lib/similarity/grouping.py`
- [ ] Add debug logging for semantic validation
- [ ] Add debug logging for quality filtering
- [ ] Test: `LOGLEVEL=DEBUG node test/accuracy/accuracy-test.js`

### Phase 5 Validation
- [ ] Run accuracy test: `node test/accuracy/accuracy-test.js --verbose`
- [ ] Expected: Precision 90-92% (+2-4%), Recall ~80%
- [ ] Expected: 0-1 false positives total
- [ ] Commit: `git commit -m "feat: add configuration system and tuning (Phase 5)"`

## Final Integration Testing

- [ ] Run all unit tests: `python -m pytest test/similarity/ -v`
- [ ] Run accuracy test: `node test/accuracy/accuracy-test.js --verbose --save-results`
- [ ] Run full test suite: `npm test`
- [ ] Run pipeline test: `doppler run -- node test-automated-pipeline.js`
- [ ] Verify metrics meet targets:
  - [ ] Precision ≥90%
  - [ ] Recall ≥80%
  - [ ] F1 Score ≥85%
  - [ ] FP Rate <10%

## Documentation

- [ ] Update `CLAUDE.md` with new metrics
- [ ] Update `CLAUDE.md` with configuration options
- [ ] Create `dev/similarity-algorithm-detailed.md`
- [ ] Create `dev/configuration-guide.md`
- [ ] Update `test/accuracy/README.md`
- [ ] Add docstrings to all new functions

## Deployment

- [ ] Create pull request with all changes
- [ ] Code review by team
- [ ] Deploy to staging: `git push origin refactor/precision-improvement`
- [ ] Enable feature flags on staging
- [ ] Monitor staging for 3-5 days
- [ ] Deploy to production with flags disabled
- [ ] Gradually enable flags (one per day):
  - [ ] Day 1: `ENABLE_SEMANTIC_OPERATORS=true`
  - [ ] Day 2: `ENABLE_LOGICAL_OPERATOR_CHECK=true`
  - [ ] Day 3: `ENABLE_METHOD_CHAIN_VALIDATION=true`
  - [ ] Day 4: `ENABLE_SEMANTIC_LAYER=true`
  - [ ] Day 5: `ENABLE_QUALITY_FILTERING=true`
- [ ] Monitor Sentry for errors
- [ ] Monitor precision/recall in production
- [ ] Full rollout after 1 week of successful monitoring

## Rollback Plan

If precision drops or critical issues found:

```bash
# Quick disable all new features
export ENABLE_SEMANTIC_OPERATORS=false
export ENABLE_LOGICAL_OPERATOR_CHECK=false
export ENABLE_METHOD_CHAIN_VALIDATION=false
export ENABLE_SEMANTIC_LAYER=false
export ENABLE_QUALITY_FILTERING=false

# Restart pipeline
pm2 restart duplicate-scanner

# Verify rollback
node test/accuracy/accuracy-test.js --verbose
```

Or git revert:
```bash
git revert HEAD~5..HEAD  # Revert last 5 commits (all phases)
git push origin main --force-with-lease
```

## Success Criteria Verification

- [ ] ✅ Precision ≥90% achieved
- [ ] ✅ Recall ≥80% maintained
- [ ] ✅ F1 Score ≥85% achieved
- [ ] ✅ False Positive Rate <10%
- [ ] ✅ All unit tests passing
- [ ] ✅ All integration tests passing
- [ ] ✅ Production deployment successful
- [ ] ✅ No critical bugs in 1 week
- [ ] ✅ Team trained on new configuration
- [ ] ✅ Documentation complete

---

**Estimated Total Effort:** 31.5 hours over 5 weeks
**Current Status:** Not Started
**Last Updated:** 2025-11-16
