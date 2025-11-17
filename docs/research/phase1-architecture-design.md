# Phase 1, Task 5: System Architecture Design

**Date:** 2025-11-11
**Task:** Design system architecture: Create data flow diagram for duplicate detection pipeline
**Status:** ✅ Complete

## Executive Summary

This document defines the complete architecture for the **Code Consolidation System**, integrating ast-grep pattern detection, repomix context aggregation, pydantic data modeling, and Schema.org semantic annotation into a cohesive pipeline for detecting and consolidating duplicate code across repositories.

**Core Design Principle:** **Separation of concerns with clear data flow**

## System Overview

### Purpose

Automatically detect duplicate code patterns across multiple repositories and generate actionable consolidation recommendations with minimal false positives.

### Key Components

| Component | Responsibility | Technology |
|-----------|----------------|------------|
| **Repository Scanner** | File discovery and metadata extraction | repomix |
| **Pattern Detector** | AST-based pattern matching | ast-grep |
| **Code Block Extractor** | Structure detected patterns | pydantic |
| **Semantic Annotator** | Add semantic metadata | CodePattern vocabulary |
| **Duplicate Grouper** | Find similar code blocks | Custom algorithm |
| **Suggestion Generator** | Create consolidation recommendations | Business logic |
| **Report Generator** | Produce final output | pydantic + templates |
| **Scan Orchestrator** | Coordinate entire pipeline | JavaScript/Node.js |
| **Job Scheduler** | Manage nightly scans | Cron + Queue |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Job Scheduler                               │
│                    (Cron + SidequestServer)                         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Scan Orchestrator                             │
│                  (Main pipeline coordinator)                        │
└────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────────────┘
     │      │      │      │      │      │      │      │
     ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼
   ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐
   │Repo ││Pat- ││Code ││Sem- ││Dup- ││Sug- ││Re-  ││Cache│
   │Scan ││tern ││Block││antic││licate││ges- ││port ││     │
   │     ││Det- ││Ext- ││Anno-││Group││tion ││Gen  ││     │
   │     ││ector││ract.││tator││er   ││Gen  ││     ││     │
   └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘
```

### Data Flow Overview

```
Repository → Scanner → Patterns → CodeBlocks → Annotated → Groups → Suggestions → Report
     ↓          ↓          ↓          ↓            ↓          ↓          ↓          ↓
  Git repo  Metadata   AST nodes  Pydantic    Semantic   Similar   Actions   JSON/HTML
                                  models      tags       blocks    ranked
```

## Detailed Component Architecture

### 1. Repository Scanner

**Purpose:** Discover files, extract metadata, provide scanning context

**Input:**
```javascript
{
  repository_path: '/path/to/repo',
  scan_config: {
    use_git_changes: true,
    max_file_size: 104857600,
    exclude_patterns: ['node_modules/**', 'dist/**']
  }
}
```

**Output:**
```javascript
{
  repository_info: {
    path: '/path/to/repo',
    name: 'my-project',
    total_files: 245,
    total_lines: 15420,
    languages: ['javascript', 'typescript', 'python'],
    git_remote: 'https://github.com/user/repo',
    git_commit: 'abc123...'
  },
  file_metadata: [
    {
      path: '/path/to/repo/src/utils.js',
      size: 5420,
      language: 'javascript',
      git_changes: 12,
      token_count: 850,
      last_modified: '2025-11-10T15:30:00Z'
    },
    // ... more files
  ]
}
```

**Technology:**
- Primary: repomix (context aggregation)
- Fallback: Native file system walk

**Interface:**
```javascript
interface IRepositoryScanner {
  async scanRepository(repoPath: string, config: ScanConfig): Promise<RepositoryScanResult>;
  async getFileMetadata(filePath: string): Promise<FileMetadata>;
  async listFiles(repoPath: string, filter?: FileFilter): Promise<string[]>;
}
```

**Implementation:**
```javascript
class RepositoryScanner implements IRepositoryScanner {
  constructor(repomixService) {
    this.repomixService = repomixService;
  }

