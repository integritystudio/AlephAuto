# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository contains four automation pipelines built on the **AlephAuto** job queue framework:

1. **Code Consolidation System** - Automated duplicate code detection using ast-grep, pydantic, and multi-layer similarity algorithms
2. **Documentation Enhancement Pipeline** - Automated Schema.org structured data injection for README files
3. **Git Activity Reporter** - Automated weekly/monthly git activity reports with visualizations
4. **Gitignore Manager** - Batch `.gitignore` updates across all git repositories

All systems use the AlephAuto job queue framework with Sentry error logging, centralized configuration, and event-driven architecture.

## ⚠️ Critical Information

**Before making changes, be aware of these critical patterns:**

1. **Field Name:** CodeBlock uses `tags` field, NOT `semantic_tags` (lib/extractors/extract_blocks.py:231)
2. **Backward Search:** Function extraction searches BACKWARDS to find closest function (extract_blocks.py:80-98)
3. **Function-Based Deduplication:** Deduplicates by `file:function_name`, not `file:line` (extract_blocks.py:108-163)
4. **Two-Phase Similarity:** Extract semantic features BEFORE normalization (structural.py:29-93, 422-482)
5. **Configuration:** Always use `import { config } from './sidequest/config.js'`, NEVER `process.env` directly
6. **Doppler Required:** All commands must run with `doppler run --` for environment variables
7. **Accuracy Status:** Recall ✅ 87.50% (target: 80%), Precision ⚠️ 77.78% (target: 90%, gap: -12.22%)

## Authentication & Configuration

**All commands must be run with Doppler** for environment variable management:

```bash
doppler run -- <command>
```

### Configuration Access

**Never use `process.env` directly** in application code. Always import from the centralized config:

```javascript
import { config } from './sidequest/config.js';

// ✅ Correct
const dsn = config.sentryDsn;

// ❌ Incorrect
const dsn = process.env.SENTRY_DSN;
```

## Key Commands

### Development

```bash
# Start systems
npm start                    # Repomix cron server
npm run dev                  # Development mode with auto-restart
doppler run -- npm start     # With environment variables

# Documentation enhancement
npm run docs:enhance         # Enhance Inventory directory
npm run docs:enhance:dry     # Dry run (no modifications)
npm run docs:test README.md  # Test single README file

# Git activity reports (AlephAuto integrated)
npm run git:weekly           # Weekly report (last 7 days)
npm run git:monthly          # Monthly report (last 30 days)
npm run git:schedule         # Start scheduled mode (Sunday 8 PM)
RUN_ON_STARTUP=true npm run git:weekly  # Run immediately

# Gitignore manager
node sidequest/gitignore-repomix-updater.js ~/code --dry-run  # Preview changes
node sidequest/gitignore-repomix-updater.js ~/code            # Apply changes
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:scanner         # Directory scanner tests
npm run test:single          # Single job tests
npm run test:api             # REST API tests (16 tests)
npm run test:websocket       # WebSocket tests (15 tests)
npm run test:caching         # Caching tests (23 tests, requires Redis)
npm run test:mcp             # MCP server tests (11 tests)
node --test test/directory-scanner.test.js  # Individual test file

# Duplicate detection accuracy tests
node test/accuracy/accuracy-test.js                    # Run accuracy tests
node test/accuracy/accuracy-test.js --verbose          # Detailed output
node test/accuracy/accuracy-test.js --save-results     # Save results to JSON
```

**Current Test Coverage:**
- Total Tests: 132 (up from 67)
- Passing: 127 (96.2%)
- New: REST API, WebSocket, Caching, MCP integration tests

### Code Consolidation System

