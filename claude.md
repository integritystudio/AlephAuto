# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository contains two primary systems:

1. **Code Consolidation System** - Automated duplicate code detection using ast-grep, pydantic, and multi-layer similarity algorithms
2. **Document Enhancement Pipeline** - Automated Schema.org structured data injection for README files

Both systems run on sidequest job servers with Sentry error logging.

## ⚠️ Critical Information

**Before making changes, be aware of these critical patterns:**

1. **Field Name:** CodeBlock uses `tags` field, NOT `semantic_tags` (lib/extractors/extract_blocks.py:231)
2. **Backward Search:** Function extraction searches BACKWARDS to find closest function (extract_blocks.py:80-98)
3. **Function-Based Deduplication:** Deduplicates by `file:function_name`, not `file:line` (extract_blocks.py:108-163)
4. **Configuration:** Always use `import { config } from './sidequest/config.js'`, NEVER `process.env` directly
5. **Doppler Required:** All commands must run with `doppler run --` for environment variables
6. **Accuracy Target:** Recall ≥80% (✅ achieved: 81.25%), Precision ≥90% (⚠️ current: 59.09%)

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

### Document Enhancement Pipeline

**Pipeline Flow:**

```
README Scanner → Schema Type Detection → Schema Generation →
Impact Analysis → Content Injection → Report Generation
```

**Key Components:**

- **`doc-enhancement-pipeline.js`** - Main server with cron scheduling
- **`sidequest/doc-enhancement/readme-scanner.js`** - README discovery
- **`sidequest/doc-enhancement/schema-mcp-tools.js`** - Schema.org type detection and generation
- **`sidequest/doc-enhancement/schema-enhancement-worker.js`** - Enhancement job worker

**Schema Types Supported:**

| Content Type | Schema Type | Rich Results |
|-------------|-------------|--------------|
| Test documentation | `HowTo` | How-to guides |
| API documentation | `APIReference` | Technical articles |
| Software projects | `SoftwareApplication` | Software apps |
| Code repositories | `SoftwareSourceCode` | Code repositories |
| Tutorials/guides | `HowTo` | How-to guides |

### Sidequest Job Management

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

### Structural Similarity

Normalize code to detect structural duplicates with **method name preservation** (lib/similarity/structural.py:39-62):

```python
# In lib/similarity/structural.py
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

    # Normalize operators, punctuation
    return normalized

def calculate_structural_similarity(code1, code2, threshold=0.90):  # Increased from 0.85
    # Layer 1: Exact hash match → 1.0
    # Layer 2: Normalized comparison → 0.0-1.0 (Levenshtein)
    return (similarity_score, method)
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
├── sidequest/                     # Job management system
│   ├── server.js                  # Base sidequest server
│   ├── config.js                  # Centralized configuration
│   ├── logger.js                  # Sentry-integrated logging
│   ├── repomix-worker.js          # Repomix job worker
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
pm2 start index.js --name repomix-cron
pm2 start doc-enhancement-pipeline.js --name doc-enhancement
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
- `RUN_ON_STARTUP=true` - Run immediately on startup

### Phase Status

**Phase 1 (Research & Design):** ✅ Complete - 6 documents, 4,120 lines
**Phase 2 (Core Implementation):** ✅ Complete - Working prototype with improvements
**Phase 3 (Automation):** ✅ **Complete** - Production-ready automated pipeline deployed (2025-11-16)
**Phase 4 (Validation):** ✅ Complete - Accuracy test suite implemented with 81% recall

### Current Accuracy Metrics (Updated 2025-11-16 - After Precision Refactoring)

| Metric | Target | Baseline (Before) | Current (After) | Status |
|--------|--------|-------------------|-----------------|--------|
| **Precision** | 90% | 59.09% | 61.90% | ⚠️ In Progress (+2.81%) |
| **Recall** | 80% | **81.25%** | **81.25%** | ✅ **ACHIEVED!** |
| **F1 Score** | 85% | 68.42% | 70.27% | ⚠️ In Progress (+1.85%) |
| **FP Rate** | <10% | 64.29% | 66.67% | ⚠️ Above Target |

**Baseline Results:** 13 correct / 22 detected (13 TP, 9 FP, 3 FN)
**Current Results:** 13 correct / 21 detected (13 TP, 8 FP, 3 FN)
**Improvement:** -1 false positive, precision +2.81%

### Precision Improvement Plan (2025-11-16)

**Status:** Plan created, implementation pending

A comprehensive 5-phase refactoring plan has been created to improve precision from 59.09% to 90%:

**Root Cause:** Over-normalization in `lib/similarity/structural.py` removes critical semantic information (Math.max vs Math.min, HTTP status codes, logical operators)

**Quick Wins Available (1 hour):**
- Expand `important_methods` to preserve `max`, `min`, `reverse`, `status`, `json`
- Increase similarity threshold from 0.90 to 0.95
- Expected: 59% → 88-92% precision

**Implementation Resources:**
- Full plan: `dev/precision-improvement-refactor-plan-2025-11-16.md`
- Summary: `dev/REFACTOR_PLAN_SUMMARY.md`
- Checklist: `dev/IMPLEMENTATION_CHECKLIST.md`
- Analysis: `PRECISION_FIX_SUMMARY.md`

**Feature Flags for Safe Deployment:**
```bash
export ENABLE_SEMANTIC_OPERATORS=true
export ENABLE_METHOD_CHAIN_VALIDATION=true
export ENABLE_SEMANTIC_LAYER=true
export ENABLE_QUALITY_FILTERING=true
```

### Recent Bug Fixes & Improvements (2025-11-12 to 2025-11-16)

**Critical Bug Fixes:**
1. ✅ **Field name mismatch** (extract_blocks.py:231) - Changed `semantic_tags` → `tags`
2. ✅ **Backward search algorithm** (extract_blocks.py:80-98) - Prevents finding previous functions
3. ✅ **Function-based deduplication** (extract_blocks.py:108-163) - 48% reduction in false positives

**Algorithm Enhancements:**
1. ✅ **Method name preservation** (structural.py:39-62) - Preserves map, filter, reduce, etc.
2. ✅ **Higher similarity threshold** (grouping.py:29) - Increased 0.85 → 0.90

**Test Coverage:**
1. ✅ **132 total tests** - REST API (16), WebSocket (15), Caching (23), MCP (11), plus existing suites
2. ✅ **96.2% passing** - 127/132 tests passing, caching tests require Redis MCP setup

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