  async scanRepository(repoPath, config) {
    // Use repomix for metadata
    const repomixResult = await this.repomixService.scan(repoPath);

    // Parse output
    const metadata = this.parseRepomixOutput(repomixResult);

    return {
      repository_info: metadata.repoInfo,
      file_metadata: metadata.files
    };
  }
}
```

### 2. Pattern Detector

**Purpose:** Find code patterns using ast-grep rules

**Input:**
```javascript
{
  repository_path: '/path/to/repo',
  rules_directory: '.ast-grep/rules',
  file_filter: {
    languages: ['javascript', 'typescript'],
    include_patterns: ['src/**/*.js', 'lib/**/*.ts'],
    exclude_patterns: ['**/*.test.js']
  }
}
```

**Output:**
```javascript
{
  matches: [
    {
      rule_id: 'object-manipulation',
      file_path: '/path/to/repo/src/utils.js',
      line_start: 42,
      line_end: 44,
      matched_text: 'JSON.stringify(data, null, 2)',
      ast_node: {
        type: 'CallExpression',
        callee: 'JSON.stringify',
        arguments: ['data', 'null', '2']
      },
      meta_variables: {
        '$OBJ': 'data'
      }
    },
    // ... more matches
  ],
  statistics: {
    total_matches: 127,
    rules_applied: 18,
    files_scanned: 245,
    scan_duration_ms: 3421
  }
}
```

**Technology:**
- ast-grep (primary pattern detection)
- tree-sitter (AST parsing, via ast-grep)

**Interface:**
```javascript
interface IPatternDetector {
  async detectPatterns(repoPath: string, config: PatternConfig): Promise<PatternMatches>;
  async detectInFile(filePath: string, rules: Rule[]): Promise<Match[]>;
  async loadRules(rulesDir: string): Promise<Rule[]>;
}
```

**Implementation:**
```javascript
class AstGrepPatternDetector implements IPatternDetector {
  async detectPatterns(repoPath, config) {
    const rules = await this.loadRules(config.rules_directory);

    // Run ast-grep scan
    const results = await this.runAstGrep({
      directory: repoPath,
      rules: rules,
      languages: config.file_filter.languages
    });

    return {
      matches: results.map(this.normalizeMatch),
      statistics: this.calculateStats(results)
    };
  }

  async runAstGrep(options) {
    // Execute: sg scan --json --config .ast-grep/sgconfig.yml
    const proc = spawn('sg', ['scan', '--json', '--config', options.config]);
    // ... collect output
  }
}
```

### 3. Code Block Extractor

**Purpose:** Convert pattern matches into structured CodeBlock models

**Input:**
```javascript
{
  pattern_match: {
    rule_id: 'object-manipulation',
    file_path: '/path/to/repo/src/utils.js',
    line_start: 42,
    line_end: 44,
    matched_text: 'JSON.stringify(data, null, 2)',
    ast_node: { type: 'CallExpression', ... }
  },
  repository_info: {
    path: '/path/to/repo',
    name: 'my-project'
  },
  file_metadata: {
    language: 'javascript',
    token_count: 850
  }
}
```

**Output:**
```python
CodeBlock(
    block_id='cb_20251111_001',
    pattern_id='object-manipulation',
    location=SourceLocation(
        file_path='/path/to/repo/src/utils.js',
        line_start=42,
        line_end=44
    ),
    relative_path='src/utils.js',
    source_code='JSON.stringify(data, null, 2)',
    language='javascript',
    category='utility',  # Will be enriched by Semantic Annotator
    repository_path='/path/to/repo',
    line_count=3,
    ast_structure=ASTNode(
        node_type='CallExpression',
        children=[...]
    )
)
```

**Technology:**
- pydantic (data validation and structuring)
- Python (model instantiation)

**Interface:**
```python
class ICodeBlockExtractor(Protocol):
    def extract_code_block(
        self,
        match: PatternMatch,
        repo_info: RepositoryInfo,
        file_metadata: FileMetadata
    ) -> CodeBlock:
        ...

    def extract_batch(
        self,
        matches: List[PatternMatch],
        repo_info: RepositoryInfo
    ) -> List[CodeBlock]:
        ...