```bash
# Run duplicate detection scan
doppler run -- node lib/scan-orchestrator.js <repo-path>

# Inter-project duplicate detection
doppler run -- node test-inter-project-scan.js  # Scan across multiple repos

# Run automated pipeline (Phase 3 - Production Ready)
doppler run -- node duplicate-detection-pipeline.js                   # Start with cron (2 AM daily)
doppler run -- RUN_ON_STARTUP=true node duplicate-detection-pipeline.js  # Run immediately
doppler run -- pm2 start duplicate-detection-pipeline.js --name duplicate-scanner  # Production

# Run with Python virtual environment
doppler run -- venv/bin/python3 lib/extractors/extract_blocks.py < input.json

# Test ast-grep patterns
ast-grep scan -r .ast-grep/rules/ <directory>
ast-grep scan -r .ast-grep/rules/utilities/ src/
```

### Type Checking

```bash
npm run typecheck    # Run TypeScript type checking (no emit)
```

### REST API & WebSocket Server

**Production-ready duplicate detection API:**

```bash
# Start API server (default port 3000)
doppler run -- node duplicate-detection-pipeline.js

# Test API endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/scan -X POST -H "Content-Type: application/json" -d '{"repositoryPath": "/path/to/repo"}'

# WebSocket connection for real-time updates
wscat -c ws://localhost:3000
```

**API Endpoints:**
- `GET /health` - Health check
- `GET /api/status` - System status
- `POST /api/scan` - Trigger repository scan
- `GET /api/scan/:scanId` - Get scan results
- `GET /api/scans` - List all scans
- `WebSocket /` - Real-time scan updates

**Testing:**
```bash
# Run API tests
npm run test:api

# Test WebSocket
npm run test:websocket

# Test caching layer
npm run test:caching  # Requires Redis MCP
```

## Architecture

### Code Consolidation System

**Pipeline Architecture (7 stages):**

```
Stage 1-2 (JavaScript):
  Repository Scanner → AST-Grep Detector
       ↓
  JSON via stdin/stdout
       ↓
Stage 3-7 (Python):
  Block Extraction → Semantic Annotation → Duplicate Grouping →
  Suggestion Generation → Report Generation
```

**Key Components:**

- **`lib/scan-orchestrator.js`** - Coordinates entire pipeline, bridges JavaScript/Python
- **`lib/scanners/repository-scanner.js`** - Repository validation, Git info, repomix integration
- **`lib/scanners/ast-grep-detector.js`** - Pattern detection using ast-grep
- **`lib/extractors/extract_blocks.py`** - Python pipeline (stages 3-7)
- **`lib/similarity/`** - Multi-layer similarity algorithm (exact, structural, semantic)
- **`lib/models/`** - Pydantic data models (CodeBlock, DuplicateGroup, etc.)
- **`.ast-grep/rules/`** - 18 pattern detection rules across 6 categories

**Multi-Layer Similarity Algorithm:**

1. **Layer 1 (Exact):** Hash-based exact matching - O(1)
2. **Layer 2 (Structural):** AST normalization + Levenshtein - O(n*k)
3. **Layer 3 (Semantic):** Category + tag overlap - TODO

**Pattern Categories:**

```
.ast-grep/rules/
├── utilities/        (5 rules)  - array, object, string, type-checking, validation
├── api/              (4 rules)  - routes, auth, errors, request-validation
├── database/         (3 rules)  - Prisma, queries, connections
├── config/           (2 rules)  - env variables, config objects
├── async/            (2 rules)  - await patterns, promise chains
└── logging/          (2 rules)  - console, logger patterns
```

### AlephAuto Job Queue Framework

**Architecture Pattern:**

```
┌─────────────────────────────────────┐
│     SidequestServer (Base)          │
│  - Job queue management             │
│  - Concurrency control              │
│  - Event emission                   │
│  - Sentry integration               │
└─────────────────────────────────────┘
              ▲
              │ extends
    ┌─────────┴──────────┬──────────────┬──────────────┐
    │                    │              │              │
┌───────────────┐  ┌─────────────────────┐  ┌────────────────┐  ┌────────────────┐
│ RepomixWorker │  │ SchemaEnhancement   │  │ GitActivity    │  │ Gitignore      │
│               │  │ Worker              │  │ Worker         │  │ Manager        │
└───────────────┘  └─────────────────────┘  └────────────────┘  └────────────────┘
```

