# Pydantic Models for Duplicate Detection

Data models for structuring duplicate detection and consolidation results using Pydantic v2.

## Overview

These models define the data structures used throughout the duplicate detection pipeline, from individual code blocks to complete scan reports with consolidation recommendations.

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

## Enums

### LanguageType
```python
JAVASCRIPT, TYPESCRIPT, PYTHON, JAVA, GO, RUST, C, CPP, CSHARP, PHP, RUBY
```

### SemanticCategory
```python
UTILITY, HELPER, VALIDATOR, API_HANDLER, AUTH_CHECK, DATABASE_OPERATION,
ERROR_HANDLER, LOGGER, CONFIG_ACCESS, FILE_OPERATION, ASYNC_PATTERN, UNKNOWN
```

### SimilarityMethod
```python
EXACT_MATCH   # Identical code
STRUCTURAL    # Same AST structure
SEMANTIC      # Similar logic/behavior
HYBRID        # Combination of methods
```

### ConsolidationStrategy
```python
LOCAL_UTIL        # Utility within single project
SHARED_PACKAGE    # Shared library across 2-3 projects
MCP_SERVER        # MCP server for cross-language/tool
AUTONOMOUS_AGENT  # Complex orchestration requiring AI
NO_ACTION         # Not worth consolidating
```

## Usage

### Import Models

```python
from sidequest.pipeline_core.models import (
    CodeBlock,
    DuplicateGroup,
    ConsolidationSuggestion,
    ScanReport,
    LanguageType,
    SemanticCategory,
    SimilarityMethod,
)
```

### Create CodeBlock

```python
from sidequest.pipeline_core.models import (
    CodeBlock, SourceLocation, LanguageType, SemanticCategory
)

block = CodeBlock(
    block_id="cb_001",
    pattern_id="object-manipulation",
    location=SourceLocation(
        file_path="/path/to/repo/src/utils.js",
        line_start=42,
        line_end=44
    ),
    relative_path="src/utils.js",
    source_code="JSON.stringify(data, null, 2)",
    language=LanguageType.JAVASCRIPT,
    category=SemanticCategory.UTILITY,
    repository_path="/path/to/repo",
    line_count=3
)

# Access computed hashes
print(block.content_hash)      # e.g., "a1b2c3d4e5f6..."
print(block.structural_hash)   # Falls back to content_hash if no AST
```

### Create DuplicateGroup

```python
from sidequest.pipeline_core.models import DuplicateGroup, SimilarityMethod

group = DuplicateGroup(
    group_id="dg_001",
    pattern_id="object-manipulation",
    member_block_ids=["cb_001", "cb_002", "cb_003"],
    similarity_score=0.95,
    similarity_method=SimilarityMethod.STRUCTURAL,
    category="utility",
    language="javascript",
    occurrence_count=3,
    total_lines=9,
    affected_files=["src/utils.js", "src/helpers.js"]
)

# Access computed fields
print(group.deduplication_potential)  # Lines removable: 6
print(group.impact_score)             # 0-100 priority score
print(group.priority_level)           # "high"
print(group.is_cross_repository)      # False
```

### Create ConsolidationSuggestion

```python
from sidequest.pipeline_core.models import (
    ConsolidationSuggestion,
    ConsolidationStrategy,
    ImplementationComplexity,
    MigrationRisk
)

suggestion = ConsolidationSuggestion(
    suggestion_id="cs_001",
    duplicate_group_id="dg_001",
    strategy=ConsolidationStrategy.LOCAL_UTIL,
    strategy_rationale="Used within single project, simple utility function",
    impact_score=75.0,
    complexity=ImplementationComplexity.TRIVIAL,
    migration_risk=MigrationRisk.LOW,
    breaking_changes=False,
    target_location="src/utils/json.js",
    target_name="writeJsonFile",
    loc_reduction=15,
    affected_files_count=5,
    affected_repositories_count=1,
    confidence=0.9
)

# Access computed fields
print(suggestion.priority)      # "critical"
print(suggestion.roi_score)     # Return on investment
print(suggestion.is_quick_win)  # True

# Add migration steps
suggestion.add_migration_step(
    description="Create writeJsonFile function in src/utils/json.js",
    code_example="export function writeJsonFile(path, data) { ... }",
    automated=True,
    estimated_time="15min"
)

# Generate markdown summary
print(suggestion.to_markdown_summary())
```

### Export for Comparison

```python
# Export minimal data for clustering algorithms
comparison_data = block.to_dict_for_comparison()
# Returns: { block_id, pattern_id, category, language, content_hash, ... }

# Export summary for dashboards
summary = report.to_summary_dict()
# Returns: { report_id, duplication_percentage, quick_wins, ... }
```

## Validation

Models include Pydantic validators:

```python
# Line range validation
SourceLocation(file_path="x.js", line_start=10, line_end=5)
# ValidationError: line_end must be >= line_start

# Minimum members validation
DuplicateGroup(member_block_ids=["cb_001"])  # Only 1 member
# ValidationError: A duplicate group must have at least 2 members

# Canonical block validation
group.set_canonical("cb_999")  # Not in member_block_ids
# ValueError: Block cb_999 is not a member of this group
```

## JSON Schema

All models support JSON schema export for API documentation:

```python
import json
from sidequest.pipeline_core.models import CodeBlock

schema = CodeBlock.model_json_schema()
print(json.dumps(schema, indent=2))
```

## Related Documentation

- [Similarity Algorithm](../../../docs/architecture/similarity-algorithm.md) - How duplicates are detected
- [Pipeline Data Flow](../../../docs/architecture/pipeline-data-flow.md) - How models flow through pipeline
- [AST-Grep Rules](../../../.ast-grep/README.md) - Pattern detection rules

---

**Version:** 1.0.0
**Pydantic:** v2
**Python:** 3.10+
