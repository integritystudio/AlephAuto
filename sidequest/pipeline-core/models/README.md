# TypeScript Models for Duplicate Detection

Data models for structuring duplicate detection and consolidation results using TypeScript types with Zod validation.

## Overview

These models define the data structures used throughout the duplicate detection pipeline, from individual code blocks to complete scan reports with consolidation recommendations. All models were migrated from Python/Pydantic to TypeScript/Zod — see `types.ts` and `validation.ts`.

## Model Hierarchy

```
ScanReport (top-level)
├── RepositoryInfo[]        # Scanned repositories
├── ScanConfiguration       # Scan settings
├── ScanMetrics            # Statistical summary
├── code_block_ids[]       # → CodeBlock references
├── duplicate_group_ids[]  # → DuplicateGroup references
└── suggestion_ids[]       # → ConsolidationSuggestion references

CodeBlock                   # Individual code pattern
├── SourceLocation         # File + line location
├── ASTNode               # AST tree structure
├── LanguageType          # Programming language enum
└── SemanticCategory      # Pattern category enum

DuplicateGroup             # Similar code blocks
├── member_block_ids[]    # CodeBlock references
├── SimilarityMethod      # How similarity was determined
└── computed: impact_score, priority_level

ConsolidationSuggestion    # Refactoring recommendation
├── ConsolidationStrategy # Tier: local_util → autonomous_agent
├── ImplementationComplexity
├── MigrationRisk
├── MigrationStep[]       # Step-by-step guide
└── computed: priority, roi_score, is_quick_win
```

## Models

### CodeBlock

Represents a code pattern detected by ast-grep.

| Field | Type | Description |
|-------|------|-------------|
| `block_id` | str | Unique identifier |
| `pattern_id` | str | ast-grep rule ID |
| `location` | SourceLocation | File path + line numbers |
| `source_code` | str | Raw source code |
| `language` | LanguageType | javascript, typescript, python, etc. |
| `category` | SemanticCategory | utility, api_handler, database_operation, etc. |
| `content_hash` | computed | SHA-256 hash for exact matching |
| `structural_hash` | computed | AST-based hash for structural matching |

### DuplicateGroup

Groups similar CodeBlocks as consolidation candidates.

| Field | Type | Description |
|-------|------|-------------|
| `group_id` | str | Unique identifier |
| `member_block_ids` | List[str] | CodeBlock IDs (min 2) |
| `similarity_score` | float | 0.0-1.0 similarity |
| `similarity_method` | SimilarityMethod | exact_match, structural, semantic, hybrid |
| `occurrence_count` | int | Number of instances |
| `deduplication_potential` | computed | Lines removable |
| `impact_score` | computed | 0-100 consolidation priority |
| `priority_level` | computed | critical, high, medium, low |

### ConsolidationSuggestion

Actionable recommendation for consolidating duplicates.

| Field | Type | Description |
|-------|------|-------------|
| `suggestion_id` | str | Unique identifier |
| `duplicate_group_id` | str | Target DuplicateGroup |
| `strategy` | ConsolidationStrategy | local_util, shared_package, mcp_server, autonomous_agent |
| `complexity` | ImplementationComplexity | trivial, simple, moderate, complex, very_complex |
| `migration_risk` | MigrationRisk | minimal, low, medium, high, critical |
| `migration_steps` | List[MigrationStep] | Step-by-step implementation guide |
| `priority` | computed | Based on impact + complexity |
| `roi_score` | computed | Return on investment (0-100) |
| `is_quick_win` | computed | High impact + low effort + low risk |

### ScanReport

Top-level report containing all scan results.

| Field | Type | Description |
|-------|------|-------------|
| `report_id` | str | Unique identifier |
| `repositories` | List[RepositoryInfo] | Scanned repos |
| `configuration` | ScanConfiguration | Rules and thresholds used |
| `metrics` | ScanMetrics | Statistical summary |
| `duplication_severity` | computed | minimal, low, moderate, high, critical |
| `consolidation_opportunity_score` | computed | 0-100 benefit score |

## Usage

### Import Types

```typescript
import type { CodeBlock, DuplicateGroup, ConsolidationSuggestion } from './types.ts';
import { validateCodeBlock } from './validation.ts';
```

See `types.ts` for full type definitions and `validation.ts` for Zod schemas.

## Related Documentation

- [Similarity Algorithm](../../../docs/architecture/similarity-algorithm.md) - How duplicates are detected
- [Pipeline Data Flow](../../../docs/architecture/pipeline-data-flow.md) - How models flow through pipeline
- [AST-Grep Rules](../../../.ast-grep/README.md) - Pattern detection rules

---

**Version:** 2.0.0
**Runtime:** TypeScript (Zod validation)