**Core Components:**

- **`sidequest/server.js`** - Base job execution engine with event-driven lifecycle
- **`sidequest/config.js`** - Centralized configuration (ALWAYS use this, never `process.env`)
- **`sidequest/logger.js`** - Sentry-integrated logging with component-specific loggers
- **`sidequest/repomix-worker.js`** - Repomix job executor
- **`sidequest/git-activity-worker.js`** - Git activity report job executor
- **`sidequest/doc-enhancement/schema-enhancement-worker.js`** - Documentation enhancement worker
- **`sidequest/gitignore-repomix-updater.js`** - Batch gitignore management

### Job Management Pattern

**Core Pattern:**

```javascript
import { SidequestServer } from './sidequest/server.js';

class MyWorker extends SidequestServer {
  constructor(options) {
    super({
      maxConcurrent: 3,
      ...options
    });
  }

  async processJob(jobData) {
    // Job implementation
    return result;
  }
}

// Job lifecycle events
worker.on('job:created', (job) => { /* ... */ });
worker.on('job:started', (job) => { /* ... */ });
worker.on('job:completed', (job) => { /* ... */ });
worker.on('job:failed', (job) => { /* ... */ });
```

## Data Models (Pydantic)

### CodeBlock

```python
class CodeBlock(BaseModel):
    block_id: str
    pattern_id: str  # ast-grep rule ID
    location: SourceLocation
    relative_path: str
    source_code: str
    language: str
    category: SemanticCategory  # utility, api_handler, database_operation, etc.
    tags: List[str] = []  # e.g., ["function:getUserNames"] - CRITICAL: Use 'tags' not 'semantic_tags'
    line_count: int
    content_hash: str  # For exact matching
```

### DuplicateGroup

```python
class DuplicateGroup(BaseModel):
    group_id: str
    pattern_id: str
    member_block_ids: List[str]
    similarity_score: float  # 0.0-1.0
    similarity_method: SimilarityMethod  # exact_match, structural, semantic, hybrid
    category: SemanticCategory
    occurrence_count: int
    total_lines: int
    affected_files: List[str]
    impact_score: float  # 0-100
```

### ConsolidationSuggestion

```python
class ConsolidationSuggestion(BaseModel):
    suggestion_id: str
    duplicate_group_id: str
    strategy: ConsolidationStrategy  # local_util, shared_package, mcp_server, autonomous_agent
    strategy_rationale: str
    target_location: str
    migration_steps: List[MigrationStep]
    code_example: str
    complexity: ComplexityLevel  # trivial, simple, moderate, complex
    migration_risk: RiskLevel    # minimal, low, medium, high
    estimated_effort_hours: float
    confidence: float  # 0.0-1.0
    roi_score: float   # 0-100
```

## Important Patterns

### Function Name Extraction

**CRITICAL:** Code blocks store function names in `tags` field (NOT `semantic_tags`):

```python
# In extract_blocks.py (lib/extractors/extract_blocks.py:231)
# ✅ CORRECT - Use 'tags' field
tags=[f"function:{function_name}"] if function_name else []

# ❌ INCORRECT - Do NOT use 'semantic_tags'
# semantic_tags=[f"function:{function_name}"]  # WRONG FIELD NAME

# Backward search algorithm to find closest function (lines 80-98)
# Prevents finding previous functions in file
for i in range(search_end - 1, search_start - 1, -1):
    if i < 0 or i >= len(lines):
        continue
    line = lines[i]
    for pattern in patterns:
        match = re.search(pattern, line)
        if match and match.group(1):
            return match.group(1)  # Return closest function name

# In accuracy tests (test/accuracy/accuracy-test.js:44)
# Check both fields for backward compatibility
const tags = block.tags || block.semantic_tags || [];
for (const tag of tags) {
  if (tag.startsWith('function:')) {
    const funcName = tag.substring('function:'.length);
    return funcName;
  }
}
```