```

**Implementation:**
```python
class CodeBlockExtractor:
    def extract_code_block(self, match, repo_info, file_metadata):
        # Generate unique block ID
        block_id = self.generate_block_id(match)

        # Create pydantic model
        return CodeBlock(
            block_id=block_id,
            pattern_id=match.rule_id,
            location=SourceLocation(
                file_path=match.file_path,
                line_start=match.line_start,
                line_end=match.line_end
            ),
            relative_path=self.get_relative_path(
                match.file_path,
                repo_info.path
            ),
            source_code=match.matched_text,
            language=file_metadata.language,
            category=self.infer_category(match.rule_id),
            repository_path=repo_info.path,
            line_count=match.line_end - match.line_start + 1,
            ast_structure=self.build_ast_node(match.ast_node)
        )
```

### 4. Semantic Annotator

**Purpose:** Add semantic metadata using CodePattern vocabulary

**Input:**
```python
CodeBlock(
    block_id='cb_20251111_001',
    pattern_id='object-manipulation',
    source_code='JSON.stringify(data, null, 2)',
    category='utility',  # Basic category from pattern
    # ... other fields
)
```

**Output:**
```python
CodeBlock(
    # ... existing fields ...
    category='UtilityPattern',
    subcategory='FormatConversion',
    tags=['serialization', 'json', 'formatting', 'output'],
    semantic_metadata={
        'purpose': 'Transform data for output',
        'behavior': 'Converts JavaScript object to JSON string with formatting',
        'has_side_effects': False,
        'purity': 'pure',
        'consolidation_potential': 'high',
        'typical_usage': 'Data serialization for API responses or file output'
    }
)
```

**Technology:**
- CodePattern vocabulary (custom schema)
- Rule-based classification
- Heuristic analysis

**Interface:**
```python
class ISemanticAnnotator(Protocol):
    def annotate(self, code_block: CodeBlock) -> CodeBlock:
        ...

    def classify_category(self, pattern_id: str, code: str) -> tuple[str, str]:
        """Returns (category, subcategory)"""
        ...

    def generate_tags(self, code_block: CodeBlock) -> List[str]:
        ...
```

**Implementation:**
```python
class SemanticAnnotator:
    def __init__(self):
        self.pattern_mapping = self.load_pattern_mapping()

    def annotate(self, code_block):
        # Classify using pattern mapping
        category, subcategory = self.classify_category(
            code_block.pattern_id,
            code_block.source_code
        )

        # Generate semantic tags
        tags = self.generate_tags(code_block)

        # Infer semantic properties
        metadata = self.infer_semantic_metadata(code_block)

        # Update code block
        code_block.category = category
        code_block.subcategory = subcategory
        code_block.tags = tags
        code_block.semantic_metadata = metadata

        return code_block

    def load_pattern_mapping(self):
        # Load pattern-category-mapping.yml
        return {
            'object-manipulation': ('UtilityPattern', 'ObjectOperation'),
            'array-map-filter': ('UtilityPattern', 'ArrayOperation'),
            'express-route-handlers': ('APIPattern', 'RouteHandler'),
            # ... 18 mappings total
        }
```

### 5. Duplicate Grouper

**Purpose:** Find similar code blocks and group them

**Input:**
```python
code_blocks: List[CodeBlock] = [
    CodeBlock(block_id='cb_001', content_hash='abc123', ...),
    CodeBlock(block_id='cb_002', content_hash='abc124', ...),
    CodeBlock(block_id='cb_003', content_hash='abc123', ...),
    # ... more blocks
]

