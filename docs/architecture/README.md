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
**Last Updated:** 2026-03-15
**Version:** 2.3.20

## Overview

This directory contains comprehensive architectural documentation for the AlephAuto automation system's 11 pipelines, job queue framework, and multi-layer similarity algorithm.

## Documentation Files

### 🏗️ [System Data Flow](./SYSTEM-DATA-FLOW.md)

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

**Complete guide to all 11 AlephAuto pipelines and their data flows**

**Contents:**
- End-to-end pipeline architecture (Duplicate Detection: all stages now TypeScript)
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
- Understanding how data flows through the Duplicate Detection pipeline
- Debugging pipeline stage failures
- Adding new pattern detection rules
- Extending the suggestion generation logic
- Optimizing pipeline performance

---

### 🔬 [Similarity Algorithm](./technical/similarity-algorithm.md)

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
- Layer 3 category + tags matching for conceptual duplicates
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
│                  (sidequest/pipeline-core/scan-orchestrator.ts)                       │
└──────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌──────────────────┐                    ┌──────────────────────┐
│ Stage 1-2        │                    │ Stage 3-7            │
│                  │                    │                      │
│ • Repo Scanner   │ ────────────────▶  │ • Block Extraction   │
│ • AST-Grep       │                    │ • Deduplication      │
│                  │                    │ • Grouping (Layer 0-2)│
│                  │                    │ • Suggestions        │
│                  │                    │ • Reporting          │
└──────────────────┘                    └──────────────────────┘
        All stages are now pure TypeScript
```

### Duplicate Detection: Multi-Layer Grouping

Layer 0 (complexity filter) → Layer 1 (exact hash) → Layer 2 (structural similarity) → Layer 3 (semantic category+tags). See [Similarity Algorithm](./technical/similarity-algorithm.md) for full details including two-phase extraction, penalty system, and accuracy metrics.

---

## Key Files

| Component | File | Details |
|-----------|------|---------|
| Scan orchestrator | `sidequest/pipeline-core/scan-orchestrator.ts` | [Pipeline Data Flow](./pipeline-data-flow.md) |
| Repository scanner | `sidequest/pipeline-core/scanners/repository-scanner.ts` | [Pipeline Data Flow](./pipeline-data-flow.md#stage-1-repository-scanner) |
| AST-grep detector | `sidequest/pipeline-core/scanners/ast-grep-detector.ts` | [Pipeline Data Flow](./pipeline-data-flow.md#stage-2-ast-grep-pattern-detector) |
| Block extraction | `sidequest/pipeline-core/extractors/extract-blocks.ts` | [Pipeline Data Flow](./pipeline-data-flow.md#stage-3-code-block-extraction) |
| Similarity algorithm | `sidequest/pipeline-core/similarity/structural.ts` | [Similarity Algorithm](./technical/similarity-algorithm.md) |
| Multi-layer grouping | `sidequest/pipeline-core/similarity/grouping.ts` | [Pipeline Data Flow](./pipeline-data-flow.md#stage-5-duplicate-grouping) |
| AST-grep rules | `.ast-grep/rules/*` (18 rules) | [Pipeline Data Flow](./pipeline-data-flow.md#pattern-detection-rules) |
| Data models | `sidequest/pipeline-core/models/types.ts` | [Pipeline Data Flow](./pipeline-data-flow.md#data-format-specifications) |

---

## Related Documentation

- [Main README](../../README.md) - Project overview and quick start
- [CLAUDE.md](../../CLAUDE.md) - Claude Code instructions and critical patterns

---

## Quick Navigation

- **[← Back to Main README](../../README.md)**
- **[System Data Flow →](./SYSTEM-DATA-FLOW.md)** - Complete system architecture + mermaid diagrams
- **[Pipeline Data Flow →](./pipeline-data-flow.md)** - Individual pipeline details
- **[Similarity Algorithm →](./technical/similarity-algorithm.md)** - Duplicate detection algorithm
- **[Error Handling →](./ERROR_HANDLING.md)** - Error classification, retry, circuit breakers, worker registry
- **[Type System →](./TYPE_SYSTEM.md)** - Zod schemas and TypeScript patterns
- **[Pipeline Execution →](./pipeline-execution.md)** - Node execution, Doppler, PM2
- **[Migration Transformer →](./MIGRATION_TRANSFORMER.md)** - AST-based code transformation
- **[Adding Pipelines →](./setup/ADDING_PIPELINES.md)** - Step-by-step guide for new pipelines
- **[Install Guide →](./INSTALL.md)** - Setup and installation