### Deduplication

**Function-based deduplication** (lib/extractors/extract_blocks.py:108-163) - 48% reduction in false positives:

```python
# In extract_blocks.py - Stage 3.5
blocks = deduplicate_blocks(blocks)

def deduplicate_blocks(blocks):
    """
    Deduplicate by file:function_name instead of file:line_start
    Keeps only the earliest occurrence of each function
    """
    seen_functions = {}  # file:function -> earliest block
    seen_locations = set()
    unique_blocks = []

    for block in blocks:
        # Extract function name from tags
        function_name = None
        for tag in block.tags:
            if tag.startswith('function:'):
                function_name = tag[9:]  # Remove 'function:' prefix
                break

        # Strategy 1: Deduplicate by function name (preferred)
        if function_name:
            function_key = f"{block.location.file_path}:{function_name}"

            if function_key not in seen_functions:
                seen_functions[function_key] = block
                unique_blocks.append(block)
            else:
                # Keep earliest occurrence
                existing = seen_functions[function_key]
                if block.location.line_start < existing.location.line_start:
                    unique_blocks.remove(existing)
                    seen_functions[function_key] = block
                    unique_blocks.append(block)
        else:
            # Strategy 2: Fall back to line-based for blocks without function names
            location_key = f"{block.location.file_path}:{block.location.line_start}"
            if location_key not in seen_locations:
                seen_locations.add(location_key)
                unique_blocks.append(block)

    return unique_blocks
```

### Structural Similarity with Unified Penalty System

**Two-Phase Architecture** (lib/similarity/structural.py):

```python
def calculate_structural_similarity(code1, code2, threshold=0.90):
    # Layer 1: Exact hash match → 1.0
    if hash1 == hash2:
        return 1.0, 'exact'

    # ✅ PHASE 1: Extract semantic features from ORIGINAL code (BEFORE normalization)
    features1 = extract_semantic_features(code1)  # Lines 29-93
    features2 = extract_semantic_features(code2)
    # Extracts: HTTP status codes, logical operators, semantic methods

    # ✅ PHASE 2: Normalize and calculate base similarity
    normalized1 = normalize_code(code1)
    normalized2 = normalize_code(code2)
    base_similarity = calculate_levenshtein_similarity(normalized1, normalized2)

    # ✅ PHASE 3: Apply unified penalties using ORIGINAL features
    penalty = calculate_semantic_penalty(features1, features2)  # Lines 373-419
    final_similarity = base_similarity * penalty

    return final_similarity, 'structural' if final_similarity >= threshold else 'different'
```

**Semantic Feature Extraction** (lines 29-93):

```python
@dataclass
class SemanticFeatures:
    http_status_codes: Set[int]      # e.g., {200}, {201}, {404}
    logical_operators: Set[str]      # e.g., {'==='}, {'!=='}, {'!'}
    semantic_methods: Set[str]       # e.g., {'Math.max'}, {'Math.min'}

def extract_semantic_features(source_code: str) -> SemanticFeatures:
    """Extract features BEFORE normalization to preserve semantic information."""
    # HTTP: .status(200) → {200}
    # Operators: === vs !== vs ==
    # Methods: Math.max vs Math.min, .reverse, console.log
    return features
```

**Unified Penalty Calculation** (lines 373-419):

```python
def calculate_semantic_penalty(features1, features2) -> float:
    """Apply multiplicative penalties for semantic differences."""
    penalty = 1.0

    # HTTP status codes (200 vs 201): 0.70x (30% penalty)
    if features1.http_status_codes != features2.http_status_codes:
        penalty *= 0.70

    # Logical operators (=== vs !==): 0.80x (20% penalty)
    if features1.logical_operators != features2.logical_operators:
        penalty *= 0.80

    # Semantic methods (Math.max vs Math.min): 0.75x (25% penalty)
    if features1.semantic_methods != features2.semantic_methods:
        penalty *= 0.75

    return penalty  # Can compound: 0.70 * 0.80 * 0.75 = 0.42
```