config: DuplicateConfig = {
    'similarity_threshold': 0.8,
    'group_method': 'structural',  # or 'semantic', 'exact'
    'min_group_size': 2
}
```

**Output:**
```python
duplicate_groups: List[DuplicateGroup] = [
    DuplicateGroup(
        group_id='dg_001',
        pattern_id='object-manipulation',
        member_block_ids=['cb_001', 'cb_003', 'cb_007'],
        similarity_score=0.95,
        similarity_method='structural',
        category='UtilityPattern',
        occurrence_count=3,
        total_lines=9,
        affected_files=['utils.js', 'helpers.js', 'api.js'],
        impact_score=72.5  # computed property
    ),
    # ... more groups
]
```

**Technology:**
- Custom similarity algorithm
- Structural hash comparison (AST-based)
- Semantic similarity (category + tags)

**Interface:**
```python
class IDuplicateGrouper(Protocol):
    def group_duplicates(
        self,
        blocks: List[CodeBlock],
        config: DuplicateConfig
    ) -> List[DuplicateGroup]:
        ...

    def calculate_similarity(
        self,
        block1: CodeBlock,
        block2: CodeBlock
    ) -> float:
        ...

    def find_canonical_block(
        self,
        group: DuplicateGroup
    ) -> str:  # block_id
        ...
```

**Implementation:**
```python
class DuplicateGrouper:
    def group_duplicates(self, blocks, config):
        groups = []

        # Group by exact content hash first
        hash_groups = self.group_by_hash(blocks)

        # Find structural duplicates
        for hash_group in hash_groups:
            if len(hash_group) < config.min_group_size:
                continue

            # Check structural similarity
            similar_groups = self.find_similar_groups(
                hash_group,
                config.similarity_threshold
            )

            for group_blocks in similar_groups:
                group = self.create_duplicate_group(group_blocks)
                groups.append(group)

        return groups

    def calculate_similarity(self, block1, block2):
        similarity = 0.0

        # Category match (30%)
        if block1.category == block2.category:
            similarity += 0.3
            if block1.subcategory == block2.subcategory:
                similarity += 0.1

        # Structural hash (30%)
        if block1.ast_hash == block2.ast_hash:
            similarity += 0.3

        # Content similarity (20%)
        content_sim = self.levenshtein_similarity(
            block1.source_code,
            block2.source_code
        )
        similarity += content_sim * 0.2

        # Tag overlap (20%)
        tag_overlap = len(set(block1.tags) & set(block2.tags))
        max_tags = max(len(block1.tags), len(block2.tags))
        if max_tags > 0:
            similarity += (tag_overlap / max_tags) * 0.2

        return min(similarity, 1.0)
```

### 6. Suggestion Generator

**Purpose:** Create actionable consolidation recommendations

**Input:**
```python
duplicate_group: DuplicateGroup(
    group_id='dg_001',
    pattern_id='object-manipulation',
    member_block_ids=['cb_001', 'cb_003', 'cb_007'],
    occurrence_count=3,
    category='UtilityPattern',
    subcategory='FormatConversion',
    total_lines=9,
    affected_repositories=['/repo1'],
    affected_files=['utils.js', 'helpers.js', 'api.js']
)
```

**Output:**
```python
suggestion: ConsolidationSuggestion(
    suggestion_id='cs_001',
    duplicate_group_id='dg_001',
    strategy='local_util',  # Recommended tier
    strategy_rationale='Simple utility used within single project',
    implementation_plan={
        'target_location': 'src/utils/json-formatter.js',
        'function_name': 'formatJson',
        'function_signature': 'function formatJson(data): string'
    },
    impact_score=75.0,
    complexity='trivial',
    migration_risk='low',
    breaking_changes=False,
    estimated_effort_hours=0.5,
    migration_steps=[
        MigrationStep(
            order=1,
            action='Create utility function',
            description='Create src/utils/json-formatter.js with formatJson()',
            code_example='export function formatJson(data) { return JSON.stringify(data, null, 2); }'
        ),
        MigrationStep(
            order=2,
            action='Replace occurrences',
            description='Replace 3 instances with formatJson() call',
            affected_files=['utils.js', 'helpers.js', 'api.js']
        ),
        MigrationStep(
            order=3,
            action='Test',
            description='Run test suite to verify functionality',
            verification='npm test'
        )
    ],
    roi_score=150.0  # computed: impact/effort * 10
)
```

**Technology:**
- Business logic and heuristics
- Consolidation tier decision tree

**Interface:**
```python
class ISuggestionGenerator(Protocol):
    def generate_suggestion(
        self,
        group: DuplicateGroup,
        repo_context: RepositoryInfo
    ) -> ConsolidationSuggestion:
        ...

    def determine_strategy(
        self,
        group: DuplicateGroup
    ) -> ConsolidationStrategy:
        ...

    def generate_migration_steps(
        self,
        group: DuplicateGroup,
        strategy: ConsolidationStrategy
    ) -> List[MigrationStep]:
        ...
