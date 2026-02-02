# Architecture Documentation

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Architecture Documentation",
  "description": "**Directory:** `/docs/architecture/`",
  "dateModified": "2026-01-19T02:09:57.578Z",
  "inLanguage": "en-US"
}
</script>


**Directory:** `/docs/architecture/`
**Last Updated:** 2026-02-01
**Version:** 1.8.1

## Overview

This directory contains comprehensive architectural documentation for the Code Consolidation System's duplicate detection pipeline and multi-layer similarity algorithm.

## Documentation Files

### 🏗️ [System Data Flow](./SYSTEM-DATA-FLOW.md) ⭐ NEW

**Complete system-level architecture and data flow diagrams**

**Contents:**
- Full system architecture with all layers
- High-level request-to-response flow
- API request processing flow
- Job queue state machine
- WebSocket real-time communication
- Database schema and operations
- Error handling and retry logic
- Inter-process communication (JS ↔ Python)
- Configuration loading hierarchy
- Deployment architecture (PM2, Nginx)

**Key Diagrams:**
- Complete System Architecture (all components)
- API Request Flow (middleware stack)
- Job Queue State Machine
- WebSocket Broadcasting
- Error Classification Flow
- Worker Registry Pattern

**Use This Document When:**
- Understanding how the entire system fits together
- Debugging cross-component issues
- Planning new integrations
- Onboarding new developers
- Understanding deployment architecture

---

### 📊 [Pipeline Data Flow](./pipeline-data-flow.md)

**Complete guide to the 7-stage code consolidation pipeline**

**Contents:**
- End-to-end pipeline architecture (JavaScript Stage 1-2 → Python Stage 3-7)
- Stage-by-stage data flow with Mermaid diagrams
- JSON data format specifications for all stages
- Component interaction patterns
- Error handling strategies
- Performance benchmarks

**Key Topics:**
- Repository scanning and validation
- AST-grep pattern detection (18 rules)
- Code block extraction with function name detection
- Block deduplication strategy (by function, not line)
- Multi-layer duplicate grouping (Layer 0-3)
- Consolidation suggestion generation
- Metrics and reporting

**Use This Document When:**
- Understanding how data flows between JavaScript and Python
- Debugging pipeline stage failures
- Adding new pattern detection rules
- Extending the suggestion generation logic
- Optimizing pipeline performance

---

### 🔬 [Similarity Algorithm](./similarity-algorithm.md)

**Deep dive into the two-phase structural similarity algorithm**

**Contents:**
- Two-phase algorithm architecture (Extract → Normalize → Penalize)
- Semantic feature extraction (BEFORE normalization)
- Code normalization process with semantic preservation
- Unified penalty system (HTTP codes, operators, methods)
- Implementation examples and pseudocode
- Accuracy metrics (Precision: 100%, Recall: 87.50%, F1: 93.33%)

**Key Topics:**
- Why extract features BEFORE normalization (critical pattern)
- SemanticFeatures data structure
- Penalty calculations (multiplicative, not additive)
- Method chain comparison
- Levenshtein similarity with adjustments
- Common implementation pitfalls

**Use This Document When:**
- Understanding why certain code blocks are/aren't grouped
- Debugging false positives or false negatives
- Tuning similarity thresholds
- Adding new semantic features
- Optimizing comparison performance

---

## Quick Reference

### System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Scan Orchestrator                              │
│                  (lib/scan-orchestrator.js)                       │
└──────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌──────────────────┐                    ┌──────────────────────┐
│ Stage 1-2 (JS)   │                    │ Stage 3-7 (Python)   │
│                  │                    │                      │
│ • Repo Scanner   │ ──── JSON ───────▶ │ • Block Extraction   │
│ • AST-Grep       │    stdin/stdout    │ • Deduplication      │
│                  │                    │ • Grouping (Layer 0-2)│
│                  │                    │ • Suggestions        │
│                  │                    │ • Reporting          │
└──────────────────┘                    └──────────────────────┘
```

### Multi-Layer Grouping

```
Layer 0: Complexity Filter   → Remove trivial code (< 3 tokens)
Layer 1: Exact Hash Match    → Identical code (100% precision)
Layer 2: Structural Similarity → AST-based (90%+ threshold)
Layer 3: Semantic Similarity → Category + tags [TODO]
```

### Two-Phase Similarity

```
PHASE 1: Extract Features (from ORIGINAL code)
         ↓