**Code Normalization** (preserves important methods):

```python
def normalize_code(source_code):
    # Remove comments, whitespace
    # Replace strings → 'STR'
    # Replace numbers → 'NUM'

    # Preserve important method names (map, filter, reduce, forEach, etc.)
    important_methods = {
        'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
        'slice', 'splice', 'push', 'pop', 'shift', 'unshift',
        'join', 'split', 'includes', 'indexOf',
        'get', 'set', 'has', 'delete',
        'then', 'catch', 'finally', 'async', 'await',
        'length', 'keys', 'values', 'entries',
        'reverse', 'sort', 'concat'
    }

    # Mark important methods for preservation
    for method in important_methods:
        normalized = re.sub(rf'\b{method}\b', f'__PRESERVE_{method.upper()}__', normalized)

    # Replace other variables → 'var'
    normalized = re.sub(r'\b[a-z][a-zA-Z0-9_]*\b', 'var', normalized)

    # Restore preserved methods
    for method in important_methods:
        normalized = normalized.replace(f'__PRESERVE_{method.upper()}__', method)

    return normalized
```

## Directory Structure

```
.
├── lib/                           # Core consolidation system
│   ├── scanners/                  # Repository & pattern scanners (JS)
│   ├── extractors/                # Code block extraction (Python)
│   ├── similarity/                # Multi-layer similarity algorithm (Python)
│   ├── models/                    # Pydantic data models (Python)
│   ├── reports/                   # HTML/Markdown report generators (JS)
│   ├── scan-orchestrator.js       # Pipeline coordinator (JS)
│   └── inter-project-scanner.js   # Cross-repository analysis (JS)
├── .ast-grep/                     # Pattern detection rules
│   ├── rules/                     # 18 YAML rules across 6 categories
│   │   ├── utilities/
│   │   ├── api/
│   │   ├── database/
│   │   ├── config/
│   │   ├── async/
│   │   └── logging/
│   └── sgconfig.yml               # ast-grep configuration
├── git-activity-pipeline.js       # Git activity report server
├── sidequest/                     # AlephAuto job management framework
│   ├── server.js                  # Base sidequest server (job queue core)
│   ├── config.js                  # Centralized configuration
│   ├── logger.js                  # Sentry-integrated logging
│   ├── repomix-worker.js          # Repomix job worker
│   ├── git-activity-worker.js     # Git activity job worker
│   ├── gitignore-repomix-updater.js # Gitignore batch updater
│   ├── collect_git_activity.py    # Git activity data collection (Python)
│   ├── directory-scanner.js       # Directory scanning utility
│   └── doc-enhancement/           # Documentation enhancement
├── test/                          # Test suites
│   ├── accuracy/                  # Duplicate detection accuracy tests
│   │   ├── fixtures/              # Test repository with known duplicates
│   │   ├── expected-results.json  # Ground truth (16 groups, 41 functions)
│   │   ├── metrics.js             # Precision, recall, F1, FP rate
│   │   ├── accuracy-test.js       # Automated test harness
│   │   └── README.md              # Testing guide
│   └── *.test.js                  # Unit test suites
├── research/                      # Phase 1 research documentation
│   ├── phase1-ast-grep-research.md
│   ├── phase1-pydantic-research.md
│   ├── phase1-schema-org-research.md
│   ├── phase1-repomix-integration.md
│   ├── phase1-system-architecture.md
│   └── phase1-algorithm-design.md
├── logs/                          # Job execution logs
├── condense/                      # Repomix outputs (mirrors ~/code structure)
├── output/                        # Duplicate detection outputs
│   └── reports/                   # Scan reports (HTML/Markdown/JSON)
└── document-enhancement-impact-measurement/
    ├── enhanced-readmes/          # Enhanced README copies
    ├── impact-reports/            # SEO impact analysis
    └── enhancement-summary-*.json # Enhancement run summaries
```