```

**Implementation:**
```python
class SuggestionGenerator:
    def generate_suggestion(self, group, repo_context):
        # Determine consolidation tier
        strategy = self.determine_strategy(group)

        # Calculate impact score
        impact = self.calculate_impact_score(group)

        # Estimate effort
        complexity, effort_hours = self.estimate_effort(group, strategy)

        # Generate migration plan
        steps = self.generate_migration_steps(group, strategy)

        return ConsolidationSuggestion(
            suggestion_id=self.generate_suggestion_id(),
            duplicate_group_id=group.group_id,
            strategy=strategy,
            strategy_rationale=self.explain_strategy(group, strategy),
            impact_score=impact,
            complexity=complexity,
            migration_risk=self.assess_risk(group),
            estimated_effort_hours=effort_hours,
            migration_steps=steps
        )

    def determine_strategy(self, group):
        # Decision tree based on group characteristics

        # Single repository, low complexity → local_util
        if len(group.affected_repositories) == 1:
            if group.occurrence_count <= 5:
                return 'local_util'

        # 2-3 repos, moderate complexity → shared_package
        if 2 <= len(group.affected_repositories) <= 3:
            return 'shared_package'

        # Cross-language or tool integration → mcp_server
        if self.requires_cross_language(group):
            return 'mcp_server'

        # Complex orchestration → autonomous_agent
        if group.complexity_score > 0.8:
            return 'autonomous_agent'

        return 'local_util'  # Default
```

### 7. Report Generator

**Purpose:** Create final scan report with metrics and recommendations

**Input:**
```python
{
    'repository_info': RepositoryInfo(...),
    'code_blocks': List[CodeBlock],
    'duplicate_groups': List[DuplicateGroup],
    'suggestions': List[ConsolidationSuggestion],
    'scan_config': ScanConfiguration(...)
}
```

**Output:**
```python
scan_report: ScanReport(
    report_id='scan_20251111_001',
    scan_name='My Project Duplicate Scan',
    scanned_at=datetime.utcnow(),
    scan_duration_seconds=247.3,
    repositories=[...],
    code_block_ids=[...],
    duplicate_group_ids=[...],
    suggestion_ids=[...],
    metrics=ScanMetrics(
        total_code_blocks=150,
        total_duplicate_groups=12,
        total_duplicated_lines=300,
        potential_loc_reduction=250,
        duplication_percentage=12.0,
        total_suggestions=12,
        quick_wins=5
    ),
    executive_summary='Scanned 1 repository...',
    recommendations=['Create utility library...'],
    output_directory='/path/to/output'
)
```

**Output Formats:**
- JSON (structured data)
- HTML (interactive dashboard)
- Markdown (human-readable)

**Interface:**
```python
class IReportGenerator(Protocol):
    def generate_report(
        self,
        scan_data: ScanData
    ) -> ScanReport:
        ...

    def export_json(
        self,
        report: ScanReport,
        output_path: str
    ) -> None:
        ...

    def export_html(
        self,
        report: ScanReport,
        output_path: str
    ) -> None:
        ...
```

### 8. Scan Orchestrator

**Purpose:** Coordinate entire pipeline from start to finish

**Responsibilities:**
- Initialize all components
- Execute pipeline stages in order
- Handle errors and retries
- Manage data flow between stages
- Track progress and metrics

**Complete Flow:**
```javascript
class ScanOrchestrator {
  constructor({
    repositoryScanner,
    patternDetector,
    codeBlockExtractor,
    semanticAnnotator,
    duplicateGrouper,
    suggestionGenerator,
    reportGenerator,
    cache
  }) {
    // Inject all dependencies
  }

