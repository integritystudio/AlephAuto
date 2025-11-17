# Phase 1, Task 3: Schema.org Semantic Metadata Research

**Date:** 2025-11-11
**Task:** Research and design: Determine how schema-org can annotate code blocks with semantic metadata
**Status:** ✅ Complete

## Executive Summary

Schema.org's `SoftwareSourceCode` type provides a foundation for describing source code, but it's designed for complete software artifacts (files, repositories) rather than individual code patterns. For our duplicate detection system, we need a **custom semantic vocabulary** that extends Schema.org concepts to annotate individual code blocks with rich metadata about their purpose, behavior, and consolidation potential.

**Key Finding:** Use Schema.org as inspiration and alignment, but create a custom CodePattern vocabulary tailored for code consolidation analysis.

## Schema.org Analysis

### SoftwareSourceCode Type

**Definition:** "Computer programming source code. Example: Full (compile ready) solutions, code snippet samples, scripts, templates."

**Type Hierarchy:**
```
Thing
  └── CreativeWork
        └── SoftwareSourceCode
```

**Core Properties:**

| Property | Type | Description | Applicability to Code Blocks |
|----------|------|-------------|------------------------------|
| `codeRepository` | URL | Link to repository | ✅ Useful for context |
| `codeSampleType` | Text | Type of code sample | ⚠️ Too broad for our needs |
| `programmingLanguage` | Text/ComputerLanguage | Programming language | ✅ Essential |
| `runtimePlatform` | Text | Runtime dependencies | ⚠️ Limited use |
| `targetProduct` | SoftwareApplication | Target product | ❌ Not applicable |

**Inherited from CreativeWork:**

| Property | Type | Applicability |
|----------|------|---------------|
| `author` | Person/Organization | ✅ Could track code authors |
| `dateCreated` | Date | ✅ When block was written |
| `dateModified` | Date | ✅ Last modification |
| `description` | Text | ✅ What the code does |
| `keywords` | Text | ✅ Semantic tags |
| `license` | Text/URL | ⚠️ Repository-level |
| `version` | Text | ⚠️ Repository-level |

### CodeMeta Extension

**CodeMeta** extends Schema.org with software-specific properties (62 total properties):

**Relevant for Code Blocks:**
- `buildInstructions` - Could document usage
- `developmentStatus` - Maturity indicator
- `hasSourceCode` / `isSourceCodeOf` - Relationships
- `issueTracker` - Link to related issues
- `readme` - Documentation

**Not Relevant:**
- Repository-level metadata (CI, funding, etc.)
- Package management properties
- Build/deployment properties

### Limitations for Our Use Case

❌ **Schema.org is designed for:**
- Complete software repositories
- Published software packages
- Full source code files
- Discoverable software artifacts

❌ **We need to describe:**
- Individual code blocks/patterns (3-50 lines)
- Semantic function (utility, validator, handler, etc.)
- Structural characteristics (AST patterns)
- Consolidation potential
- Similarity relationships

**Conclusion:** Schema.org provides concepts but insufficient granularity for code pattern annotation.

## Custom Semantic Vocabulary Design

### CodePattern Vocabulary

We'll create a **CodePattern** vocabulary that:
1. Aligns with Schema.org principles (type hierarchy, property structure)
2. Extends concepts for code pattern-level granularity
3. Supports consolidation analysis
4. Integrates with Pydantic models

### Type Hierarchy

```
CodePattern (root concept)
  ├── UtilityPattern
  │   ├── DataTransformation
  │   ├── TypeChecking
  │   ├── Validation
  │   └── FormatConversion
  ├── APIPattern
  │   ├── RouteHandler
  │   ├── AuthenticationCheck
  │   ├── ErrorResponse
  │   └── RequestValidation
  ├── DatabasePattern
  │   ├── QueryOperation
  │   ├── ConnectionManagement
  │   ├── TransactionPattern
  │   └── ORMOperation
  ├── AsyncPattern
  │   ├── PromiseChain
  │   ├── AsyncAwait
  │   ├── ErrorHandling
  │   └── Callback
  ├── ConfigurationPattern
  │   ├── EnvironmentAccess
  │   ├── ConfigObject
  │   ├── FeatureFlag
  │   └── ConstantDefinition
  └── LoggingPattern
      ├── StructuredLogging
      ├── ErrorLogging
      ├── DebugLogging
      └── AuditLogging
```

### Core Properties