## Testing

### Test Statistics

```
Total Tests: 132
Passing: 127 (96.2%)
Test Suites: 9
```

**Test Breakdown:**
- Directory Scanner: 13 tests ✅
- README Scanner: 11 tests ✅
- Schema MCP Tools: 31 tests ✅
- REST API: 16 tests ✅
- WebSocket: 15 tests ✅
- Caching: 23 tests ✅ (requires Redis)
- MCP Integration: 11 tests ✅
- Repomix Worker: 9 tests (8 passing)
- Sidequest Server: 12 tests (10 passing)

### Accuracy Testing

The accuracy test suite validates duplicate detection against known ground truth:

```bash
# Run accuracy tests
node test/accuracy/accuracy-test.js

# With detailed output and results saving
node test/accuracy/accuracy-test.js --verbose --save-results
```

**Test Metrics:**
- Precision: TP / (TP + FP)
- Recall: TP / (TP + FN)
- F1 Score: Harmonic mean of precision and recall
- False Positive Rate: FP / (FP + TN)

**Ground Truth:**
- 16 expected duplicate groups
- 41 duplicate functions
- 8 false positive candidates
- Targets: Precision ≥90%, Recall ≥80%, FP Rate ≤10%

### Adding Test Cases

To add new duplicate detection test cases:

1. Add functions to `test/accuracy/fixtures/src/`
2. Update `test/accuracy/expected-results.json` with new groups
3. Run tests to validate

## MCP Servers

Configured MCP servers for enhanced AI capabilities:

- **Sentry MCP** (HTTP Remote) - Error tracking, OAuth authentication required
- **Redis MCP** (STDIO) - Queue management, connected to localhost:6379
- **TaskQueue MCP** (STDIO) - AI task management with approval gates
- **Filesystem MCP** (STDIO) - Limited to `/Users/alyshialedlie/code/jobs`

```bash
# Manage MCP servers
claude mcp list                    # List all servers
claude mcp tools <server-name>     # View available tools
```

## Python Environment

**Virtual environment required** for Python components:

```bash
# Create virtual environment
python3 -m venv venv

# Activate
source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run Python scripts
doppler run -- venv/bin/python3 lib/extractors/extract_blocks.py
```

**Required Python packages:**
- pydantic>=2.12 (data models)
- Additional dependencies in `requirements.txt`

## Logging & Monitoring

### Sentry Integration

All errors and performance metrics sent to Sentry:

```javascript
import { createComponentLogger } from './sidequest/logger.js';

const logger = createComponentLogger('ComponentName');
logger.info('Message');
logger.error({ error }, 'Error message');
```

### Log Files

```
logs/
├── repomix-{path}-{timestamp}.json        # Completed jobs
├── repomix-{path}-{timestamp}.error.json  # Failed jobs
└── run-summary-{timestamp}.json           # Run statistics
```

## Excluded Directories

The scanner automatically skips:
- `node_modules`, `.git`, `dist`, `build`, `coverage`
- `.next`, `.nuxt`, `vendor`
- `__pycache__`, `.venv`, `venv`, `target`
- `.idea`, `.vscode`
- All hidden directories (starting with `.`)

## Production Deployment

### Duplicate Detection Pipeline (Phase 3)

**Configuration:** `config/scan-repositories.json`

```json
{
  "scanConfig": {
    "enabled": true,
    "schedule": "0 2 * * *",
    "maxConcurrentScans": 3,
    "retryAttempts": 2
  },
  "repositories": [
    {
      "name": "sidequest",
      "path": "/path/to/repo",
      "priority": "high",
      "scanFrequency": "daily",
      "enabled": true
    }
  ],
  "repositoryGroups": [
    {
      "name": "internal-tools",
      "repositories": ["sidequest", "lib"],
      "scanType": "inter-project"
    }
  ]
}
```