  async scanRepository(repoPath, config) {
    const startTime = Date.now();

    try {
      // Stage 1: Repository scanning
      logger.info('Stage 1: Scanning repository');
      const repoScan = await this.repositoryScanner.scanRepository(
        repoPath,
        config.scan_config
      );

      // Stage 2: Pattern detection
      logger.info('Stage 2: Detecting patterns');
      const patterns = await this.patternDetector.detectPatterns(
        repoPath,
        config.pattern_config
      );

      // Stage 3: Code block extraction
      logger.info('Stage 3: Extracting code blocks');
      const codeBlocks = await this.codeBlockExtractor.extract_batch(
        patterns.matches,
        repoScan.repository_info
      );

      // Stage 4: Semantic annotation
      logger.info('Stage 4: Adding semantic metadata');
      const annotatedBlocks = await Promise.all(
        codeBlocks.map(block => this.semanticAnnotator.annotate(block))
      );

      // Stage 5: Duplicate grouping
      logger.info('Stage 5: Grouping duplicates');
      const duplicateGroups = await this.duplicateGrouper.group_duplicates(
        annotatedBlocks,
        config.duplicate_config
      );

      // Stage 6: Suggestion generation
      logger.info('Stage 6: Generating suggestions');
      const suggestions = await Promise.all(
        duplicateGroups.map(group =>
          this.suggestionGenerator.generate_suggestion(
            group,
            repoScan.repository_info
          )
        )
      );

      // Stage 7: Report generation
      logger.info('Stage 7: Creating report');
      const report = await this.reportGenerator.generate_report({
        repository_info: repoScan.repository_info,
        code_blocks: annotatedBlocks,
        duplicate_groups: duplicateGroups,
        suggestions: suggestions,
        scan_config: config,
        scan_duration_seconds: (Date.now() - startTime) / 1000
      });

      // Stage 8: Export
      logger.info('Stage 8: Exporting results');
      await this.exportReport(report, config.output_dir);

      // Cache result
      await this.cache.set(repoPath, report);

      logger.info('Scan completed successfully', {
        duration: report.scan_duration_seconds,
        blocks: report.metrics.total_code_blocks,
        groups: report.metrics.total_duplicate_groups,
        suggestions: report.metrics.total_suggestions
      });

      return report;

    } catch (error) {
      logger.error('Scan failed', { error });
      throw new ScanError('Pipeline failed', { cause: error });
    }
  }
}
```

## Data Flow Diagram

### High-Level Flow

```
┌──────────────┐
│  Repository  │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ Repository Scanner   │
│ (repomix)            │
│                      │
│ Output:              │
│ - RepositoryInfo     │
│ - FileMetadata[]     │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Pattern Detector     │
│ (ast-grep)           │
│                      │
│ Output:              │
│ - PatternMatch[]     │
│ - Statistics         │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Code Block Extractor │
│ (pydantic)           │
│                      │
│ Output:              │
│ - CodeBlock[]        │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Semantic Annotator   │
│ (CodePattern vocab)  │
│                      │
│ Output:              │
│ - Annotated blocks   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Duplicate Grouper    │
│ (similarity algo)    │
│                      │
│ Output:              │
│ - DuplicateGroup[]   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Suggestion Generator │
│ (business logic)     │
│                      │
│ Output:              │
│ - Suggestion[]       │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Report Generator     │
│ (pydantic + export)  │
│                      │
│ Output:              │
│ - ScanReport         │
│ - JSON / HTML        │
└──────────────────────┘
```

### Detailed Data Structures

```
RepositoryInfo {
  path: string
  name: string
  total_files: int
  total_lines: int
  languages: string[]
}
        ↓
PatternMatch {
  rule_id: string
  file_path: string
  line_start: int
  matched_text: string
  ast_node: ASTNode
}
        ↓
CodeBlock {
  block_id: string
  pattern_id: string
  source_code: string
  location: SourceLocation
  language: string
  category: string
  ast_hash: string
}
        ↓
CodeBlock (annotated) {
  ... +
  subcategory: string
  tags: string[]
  semantic_metadata: dict
}
        ↓