PHASE 2: Normalize Code (structural comparison)
         ↓
PHASE 3: Apply Penalties (using ORIGINAL features)
         ↓
         Final Similarity Score
```

---

## Key Files Reference

### JavaScript Components

| File | Purpose | Lines | Documentation |
|------|---------|-------|---------------|
| `lib/scan-orchestrator.js` | Pipeline coordinator | 302 | [Pipeline Data Flow](./pipeline-data-flow.md#stage-by-stage-data-flow) |
| `lib/scanners/repository-scanner.js` | Repository validation & metadata | 344 | [Pipeline Data Flow](./pipeline-data-flow.md#stage-1-repository-scanner) |
| `lib/scanners/ast-grep-detector.js` | Pattern detection | 218 | [Pipeline Data Flow](./pipeline-data-flow.md#stage-2-ast-grep-pattern-detector) |

### Python Components

| File | Purpose | Lines | Documentation |
|------|---------|-------|---------------|
| `lib/extractors/extract_blocks.py` | Block extraction, dedup, suggestions | 671 | [Pipeline Data Flow](./pipeline-data-flow.md#stage-3-code-block-extraction) |
| `lib/similarity/structural.py` | Two-phase similarity algorithm | 493 | [Similarity Algorithm](./similarity-algorithm.md#two-phase-similarity-calculation) |
| `lib/similarity/grouping.py` | Multi-layer grouping | 431 | [Pipeline Data Flow](./pipeline-data-flow.md#stage-5-duplicate-grouping) |

### Configuration

| File | Purpose | Documentation |
|------|---------|---------------|
| `.ast-grep/rules/*` | 18 pattern detection rules | [Pipeline Data Flow](./pipeline-data-flow.md#pattern-detection-rules) |
| `lib/models/*.py` | Pydantic data models | [Pipeline Data Flow](./pipeline-data-flow.md#data-format-specifications) |

---

## Common Tasks

### Understanding Pipeline Flow

1. **Start here:** [Pipeline Data Flow - Overview](./pipeline-data-flow.md#overview)
2. **View architecture diagram:** [Pipeline Architecture](./pipeline-data-flow.md#pipeline-architecture)
3. **Follow data through stages:** [Stage-by-Stage Flow](./pipeline-data-flow.md#stage-by-stage-data-flow)
4. **Check data formats:** [Data Format Specifications](./pipeline-data-flow.md#data-format-specifications)

### Debugging Similarity Issues

1. **Understand the algorithm:** [Similarity Algorithm - Overview](./similarity-algorithm.md#overview)
2. **Check feature extraction:** [Semantic Feature Extraction](./similarity-algorithm.md#semantic-feature-extraction)
3. **Verify normalization:** [Code Normalization](./similarity-algorithm.md#code-normalization)
4. **Review penalties:** [Penalty System](./similarity-algorithm.md#penalty-system)
5. **See examples:** [Implementation Examples](./similarity-algorithm.md#implementation-examples)

### Adding New Features

#### New Pattern Detection Rule
1. Create YAML rule in `.ast-grep/rules/`
2. Update category mapping in `extract_blocks.py`
3. Add to rule count documentation
4. Test with sample code

#### New Semantic Feature
1. Add extraction logic in `extract_semantic_features()` (structural.py)
2. Add penalty calculation in `calculate_semantic_penalty()`
3. Update `SemanticFeatures` dataclass
4. Add tests and examples

#### New Suggestion Strategy
1. Update strategy determination in `_determine_strategy()` (extract_blocks.py)
2. Add migration steps in `_generate_migration_steps()`
3. Add code example in `_generate_code_example()`
4. Update ROI calculation if needed

---

## Critical Implementation Patterns

These patterns are **essential** for correct system behavior:

### ✅ Pattern 1: Two-Phase Feature Extraction

**Why:** Normalization destroys semantic information.

```python
# ✅ CORRECT - Extract BEFORE normalization
features1 = extract_semantic_features(code1)  # PHASE 1
features2 = extract_semantic_features(code2)

normalized1 = normalize_code(code1)           # PHASE 2
normalized2 = normalize_code(code2)

penalty = calculate_semantic_penalty(features1, features2)  # PHASE 3
```

**Reference:** [Similarity Algorithm - Two-Phase](./similarity-algorithm.md#two-phase-similarity-calculation)

---

### ✅ Pattern 2: Function-Based Deduplication

**Why:** AST-grep may match the same function multiple times.

```python
# ✅ CORRECT - Deduplicate by file:function_name
function_key = f"{block.location.file_path}:{function_name}"

if function_key not in seen_functions:
    seen_functions[function_key] = block
    unique_blocks.append(block)
```

**Reference:** [Pipeline Data Flow - Stage 3.5](./pipeline-data-flow.md#stage-35-block-deduplication)

---

### ✅ Pattern 3: Backwards Function Search

**Why:** Searching forwards may find functions AFTER the match.

```python
# ✅ CORRECT - Search backwards to find CLOSEST function
for i in range(line_start - 1, search_start - 1, -1):  # Backwards!
    for pattern in patterns:
        match = re.search(pattern, lines[i])
        if match:
            return match.group(1)  # Closest function
```

**Reference:** [Pipeline Data Flow - Function Extraction](./pipeline-data-flow.md#function-name-extraction)

---

### ✅ Pattern 4: Multiplicative Penalties

**Why:** Compound effect for multiple semantic differences.

```python
# ✅ CORRECT - Multiplicative penalties
penalty = 1.0
if http_codes_differ:
    penalty *= 0.70  # 30% penalty
if operators_differ:
    penalty *= 0.80  # 20% penalty
if methods_differ:
    penalty *= 0.75  # 25% penalty
# Total: 0.70 * 0.80 * 0.75 = 0.42 (58% reduction)
```

**Reference:** [Similarity Algorithm - Penalty System](./similarity-algorithm.md#why-multiplicative-penalties)

---

### ✅ Pattern 5: Correct Field Names

**Why:** Pydantic models expect specific field names.

```python
# ✅ CORRECT
CodeBlock(
    tags=[f"function:{function_name}"]  # Correct field
)

# ❌ WRONG
CodeBlock(
    semantic_tags=[f"function:{function_name}"]  # Field doesn't exist!
)
```

**Reference:** [Pipeline Data Flow - CodeBlock Model](./pipeline-data-flow.md#codeblock-model-pydantic)

---

## Performance Characteristics

### Pipeline Performance

| Repository Size | Total Time | Bottleneck |
|----------------|------------|------------|
| Small (50 files) | ~2s | AST-grep scan (60%) |
| Medium (200 files) | ~6s | AST-grep scan (60%) |
| Large (500 files) | ~15s | Similarity grouping (40%) |
| Extra Large (1000+ files) | ~30s | Similarity grouping (50%) |

**Optimization:** Layer 0 complexity filter removes ~20-30% of trivial blocks before grouping.

### Similarity Algorithm Performance

- **Single comparison:** ~5ms (1ms features + 2ms normalize + 2ms Levenshtein)
- **Grouping n blocks:** O(n²) worst case, O(n × k) with filtering
- **Memory usage:** O(n) for normalized strings

**Optimization:** Early semantic filtering skips incompatible pairs.

---

## Testing & Validation

### Accuracy Metrics

**Test Suite:** `test/accuracy/accuracy-test.js`

```
Precision: 100.00% (0 false positives)
Recall: 87.50% (7/8 true duplicates detected)
F1 Score: 93.33%
False Positive Rate: 0.00%
```

**Interpretation:**
- **100% Precision:** Every group is a true duplicate (no false positives)
- **87.5% Recall:** Catches most duplicates (1 missed due to high threshold)
- **93.33% F1:** Excellent balance of precision and recall

### Test Coverage

- **Unit Tests:** 132 tests, 97.7% passing
- **Integration Tests:** Full pipeline end-to-end
- **Accuracy Tests:** Ground truth comparison

---

## Troubleshooting Guide

### Issue: False Positives (Grouping Non-Duplicates)

**Symptoms:** Code with different behavior grouped together

**Diagnosis:**
1. Check extracted semantic features in stderr logs
2. Verify penalty calculations (should see `Warning: DEBUG` logs)
3. Confirm Layer 1 semantic validation is running

**Solution:**
- Add new semantic feature extraction for missed pattern
- Increase penalty multiplier for that feature type
- Lower similarity threshold (default: 0.90)

**Reference:** [Similarity Algorithm - Penalty System](./similarity-algorithm.md#penalty-system)

---

### Issue: False Negatives (Missing Duplicates)

**Symptoms:** Similar code not grouped

**Diagnosis:**
1. Check if blocks pass Layer 0 complexity filter
2. Calculate similarity manually: `calculate_structural_similarity(code1, code2)`
3. Review normalization output (may be over-aggressive)

**Solution:**
- Lower similarity threshold (try 0.85)
- Reduce Layer 0 complexity requirements
- Add more semantic methods to preservation list

**Reference:** [Similarity Algorithm - Normalization](./similarity-algorithm.md#code-normalization)

---

### Issue: Function Name Not Detected

**Symptoms:** Blocks have empty `tags` field

**Diagnosis:**
1. Check stderr for `DEBUG extract_function_name` logs
2. Verify function pattern matches (see `patterns` list)
3. Confirm file path and line numbers are correct

**Solution:**
- Add new function pattern to `patterns` list
- Increase search window (default: 10 lines backwards)
- Check file encoding (must be UTF-8)

**Reference:** [Pipeline Data Flow - Function Extraction](./pipeline-data-flow.md#function-name-extraction)

---

### Issue: Pipeline Timeout

**Symptoms:** `TimeoutError` or Python process killed

**Diagnosis:**
1. Check repository size (files and total lines)
2. Review stderr for stage that's slow
3. Monitor memory usage (should be < 500MB)

**Solution:**
- Increase timeout in `scan-orchestrator.js` (default: 600s)
- Disable unused AST-grep rules
- Process smaller subdirectories separately

**Reference:** [Pipeline Data Flow - Performance](./pipeline-data-flow.md#performance-considerations)

---

## Contributing

When updating this documentation:

1. **Maintain version history** in each document header
2. **Update cross-references** in all related documents
3. **Add Mermaid diagrams** for new architectural patterns
4. **Include code examples** with comments
5. **Test all code snippets** before committing

---

## Related Documentation

### Project Documentation
- [Main README](../../README.md) - Project overview and quick start
- [CLAUDE.md](../../CLAUDE.md) - Claude Code instructions and critical patterns

### Component Documentation
- [AlephAuto Framework](../../sidequest/README.md) - Job queue system
- [AST-Grep Rules](../../.ast-grep/README.md) - Pattern detection rules (TODO)
- [Pydantic Models](../../lib/models/README.md) - Data model specifications (TODO)

### Test Documentation
- [Test Suite Overview](../../test/README.md) - Test coverage and results (TODO)
- [Accuracy Tests](../../test/accuracy/README.md) - Ground truth validation (TODO)

---

## Document Metadata

**Created:** 2025-11-17
**Version:** 1.8.1
**Last Updated:** 2026-02-01
**Maintainer:** Architecture Team
**Review Schedule:** Quarterly or after major architectural changes

---

## Quick Navigation

- **[← Back to Main README](../../README.md)**
- **[System Data Flow (NEW) →](./SYSTEM-DATA-FLOW.md)** - Complete system architecture
- **[Pipeline Data Flow →](./pipeline-data-flow.md)** - Individual pipeline details
- **[Similarity Algorithm →](./similarity-algorithm.md)** - Duplicate detection algorithm
- **[Cheat Sheet →](./CHEAT-SHEET.md)** - Quick reference
