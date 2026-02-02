# Backlog

Technical debt and planned improvements extracted from codebase TODOs.

**Last Updated:** 2026-02-01

---

## Code Review Issues (2026-02-01)

> **Source:** Enterprise code review of commits `0c4027f^..c07f736`
> **Fixed:** C1-C3 (Critical), H1-H6 (High) in commit `e6a9044`

### Test Infrastructure

| ID | Location | Description | Status | Issue |
|----|----------|-------------|--------|-------|
| T1 | `tests/utils/test-utilities.js:36` | TestWorker should disable retries by default (`maxRetries: 0`) | Open | [#7](https://github.com/aledlie/AlephAuto/issues/7) |

### Medium Priority - Code Quality

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| M1 | `semantic_annotator.py:281-295` | Inconsistent naming: `annotate()` vs `extract_*()` pattern | Open |
| M2 | `similarity/grouping.py` | Missing docstrings on `_extract_function_names()`, `_run_semantic_checks()`, `_create_duplicate_group()` | Open |
| M3 | `tests/unit/migration-transformer.test.js:84-143` | Skipped tests lack issue numbers/timeline (currently "requires file detection") | Open |
| M4 | `semantic_annotator.py:137-155` | Duplicate 'auth' pattern across category dictionaries | Open |
| M5 | `extractors/extract_blocks.py:733-735` | Missing semantic annotation metrics (% blocks with tags, avg tags/block) | Open |
| M6 | `extractors/extract_blocks.py:349,839` | Generic error messages not actionable (add file:line context) | Open |
| M7 | `api/activity-feed.js:372` | Already fixed in H2 (nullish coalescing) | ✅ Done |

### Low Priority - Performance & Tooling

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| L1 | `extractors/extract_blocks.py:275-281` | Verbose debug logging - extract to logging helper | Open |
| L2 | Python files | Missing `.pyi` type stubs for IDE support | Open |
| L3 | Layer 3 semantic annotation | No timing/performance metrics collected | Open |
| L4 | `semantic_annotator.py:350-352` | Regex patterns compiled on every `annotate()` call - should pre-compile | Open |

---

## High Priority - Feature Implementation

> **Implementation Plan:** [SEMANTIC_SIMILARITY_IMPLEMENTATION.md](architecture/SEMANTIC_SIMILARITY_IMPLEMENTATION.md)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| H1 | `sidequest/pipeline-core/similarity/grouping.py:387` | Layer 3 - Semantic similarity implementation | ✅ Done |
| H2 | `sidequest/pipeline-core/extractors/extract_blocks.py:286` | Detect language from file extension | ✅ Done |
| H3 | `sidequest/pipeline-core/annotators/semantic_annotator.py` | Implement full semantic annotator (Stage 4) | ✅ Done |
| H4 | `sidequest/pipeline-core/similarity/grouping.py` | Implement semantic grouping for duplicate detection | ✅ Done |
| H5 | `sidequest/pipeline-core/extractors/extract_blocks.py` | Calculate duplication percentage properly | ✅ Done |

## Medium Priority - Tests

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| M1 | `tests/integration/activity-feed.integration.test.js:306` | Implement retry:created event emission in SidequestServer | ✅ Done |
| M2-M7 | `tests/unit/migration-transformer.test.js` | Enhanced file detection for migration (Q2 2026 - documented in file header) | ✅ Consolidated |

## Low Priority - Documentation

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| L1 | `docs/architecture/README.md:147` | Document Layer 3: Semantic Similarity | ✅ Done |
| L2 | `docs/architecture/README.md:470` | Create AST-Grep Rules README | ✅ Done |
| L3 | `docs/architecture/README.md:471` | Create Pydantic Models README | ✅ Done |
| L4 | `docs/architecture/README.md:474` | Create Test Suite Overview README | ✅ Done |
| L5 | `docs/architecture/README.md:475` | Create Accuracy Tests README | ✅ Done |
| L6 | `docs/architecture/similarity-algorithm.md:61` | Document Category + Tags Matching | ✅ Done |
| L7 | `docs/architecture/similarity-algorithm.md:783` | Link Accuracy Test Results | ✅ Done |
| L8 | `docs/architecture/WORKER_REGISTRY.md:367` | Document actual job triggering with worker | ✅ Done |

## Code Organization

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| C1 | `sidequest/utils/refactor-test-suite.ts:571` | Organize strings into meaningful groups | ✅ Done |
| C2 | `sidequest/workers/test-refactor-worker.ts:598` | Organize strings into meaningful groups | ✅ Done |

---

## Summary

| Priority | Count | Theme |
|----------|-------|-------|
| High | 0 | ~~Layer 3 semantic similarity (Stages 4-7)~~ ✅ Complete |
| Medium | 6 | Code quality from 2026-02-01 review |
| Low | 4 | Performance/tooling improvements |
| Test | 1 | TestWorker retry behavior ([#7](https://github.com/aledlie/AlephAuto/issues/7)) |
| Organization | 0 | ~~Code cleanup~~ ✅ Complete |
| **Total** | **11** | 10 open, 1 with issue |

## Next Steps

### Completed (2026-02-01)
- ✅ Layer 3 semantic similarity fully implemented
- ✅ Critical security fixes (C1-C3): input validation, race conditions, type safety
- ✅ High priority fixes (H1-H6): config centralization, ReDoS prevention, refactoring

### Recommended Next Actions
1. **T1 (Test):** Fix TestWorker retry default - quick win, unblocks 2 tests
2. **M2 (Docs):** Add missing docstrings to grouping.py helpers
3. **L4 (Perf):** Pre-compile regex patterns in SemanticAnnotator
4. **M5 (Metrics):** Add semantic annotation coverage metrics