**Deploy:**
```bash
# Production deployment with PM2
doppler run -- pm2 start duplicate-detection-pipeline.js --name duplicate-scanner

# Test immediately
doppler run -- RUN_ON_STARTUP=true node duplicate-detection-pipeline.js

# Monitor
pm2 status duplicate-scanner
pm2 logs duplicate-scanner
```

**Features:**
- ✅ Cron-based scheduling (2 AM daily by default)
- ✅ Repository prioritization (critical, high, medium, low)
- ✅ Scan frequency management (daily, weekly, monthly, on-demand)
- ✅ Inter-project and intra-project scanning
- ✅ Retry logic with exponential backoff
- ✅ Redis caching (30-day TTL)
- ✅ Sentry error tracking and high-impact duplicate alerts

### Using PM2

```bash
npm install -g pm2

# Start all pipelines
pm2 start index.js --name repomix-cron
pm2 start doc-enhancement-pipeline.js --name doc-enhancement
pm2 start git-activity-pipeline.js --name git-activity
pm2 start duplicate-detection-pipeline.js --name duplicate-scanner

pm2 save
pm2 startup
```

### Redis Cache Layer

**30-day TTL caching for scan results:**

```bash
# Test cache layer
node test-cache-layer.js

# Redis operations via MCP
claude mcp tools redis-mcp

# Monitor cache
redis-cli
> KEYS duplicate:*
> TTL duplicate:scan:repo-hash
```

**Cache Keys:**
- `duplicate:scan:{repoHash}` - Cached scan results
- TTL: 30 days (2,592,000 seconds)

## Important Notes

### Cron Scheduling

Environment variables for scheduling:
- `CRON_SCHEDULE` - Repomix scheduling (default: `0 2 * * *` - 2 AM daily)
- `DOC_CRON_SCHEDULE` - Doc enhancement (default: `0 3 * * *` - 3 AM daily)
- `GIT_CRON_SCHEDULE` - Git activity reports (default: `0 20 * * 0` - Sunday 8 PM)
- `RUN_ON_STARTUP=true` - Run immediately on startup

### Phase Status

**Phase 1 (Research & Design):** ✅ Complete - 6 documents, 4,120 lines
**Phase 2 (Core Implementation):** ✅ Complete - Working prototype with improvements
**Phase 3 (Automation):** ✅ **Complete** - Production-ready automated pipeline deployed (2025-11-16)
**Phase 4 (Validation):** ✅ Complete - Accuracy test suite implemented with 81% recall

### Current Accuracy Metrics (Updated 2025-11-17 - After Bug #2 Fix)

| Metric | Target | Baseline | After Bug #2 Fix | Status |
|--------|--------|----------|------------------|--------|
| **Precision** | 90% | 59.09% | **77.78%** | ⚠️ Gap: -12.22% (+18.69% improvement) |
| **Recall** | 80% | 81.25% | **87.50%** | ✅ **ACHIEVED!** (+6.25% improvement) |
| **F1 Score** | 85% | 68.42% | **82.35%** | ⚠️ Gap: -2.65% (+13.93% improvement) |
| **FP Rate** | <10% | 64.29% | **33.33%** | ⚠️ Gap: -23.33% (-30.96% improvement) |

**Baseline Results:** 13 correct / 22 detected (13 TP, 9 FP, 3 FN)
**Current Results:** 14 correct / 18 detected (14 TP, 4 FP, 2 FN, 8 TN)
**Improvement:** +1 TP, -5 FP, -1 FN, precision +18.69%, recall +6.25%
**Overall Grade:** B (improved from D)

### Bug #2 Fix: Unified Penalty System (2025-11-17)

**Status:** ✅ **IMPLEMENTED AND TESTED**

**Problem:** Semantic penalty detection ran AFTER code normalization, which stripped away the differences it was meant to detect (status codes `200` → `NUM`, operators, etc.). This caused all semantic penalties to fail, resulting in high false positive rate.

