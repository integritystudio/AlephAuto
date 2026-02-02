# Backlog

Technical debt and planned improvements extracted from codebase TODOs.

**Last Updated:** 2026-02-01

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
| Medium | 0 | ~~Test infrastructure~~ ✅ Complete |
| Low | 0 | ~~Documentation gaps~~ ✅ Complete |
| Organization | 0 | ~~Code cleanup~~ ✅ Complete |
| **Total** | **0** | ✅ All items complete |

## Next Steps

✅ **All high-priority items complete!**

Layer 3 semantic similarity has been fully implemented:
- Phase 1: Language detection from file extension
- Phase 2: Semantic annotator with operation/domain/pattern/data_type extraction
- Phase 3: Layer 3 grouping with weighted Jaccard similarity
- Phase 4: Comprehensive metrics calculation