#### Identification Properties

```json
{
  "@type": "CodePattern",
  "patternId": "utility-json-stringify",
  "name": "JSON Stringify Helper",
  "description": "Converts objects to formatted JSON strings",
  "category": "UtilityPattern",
  "subcategory": "FormatConversion"
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `patternId` | Identifier | ✅ | Unique pattern identifier |
| `name` | Text | ✅ | Human-readable name |
| `description` | Text | ✅ | What the pattern does |
| `category` | CodePatternType | ✅ | Primary categorization |
| `subcategory` | Text | ⚠️ | Fine-grained classification |

#### Technical Properties

```json
{
  "programmingLanguage": "JavaScript",
  "languageVersion": "ES2022",
  "framework": ["Node.js", "Express"],
  "dependencies": ["fs", "path"],
  "codeComplexity": "simple",
  "lineCount": 3
}
```

| Property | Type | Description |
|----------|------|-------------|
| `programmingLanguage` | Text | Language (JS, TS, Python, etc.) |
| `languageVersion` | Text | Language version/standard |
| `framework` | Text[] | Associated frameworks |
| `dependencies` | Text[] | Required imports/modules |
| `codeComplexity` | Complexity | trivial/simple/moderate/complex |
| `lineCount` | Integer | Number of lines |

#### Structural Properties

```json
{
  "astPattern": "CallExpression",
  "structuralHash": "a3f2e8d1c4b5",
  "contentHash": "9f8e7d6c5b4a",
  "syntacticFeatures": ["async", "try-catch", "arrow-function"]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `astPattern` | Text | Primary AST node type |
| `structuralHash` | Text | Hash of AST structure |
| `contentHash` | Text | Hash of code content |
| `syntacticFeatures` | Text[] | Language features used |

#### Semantic Properties

```json
{
  "purpose": "Transform data for output",
  "behavior": "Converts JavaScript object to JSON string with formatting",
  "sideEffects": false,
  "purity": "pure",
  "semanticTags": ["serialization", "formatting", "json", "output"]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `purpose` | Text | Why this code exists |
| `behavior` | Text | What the code does |
| `sideEffects` | Boolean | Has side effects? |
| `purity` | Purity | pure/impure/mixed |
| `semanticTags` | Text[] | Descriptive keywords |

#### Location Properties

```json
{
  "sourceFile": "/path/to/file.js",
  "lineStart": 42,
  "lineEnd": 44,
  "codeRepository": "https://github.com/user/repo",
  "projectContext": "sidequest"
}
```

| Property | Type | Description |
|----------|------|-------------|
| `sourceFile` | Path | File containing code |
| `lineStart` | Integer | Starting line number |
| `lineEnd` | Integer | Ending line number |
| `codeRepository` | URL | Git repository |
| `projectContext` | Text | Project/module name |

#### Relationship Properties

```json
{
  "similarTo": ["pattern-001", "pattern-042"],
  "duplicateOf": "pattern-canonical-123",
  "usedBy": ["file1.js:10", "file2.js:25"],
  "uses": ["path.join", "JSON.stringify"]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `similarTo` | Identifier[] | Similar pattern IDs |
| `duplicateOf` | Identifier | Canonical pattern ID |
| `usedBy` | Reference[] | Where pattern appears |
| `uses` | Text[] | Functions/APIs called |

#### Consolidation Properties

```json
{
  "consolidationPotential": "high",
  "consolidationTier": "local-utility",
  "consolidationComplexity": "trivial",
  "migrationRisk": "low",
  "estimatedImpact": 75
}
```

| Property | Type | Description |
|----------|------|-------------|
| `consolidationPotential` | Potential | minimal/low/medium/high/critical |
| `consolidationTier` | Tier | local/shared/mcp/agent/none |
| `consolidationComplexity` | Complexity | trivial/simple/moderate/complex |
| `migrationRisk` | Risk | minimal/low/medium/high/critical |
| `estimatedImpact` | Integer | Impact score 0-100 |

### Enumerations

#### CodePatternType

```
UtilityPattern
  - DataTransformation
  - TypeChecking
  - Validation
  - FormatConversion
  - StringManipulation
  - ArrayOperation
  - ObjectOperation

APIPattern
  - RouteHandler
  - Middleware
  - AuthenticationCheck
  - AuthorizationCheck
  - ErrorResponse
  - RequestValidation
  - ResponseFormatter

DatabasePattern
  - QueryOperation
  - ConnectionManagement
  - TransactionPattern
  - ORMOperation
  - Migration
  - Seeding

AsyncPattern
  - PromiseChain
  - AsyncAwait
  - ErrorHandling
  - Callback
  - EventEmitter
  - StreamProcessing

ConfigurationPattern
  - EnvironmentAccess
  - ConfigObject
  - FeatureFlag
  - ConstantDefinition
  - SecretManagement

LoggingPattern
  - StructuredLogging
  - ErrorLogging
  - DebugLogging
  - AuditLogging
  - PerformanceLogging
```

#### Complexity

```
trivial    - < 5 lines, no control flow
simple     - 5-15 lines, basic control flow
moderate   - 15-50 lines, some complexity
complex    - 50+ lines or high cyclomatic complexity
```

#### Purity

```
pure      - No side effects, deterministic
impure    - Has side effects (I/O, state mutation)
mixed     - Some pure, some impure logic
```

#### ConsolidationTier

```
local-utility       - Utility within single project
shared-package      - Shared library across 2-3+ projects
mcp-server          - MCP server for cross-language/tool
autonomous-agent    - Complex orchestration requiring AI
no-action          - Not worth consolidating
```

## Semantic Categorization Strategy

### Auto-Categorization Rules

Use **pattern matching + heuristics** to auto-assign categories:

#### Rule-Based Classification

```python
categorization_rules = {
    # Utility patterns
    'array-map-filter': 'UtilityPattern/ArrayOperation',
    'object-manipulation': 'UtilityPattern/ObjectOperation',
    'string-manipulation': 'UtilityPattern/StringManipulation',
    'type-checking': 'UtilityPattern/TypeChecking',
    'validation': 'UtilityPattern/Validation',

    # API patterns
    'express-route-handlers': 'APIPattern/RouteHandler',
    'auth-checks': 'APIPattern/AuthenticationCheck',
    'error-responses': 'APIPattern/ErrorResponse',
    'request-validation': 'APIPattern/RequestValidation',

    # Database patterns
    'prisma-operations': 'DatabasePattern/ORMOperation',
    'query-builders': 'DatabasePattern/QueryOperation',
    'connection-handling': 'DatabasePattern/ConnectionManagement',

    # Async patterns
    'await-patterns': 'AsyncPattern/AsyncAwait',
    'promise-chains': 'AsyncPattern/PromiseChain',

    # Config patterns
    'env-variables': 'ConfigurationPattern/EnvironmentAccess',
    'config-objects': 'ConfigurationPattern/ConfigObject',

    # Logging patterns
    'console-statements': 'LoggingPattern/ErrorLogging',
    'logger-patterns': 'LoggingPattern/StructuredLogging',
}
```

#### Heuristic Classification

```python
def classify_by_heuristics(code_block):
    """
    Classify code block using AST and content heuristics
    """
    # Check function calls
    if calls('JSON.stringify'):
        return 'UtilityPattern/FormatConversion'

    if calls('app.get', 'app.post', 'router.get'):
        return 'APIPattern/RouteHandler'

    if calls('prisma.*.find*', 'prisma.*.create'):
        return 'DatabasePattern/ORMOperation'

    # Check patterns
    if has_pattern('try { $$$ } catch'):
        return 'AsyncPattern/ErrorHandling'

    if has_pattern('if (!$VAR) { throw'):
        return 'UtilityPattern/Validation'

    # Check keywords
    if has_keywords('auth', 'token', 'bearer'):
        return 'APIPattern/AuthenticationCheck'

    return 'Unknown'
```

### Manual Refinement

Support manual category assignment with confidence scores:

```json
{
  "category": "UtilityPattern",
  "subcategory": "DataTransformation",
  "categoryConfidence": 0.85,
  "manuallyClassified": false,
  "alternativeCategories": [
    {"category": "UtilityPattern/FormatConversion", "confidence": 0.65}
  ]
}
```

## Annotation Schema Design

### JSON-LD Format

Use **JSON-LD** for structured, machine-readable annotations:

```json
{
  "@context": {
    "@vocab": "https://codepattern.org/",
    "schema": "https://schema.org/"
  },
  "@type": "CodePattern",
  "@id": "pattern:cb_12345",

  "name": "JSON Stringify Helper",
  "description": "Converts objects to formatted JSON with 2-space indentation",
  "category": "UtilityPattern",
  "subcategory": "FormatConversion",

  "programmingLanguage": "JavaScript",
  "framework": ["Node.js"],
  "lineCount": 1,
  "codeComplexity": "trivial",

  "sourceCode": "JSON.stringify(data, null, 2)",
  "sourceFile": "/sidequest/utils.js",
  "lineStart": 42,
  "lineEnd": 42,

  "astPattern": "CallExpression",
  "structuralHash": "a3f2e8d1",
  "contentHash": "9f8e7d6c",

  "purpose": "Format data for output or storage",
  "behavior": "Serializes JavaScript object to JSON string with formatting",
  "sideEffects": false,
  "purity": "pure",
  "semanticTags": ["serialization", "json", "formatting", "output"],

  "similarTo": ["pattern:cb_12346", "pattern:cb_12347"],
  "usedBy": [
    "/sidequest/file1.js:100",
    "/sidequest/file2.js:250"
  ],

  "consolidationPotential": "high",
  "consolidationTier": "local-utility",
  "consolidationComplexity": "trivial",
  "migrationRisk": "low",
  "estimatedImpact": 75,

  "detectedAt": "2025-11-11T19:00:00Z",
  "detectionMethod": "ast-grep:object-manipulation"
}
```

### Integration with Pydantic Models

Map CodePattern vocabulary to our existing Pydantic models:

```python
# CodeBlock model already has these fields:
class CodeBlock(BaseModel):
    # Maps to CodePattern properties
    block_id: str                    # → @id
    pattern_id: str                  # → detectionMethod
    source_code: str                 # → sourceCode
    language: LanguageType           # → programmingLanguage
    category: SemanticCategory       # → category
    tags: List[str]                  # → semanticTags

    # Location
    location: SourceLocation         # → sourceFile, lineStart, lineEnd
    repository_path: str             # → codeRepository

    # Structure
    ast_structure: ASTNode           # → astPattern (root type)
    ast_hash: str                    # → structuralHash
    content_hash: str               # → computed

    # Metadata
    line_count: int                  # → lineCount
    complexity_score: float          # → codeComplexity
```

**Extension needed:**

```python
class CodeBlockAnnotation(BaseModel):
    """Extended semantic annotations using CodePattern vocabulary"""

    # Semantic properties
    purpose: str                     # Why code exists
    behavior: str                    # What it does
    has_side_effects: bool           # Purity indicator
    purity: Purity                   # pure/impure/mixed

    # Consolidation metadata
    consolidation_potential: ConsolidationPotential
    estimated_impact: int            # 0-100

    # Relationships
    similar_pattern_ids: List[str]
    canonical_pattern_id: Optional[str]
    usage_locations: List[str]
    api_calls: List[str]             # Functions/APIs used
```

## Mapping: ast-grep Rules → CodePattern Types

### Direct Mappings

| ast-grep Rule | CodePattern Type | Subcategory |
|---------------|------------------|-------------|
| `array-map-filter` | UtilityPattern | ArrayOperation |
| `object-manipulation` | UtilityPattern | ObjectOperation |
| `string-manipulation` | UtilityPattern | StringManipulation |
| `type-checking` | UtilityPattern | TypeChecking |
| `validation` | UtilityPattern | Validation |
| `express-route-handlers` | APIPattern | RouteHandler |
| `auth-checks` | APIPattern | AuthenticationCheck |
| `error-responses` | APIPattern | ErrorResponse |
| `request-validation` | APIPattern | RequestValidation |
| `prisma-operations` | DatabasePattern | ORMOperation |
| `query-builders` | DatabasePattern | QueryOperation |
| `connection-handling` | DatabasePattern | ConnectionManagement |
| `await-patterns` | AsyncPattern | AsyncAwait |
| `promise-chains` | AsyncPattern | PromiseChain |
| `env-variables` | ConfigurationPattern | EnvironmentAccess |
| `config-objects` | ConfigurationPattern | ConfigObject |
| `console-statements` | LoggingPattern | ErrorLogging |
| `logger-patterns` | LoggingPattern | StructuredLogging |

### Mapping Configuration

```yaml
# pattern-category-mapping.yml
rules:
  utilities:
    array-map-filter:
      category: UtilityPattern
      subcategory: ArrayOperation
      purpose: "Iterate and transform array elements"
      typical_impact: medium

    object-manipulation:
      category: UtilityPattern
      subcategory: ObjectOperation
      purpose: "Manipulate object structure or content"
      typical_impact: medium

  api:
    express-route-handlers:
      category: APIPattern
      subcategory: RouteHandler
      purpose: "Handle HTTP requests and responses"
      typical_impact: high

  # ... etc
```

## Benefits of Semantic Annotation

### 1. Improved Pattern Discovery

**Before:** "Found 50 code blocks"
**After:** "Found 15 UtilityPatterns, 12 APIPatterns, 8 DatabasePatterns..."

### 2. Smarter Consolidation Recommendations

```
High-priority consolidations:
- 5 UtilityPattern/FormatConversion blocks → create formatJson() utility
- 8 APIPattern/ErrorResponse blocks → create standardErrorResponse() helper
- 3 DatabasePattern/ORMOperation blocks → refactor to repository pattern
```

### 3. Better Similarity Matching

Match patterns by semantic category, not just structure:

```python
# Semantic-aware similarity
def calculate_similarity(block1, block2):
    similarity = 0.0

    # Category match bonus
    if block1.category == block2.category:
        similarity += 0.3

        # Subcategory match
        if block1.subcategory == block2.subcategory:
            similarity += 0.2

    # Structural similarity
    if block1.structural_hash == block2.structural_hash:
        similarity += 0.3

    # Semantic tag overlap
    tag_overlap = len(set(block1.tags) & set(block2.tags))
    similarity += (tag_overlap / max(len(block1.tags), len(block2.tags))) * 0.2

    return min(similarity, 1.0)
```

### 4. Rich Reporting

Generate insights like:

```
Your codebase contains:
- 45% UtilityPatterns (high consolidation potential)
- 25% APIPatterns (moderate standardization needed)
- 20% DatabasePatterns (consider repository pattern)
- 10% Other patterns

Top recommendation: Create utility library for 15 FormatConversion patterns
```

### 5. Machine Learning Ready

Semantic annotations enable:
- Training models to auto-classify patterns
- Predicting consolidation success
- Recommending abstraction strategies
- Identifying anti-patterns

## Implementation Strategy

### Phase 1: Basic Categorization

1. Map ast-grep rules to CodePattern types (✅ designed above)
2. Auto-assign categories when creating CodeBlocks
3. Add semantic tags based on pattern type

### Phase 2: Rich Annotations

1. Extend CodeBlock with semantic properties
2. Extract purpose/behavior from code comments
3. Calculate purity and side-effects from AST
4. Identify API calls and dependencies

### Phase 3: Relationship Mapping

1. Build similarity graph between patterns
2. Identify canonical patterns
3. Track usage locations
4. Map dependencies

### Phase 4: Advanced Analytics

1. Train ML classifier for auto-categorization
2. Generate consolidation recommendations by category
3. Create semantic dashboards
4. Enable natural language queries ("Show me all validation utilities")

## Recommendations

### For Phase 2 Implementation

1. **Start Simple**
   - Use direct ast-grep rule → category mapping
   - Add basic semantic tags
   - Focus on accurate categorization

2. **Iterate and Refine**
   - Collect false positives/negatives
   - Refine categorization rules
   - Add manual override capability

3. **Build on Schema.org**
   - Use JSON-LD format for annotations
   - Align with Schema.org principles
   - Enable future interoperability

4. **Extend Pydantic Models**
   - Add `CodeBlockAnnotation` model
   - Include purpose, behavior, purity
   - Link to consolidation metadata

5. **Create Mapping Config**
   - YAML config for rule → category mapping
   - Easy to update without code changes
   - Version controlled

## Conclusion

**Schema.org provides inspiration** but is insufficient for code pattern-level annotation. Our **custom CodePattern vocabulary** extends Schema.org concepts with:

✅ **Fine-grained categories** - 6 major types, 30+ subcategories
✅ **Rich properties** - 40+ metadata fields
✅ **Consolidation-focused** - Purpose-built for duplicate detection
✅ **Integration-ready** - Maps to existing Pydantic models
✅ **Extensible** - Easy to add new categories and properties

**Next Steps:**
- Implement category mapping in Phase 2
- Extend CodeBlock with semantic annotations
- Create auto-categorization engine
- Generate semantic reports

---

**Research conducted by:** Claude Code
**Next task:** Phase 2, Task 1 - Create pydantic models for CodeBlock, DuplicateGroup, and ConsolidationSuggestion (already complete!)