**Solution:** Two-phase architecture implemented in `lib/similarity/structural.py`:

1. **Phase 1**: Extract semantic features from ORIGINAL code (BEFORE normalization)
   - HTTP status codes (`.status(200)` → `{200}`)
   - Logical operators (`===`, `!==`, `!`, `&&`, `||`)
   - Semantic methods (`Math.max`, `Math.min`, `.reverse`, etc.)

2. **Phase 2**: Normalize code and calculate base structural similarity
   - Standard normalization process
   - Levenshtein similarity calculation
   - Method chain validation

3. **Phase 3**: Apply unified semantic penalties using original features
   - HTTP status codes: 0.70x (30% penalty)
   - Logical operators: 0.80x (20% penalty)
   - Semantic methods: 0.75x (25% penalty)
   - Penalties multiply for compounding effects

**Code Changes:**
- Added `SemanticFeatures` dataclass (lines 16-26)
- Added `extract_semantic_features()` function (lines 29-93)
- Added `calculate_semantic_penalty()` function (lines 373-419)
- Refactored `calculate_structural_similarity()` (lines 422-482)

**Results:**
- Precision: 59.09% → 77.78% (+18.69%)
- Recall: 81.25% → 87.50% (+6.25%)
- F1 Score: 68.42% → 82.35% (+13.93%)
- False Positive Rate: 64.29% → 33.33% (-30.96%)

**Verified True Negatives:**
- ✅ sendCreatedResponse (201 vs 200 status code)
- ✅ isDevelopment (negated logic)
- ✅ getUserNamesReversed (additional .reverse() operation)

**Session Report:** See `/Users/alyshialedlie/code/PersonalSite/_reports/2025-11-17-bug-2-unified-penalty-fix.md` for full implementation details

### Recent Bug Fixes & Improvements (2025-11-12 to 2025-11-17)

**Critical Bug Fixes:**
1. ✅ **Field name mismatch** (extract_blocks.py:231) - Changed `semantic_tags` → `tags`
2. ✅ **Backward search algorithm** (extract_blocks.py:80-98) - Prevents finding previous functions
3. ✅ **Function-based deduplication** (extract_blocks.py:108-163) - 48% reduction in false positives
4. ✅ **Bug #2: Unified penalty system** (structural.py:16-482) - Two-phase architecture fixes semantic penalty detection (+18.69% precision)

**Algorithm Enhancements:**
1. ✅ **Method name preservation** (structural.py:39-62) - Preserves map, filter, reduce, etc.
2. ✅ **Higher similarity threshold** (grouping.py:29) - Increased 0.85 → 0.90
3. ✅ **Semantic feature extraction** (structural.py:29-93) - Extracts features BEFORE normalization
4. ✅ **Unified penalty calculation** (structural.py:373-419) - Multiplicative penalties for HTTP codes, operators, methods

**Test Coverage:**
1. ✅ **132 total tests** - REST API (16), WebSocket (15), Caching (23), MCP (11), plus existing suites
2. ✅ **96.2% passing** - 127/132 tests passing, caching tests require Redis MCP setup
3. ✅ **Accuracy test suite** - Validates duplicate detection against ground truth (16 groups, 41 functions)

**Phase 3 Deployment:**
1. ✅ **Automated pipeline** - `duplicate-detection-pipeline.js` with cron scheduling
2. ✅ **Repository configuration** - `config/scan-repositories.json` with 3 repos, 1 group
3. ✅ **Production ready** - PM2 support, retry logic, Sentry tracking, Redis caching

## Troubleshooting

### repomix not found
```bash
npm install -g repomix
```

### Python pipeline errors
Check Python path and virtual environment:
```bash
which python3
source venv/bin/activate
```

### Accuracy tests failing
Ensure all dependencies installed and Python models importable.

### Redis connection errors
```bash
redis-cli ping  # Should return PONG
brew services start redis  # Start Redis if needed
```
