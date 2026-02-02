# Backlog

Technical debt and planned improvements extracted from codebase TODOs.

**Last Updated:** 2026-02-01

---

## High Priority - Feature Implementation

> **Implementation Plan:** [SEMANTIC_SIMILARITY_IMPLEMENTATION.md](architecture/SEMANTIC_SIMILARITY_IMPLEMENTATION.md)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| H1 | `sidequest/pipeline-core/similarity/grouping.py:387` | Layer 3 - Semantic similarity implementation | Pending |
| H2 | `sidequest/pipeline-core/extractors/extract_blocks.py:286` | Detect language from file extension | Pending |
| H3 | `sidequest/pipeline-core/extractors/extract_blocks.py:684` | Implement full semantic annotator (Stage 4) | Pending |
| H4 | `sidequest/pipeline-core/extractors/extract_blocks.py:699` | Implement semantic grouping for duplicate detection | Pending |
| H5 | `sidequest/pipeline-core/extractors/extract_blocks.py:702` | Calculate duplication percentage properly | Pending |

## Medium Priority - Tests

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| M1 | `tests/integration/activity-feed.integration.test.js:306` | Implement retry:created event emission in SidequestServer | Pending |
| M2 | `tests/unit/migration-transformer.test.js:85` | Enhanced file detection logic for migration tests | Pending |
| M3 | `tests/unit/migration-transformer.test.js:120` | Enhanced file detection logic for migration tests | Pending |
| M4 | `tests/unit/migration-transformer.test.js:150` | Enhanced file detection logic for migration tests | Pending |
| M5 | `tests/unit/migration-transformer.test.js:187` | Enhanced file detection logic for migration tests | Pending |
| M6 | `tests/unit/migration-transformer.test.js:215` | Enhanced file detection logic for migration tests | Pending |
| M7 | `tests/unit/migration-transformer.test.js:243` | Enhanced file detection logic for migration tests | Pending |

## Low Priority - Documentation

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| L1 | `docs/architecture/README.md:147` | Document Layer 3: Semantic Similarity | Pending |
| L2 | `docs/architecture/README.md:470` | Create AST-Grep Rules README | ✅ Done |
| L3 | `docs/architecture/README.md:471` | Create Pydantic Models README | ✅ Done |
| L4 | `docs/architecture/README.md:474` | Create Test Suite Overview README | ✅ Done |
| L5 | `docs/architecture/README.md:475` | Create Accuracy Tests README | ✅ Done |
| L6 | `docs/architecture/similarity-algorithm.md:61` | Document Category + Tags Matching | Pending |
| L7 | `docs/architecture/similarity-algorithm.md:783` | Link Accuracy Test Results | Pending |
| L8 | `docs/architecture/WORKER_REGISTRY.md:367` | Document actual job triggering with worker | Pending |

## Code Organization

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| C1 | `sidequest/utils/refactor-test-suite.ts:571` | Organize strings into meaningful groups | ✅ Done |
| C2 | `sidequest/workers/test-refactor-worker.ts:598` | Organize strings into meaningful groups | ✅ Done |

---

## Summary

| Priority | Count | Theme |
|----------|-------|-------|
| High | 5 | Layer 3 semantic similarity (Stages 4-7) |
| Medium | 7 | Test infrastructure improvements |
| Low | 4 | Documentation gaps |
| Organization | 0 | ~~Code cleanup~~ ✅ Complete |
| **Total** | **16** | |

## Next Steps

1. **H1-H5**: Implement Layer 3 semantic similarity - core feature gap
2. **M2-M7**: Consolidate migration transformer tests (6 similar TODOs)
3. **L1, L6-L8**: Remaining documentation can be addressed incrementally