DuplicateGroup {
  group_id: string
  member_block_ids: string[]
  similarity_score: float
  occurrence_count: int
  impact_score: float
}
        ↓
ConsolidationSuggestion {
  suggestion_id: string
  duplicate_group_id: string
  strategy: ConsolidationStrategy
  impact_score: float
  migration_steps: MigrationStep[]
  roi_score: float
}
        ↓
ScanReport {
  report_id: string
  repositories: RepositoryInfo[]
  metrics: ScanMetrics
  suggestions: string[]  # IDs
  executive_summary: string
}
```

## Error Handling Strategy

### Error Categories

| Category | Severity | Handling Strategy |
|----------|----------|-------------------|
| **Repository Access** | High | Fail fast, log, skip repository |
| **Pattern Detection** | Medium | Continue with warnings, partial results |
| **Model Validation** | Medium | Skip invalid blocks, log issues |
| **Similarity Calculation** | Low | Use fallback algorithm, warn |
| **Report Generation** | High | Retry with backoff, alert on failure |

### Error Handling Implementation

```python
class ScanError(Exception):
    """Base exception for scan pipeline"""
    pass

class RepositoryScanError(ScanError):
    """Repository cannot be scanned"""
    pass

class PatternDetectionError(ScanError):
    """Pattern detection failed"""
    pass

class ReportGenerationError(ScanError):
    """Report generation failed"""
    pass
```

**Orchestrator error handling:**
```javascript
async scanRepository(repoPath, config) {
  try {
    // ... pipeline stages

  } catch (error) {
    if (error instanceof RepositoryScanError) {
      // Critical: cannot proceed
      logger.error('Repository scan failed, aborting', { error });
      throw error;

    } else if (error instanceof PatternDetectionError) {
      // Moderate: can continue with partial results
      logger.warn('Pattern detection failed, using partial results', { error });
      // Generate report with what we have

    } else if (error instanceof ReportGenerationError) {
      // Retry with backoff
      logger.warn('Report generation failed, retrying', { error });
      await this.retryReportGeneration(scanData);

    } else {
      // Unknown error
      logger.error('Unknown error in pipeline', { error });
      throw new ScanError('Pipeline failed', { cause: error });
    }
  }
}
```

### Retry Logic

```javascript
class RetryPolicy {
  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async execute(fn) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, { error });
          await sleep(delay);
        }
      }
    }

    throw new Error('Max retries exceeded', { cause: lastError });
  }
}
```

## Performance Considerations

### Scalability

**Horizontal Scaling:**
- Run multiple scan workers in parallel
- Each worker processes one repository
- Coordinate with job queue (SidequestServer)

**Vertical Scaling:**
- Increase worker thread pool size
- Allocate more memory for large repositories
- Use streaming for large file processing

### Bottlenecks

| Stage | Bottleneck | Mitigation |
|-------|------------|------------|
| **Repository Scan** | Large repos (>10K files) | Incremental scanning, caching |
| **Pattern Detection** | Complex ast-grep rules | Optimize rules, filter files |
| **Duplicate Grouping** | O(n²) comparisons | Hash-based pre-grouping, similarity index |
| **Report Generation** | Large result sets | Streaming output, pagination |

### Optimization Strategies

**1. Incremental Scanning**
```javascript
// Only scan files changed since last scan
const lastScanCommit = await cache.get('last_scan_commit');
const changedFiles = await git.diff(lastScanCommit, 'HEAD');

// Only run ast-grep on changed files
const patterns = await patternDetector.detectPatterns(repoPath, {
  file_filter: { include_patterns: changedFiles }
});
```

**2. Parallel Processing**
```javascript
// Process code blocks in parallel
const annotatedBlocks = await Promise.all(
  codeBlocks.map(block => semanticAnnotator.annotate(block))
);
```

**3. Similarity Index**
```python
# Build index for fast similarity lookups
class SimilarityIndex:
    def __init__(self):
        self.hash_index = {}  # content_hash -> block_ids
        self.category_index = {}  # category -> block_ids

    def add_block(self, block):
        # Index by content hash
        if block.content_hash not in self.hash_index:
            self.hash_index[block.content_hash] = []
        self.hash_index[block.content_hash].append(block.block_id)

        # Index by category
        if block.category not in self.category_index:
            self.category_index[block.category] = []
        self.category_index[block.category].append(block.block_id)

    def find_similar(self, block, threshold=0.8):
        # Fast lookup: same hash = exact duplicate
        exact = self.hash_index.get(block.content_hash, [])

        # Narrow search: same category
        candidates = self.category_index.get(block.category, [])

        # Filter by similarity threshold
        similar = []
        for candidate_id in candidates:
            if candidate_id == block.block_id:
                continue

            similarity = self.calculate_similarity(block, candidate_id)
            if similarity >= threshold:
                similar.append((candidate_id, similarity))

        return exact + [s[0] for s in similar]
```

## Deployment Architecture

### Development Environment

```
┌─────────────────────────────────────────┐
│          Developer Machine              │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ Scan CLI     │  │ Local Repos     │ │
│  │              │──│ /code/projects  │ │
│  └──────────────┘  └─────────────────┘ │
│                                         │
│  Output: ./scan-reports/                │
└─────────────────────────────────────────┘
```

### Production Environment (Nightly Scans)

```
┌─────────────────────────────────────────────────────────┐
│                    Cron Scheduler                       │
│                 (Runs at 2 AM daily)                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Job Queue                             │
│              (SidequestServer)                          │
│                                                         │
│  Queue: [repo1, repo2, repo3, ...]                     │
│  Max concurrent: 5                                      │
└────────┬──────────┬──────────┬──────────┬───────────────┘
         │          │          │          │
         ▼          ▼          ▼          ▼
    ┌────────┐┌────────┐┌────────┐┌────────┐
    │Worker 1││Worker 2││Worker 3││Worker 4│
    │        ││        ││        ││        │
    │Scan    ││Scan    ││Scan    ││Scan    │
    │Orch.   ││Orch.   ││Orch.   ││Orch.   │
    └────┬───┘└────┬───┘└────┬───┘└────┬───┘
         │         │         │         │
         └─────────┴─────────┴─────────┘
                     │
                     ▼
         ┌─────────────────────┐
         │  Report Storage     │
         │  /scan-reports/     │
         │  - JSON             │
         │  - HTML             │
         └─────────────────────┘
```

## Technology Stack

| Component | Technology | Justification |
|-----------|------------|---------------|
| **Repository Scanning** | repomix | Context aggregation, Git integration |
| **Pattern Detection** | ast-grep | AST-based, multi-language, fast |
| **Data Modeling** | pydantic v2 | Type safety, validation, serialization |
| **Semantic Vocabulary** | CodePattern (custom) | Fine-grained code annotation |
| **Pipeline Orchestration** | Node.js + JavaScript | Async I/O, existing sidequest infrastructure |
| **Job Scheduling** | Cron + SidequestServer | Proven solution, already in use |
| **Logging** | Pino | Structured JSON logging |
| **Caching** | Redis (optional) | Fast lookups, distributed caching |
| **Reporting** | JSON + HTML templates | Structured data + human-readable |

## Next Steps (Phase 2 Implementation)

1. **Implement Core Components**
   - RepositoryScanner (JavaScript)
   - AstGrepPatternDetector (JavaScript)
   - CodeBlockExtractor (Python)
   - SemanticAnnotator (Python)

2. **Create Data Pipeline**
   - ScanOrchestrator integration
   - Error handling and logging
   - Progress tracking

3. **Build Similarity Engine**
   - DuplicateGrouper implementation
   - Similarity algorithms (hash, structural, semantic)
   - Performance optimization with indexing

4. **Generate Suggestions**
   - SuggestionGenerator with decision tree
   - Migration step generation
   - ROI calculation

5. **Report Generation**
   - ReportGenerator with templates
   - JSON export
   - HTML dashboard

6. **Test and Validate**
   - Unit tests for each component
   - Integration tests for pipeline
   - Performance benchmarks

---

**Architecture designed by:** Claude Code
**Next task:** Phase 1, Task 6 - Design duplicate detection algorithm (similarity thresholds and matching criteria)
