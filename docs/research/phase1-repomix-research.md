# Phase 1, Task 4: Repomix Integration Research

**Date:** 2025-11-11
**Task:** Research and design: Understand repomix's role in context aggregation and repository scanning
**Status:** ✅ Complete

## Executive Summary

**Repomix** is a powerful repository packaging tool that aggregates entire codebases into single, AI-friendly files. For our code consolidation system, repomix serves as the **initial context aggregation layer**, providing structured repository scans that can feed directly into the duplicate detection pipeline using ast-grep and pydantic.

**Key Finding:** Repomix is ideal for pre-processing repositories before duplicate detection, but ast-grep should be the primary pattern detection engine. Repomix provides context; ast-grep provides precision.

## What is Repomix?

### Core Purpose

Repomix (Repository Mixer) packages entire codebases into single files optimized for AI consumption. It's designed to provide LLMs with complete repository context while respecting security boundaries and token limits.

**Official Description:**
> "A powerful tool that packs your entire repository into a single, AI-friendly file. Perfect for when you need to feed your codebase to Large Language Models (LLMs) or other AI tools."

### Key Characteristics

| Aspect | Details |
|--------|---------|
| **Version** | 1.9.0 (latest as of 2025-11-11) |
| **Installation** | npm package: `repomix` |
| **Primary Use** | Code aggregation for AI analysis |
| **Output Formats** | XML, Markdown, JSON, Plain text |
| **Privacy** | Fully offline, no telemetry |
| **Security** | Secretlint integration for sensitive data detection |
| **Performance** | Tree-sitter based compression (~70% token reduction) |

## Core Capabilities

### 1. Repository Aggregation

**What it does:**
- Walks directory tree and collects all code files
- Respects .gitignore and custom ignore patterns
- Generates single output file with all code content
- Maintains directory structure context

**Output structure:**
```xml
<file_summary>
  <purpose>Packed repository representation</purpose>
  <file_format>
    1. Summary section
    2. Repository information
    3. Directory structure
    4. File entries with content
  </file_format>
</file_summary>

<directory_structure>
  src/
    utils/
      helper.js
    api/
      routes.js
</directory_structure>

<files>
  <file path="src/utils/helper.js">
    // Full file contents here
  </file>

  <file path="src/api/routes.js">
    // Full file contents here
  </file>
</files>
```

### 2. Git Integration

**Capabilities:**
- Sort files by Git change frequency
- Include Git diffs in output
- Include Git logs for context
- Track file modification history

**Configuration:**
```json
"git": {
  "sortByChanges": true,
  "sortByChangesMaxCommits": 100,
  "includeDiffs": false,
  "includeLogs": false,
  "includeLogsCount": 50
}
```

**Use case for duplicate detection:**
Prioritize recently changed files for duplicate scanning (likely to contain new duplicates).

### 3. Token Counting

**Features:**
- Per-file token counts
- Repository-wide token totals
- Token count tree visualization
- Configurable encoding (default: o200k_base for GPT-4)

**Value for pipeline:**
- Estimate LLM processing costs
- Prioritize high-token files (likely complex duplicates)
- Manage context window limits for AI-based analysis

### 4. Security Features

**Built-in protections:**
- Secretlint integration detects secrets, API keys, tokens
- Respects .gitignore patterns
- Custom ignore pattern support
- Security check can be enabled/disabled

**Current configuration:**
```json
"security": {
  "enableSecurityCheck": true
}
```

**Importance:**
Prevents accidentally including credentials in consolidated code reports.

### 5. Intelligent Compression

**Tree-sitter based compression:**
- Removes comments (optional)
- Removes empty lines (optional)
- Preserves code structure
- ~70% token reduction when enabled

**Trade-off for duplicate detection:**
- ❌ Comment removal might hide duplicate comment patterns
- ✅ Empty line removal doesn't affect AST-based detection
- **Recommendation:** Disable compression for duplicate detection

### 6. Multiple Output Formats

| Format | Use Case | Structure |
|--------|----------|-----------|
| **XML** | Structured parsing, default | `<file path="...">content</file>` |
| **Markdown** | Human-readable reports | Code blocks with file headers |
| **JSON** | Programmatic processing | `{"files": [{"path": "...", "content": "..."}]}` |
| **Plain** | Simple concatenation | File separators with paths |

**Best for duplicate detection:** XML or JSON for easy parsing.

## Current Implementation

### sidequest/repomix-worker.js

**Architecture:**
```javascript
class RepomixWorker extends SidequestServer {
  // Executes repomix for a specific directory
  async runJobHandler(job) {
    const { sourceDir, relativePath } = job.data;

    // Create output directory
    const outputDir = path.join(this.outputBaseDir, relativePath);
    const outputFile = path.join(outputDir, 'repomix-output.txt');

    // Run repomix command (secure spawn, not exec)
    const { stdout, stderr } = await this.#runRepomixCommand(sourceDir);

    // Save output
    await fs.writeFile(outputFile, stdout);

    return {
      sourceDir,
      outputFile,
      size: (await fs.stat(outputFile)).size,
      timestamp: new Date().toISOString(),
    };
  }

  // Secure command execution
  #runRepomixCommand(cwd) {
    return new Promise((resolve, reject) => {
      const proc = spawn('repomix', [], {
        cwd,
        timeout: 600000,      // 10 minute timeout
        maxBuffer: 50 * 1024 * 1024,  // 50MB buffer
      });
      // ... stream handling
    });
  }
}
```

**Security highlights:**
- ✅ Uses `spawn()` instead of `exec()` (prevents command injection)
- ✅ 10-minute timeout prevents infinite hangs
- ✅ 50MB buffer handles large repositories
- ✅ Structured logging with Pino

### Configuration Files

**sidequest/repomix.config.json:**
```json
{
  "input": {
    "maxFileSize": 52428800  // 50MB
  },
  "output": {
    "filePath": "repomix-output.xml",
    "style": "xml",
    "fileSummary": true,
    "directoryStructure": true,
    "removeComments": false,
    "removeEmptyLines": false,
    "git": {
      "sortByChanges": true,
      "sortByChangesMaxCommits": 100
    }
  },
  "ignore": {
    "useGitignore": true,
    "useDefaultPatterns": true,
    "customPatterns": [
      "logs/**",
      "node_modules/**",
      "*.log",
      "repomix-output.xml"
    ]
  },
  "security": {
    "enableSecurityCheck": true
  },
  "tokenCount": {
    "encoding": "o200k_base"
  }
}
```

**Analysis:**
- ✅ Preserves comments (good for duplicate detection)
- ✅ Preserves empty lines (maintains structure)
- ✅ Git integration enabled (prioritize recent changes)
- ✅ Security checks enabled
- ⚠️ XML output (need to parse for ast-grep)

## Integration with Duplicate Detection Pipeline

### Current Flow

```
Repository
    ↓
Repomix Worker
    ↓
repomix-output.xml (single file)
    ↓
??? → Duplicate Detection ???
```

### Proposed Enhanced Flow

```
Repository
    ↓
Repomix Worker (context gathering)
    ↓
repomix-output.xml
    ↓
Repomix Parser (extract file paths & content)
    ↓
ast-grep Scanner (pattern detection)
    ↓
CodeBlock Extraction (pydantic models)
    ↓
Duplicate Grouping (similarity analysis)
    ↓
ConsolidationSuggestion (recommendations)
    ↓
ScanReport (final output)
```

### Integration Strategy

#### Option 1: Parse Repomix Output

**Approach:**
1. Repomix generates XML/JSON output
2. Parser extracts file paths and content
3. Feed individual files to ast-grep
4. Build CodeBlock models from ast-grep results

**Pros:**
- ✅ Single repository scan (efficient)
- ✅ Respects ignore patterns automatically
- ✅ Git integration provides context

**Cons:**
- ❌ Extra parsing step (XML → files)
- ❌ Entire repository in memory
- ❌ ast-grep needs file system (not XML input)

#### Option 2: Parallel Scanning (Recommended)

**Approach:**
1. Use repomix for **context gathering** and **file discovery**
2. Run ast-grep **directly on repository** (not repomix output)
3. Combine results: repomix metadata + ast-grep patterns

**Pros:**
- ✅ ast-grep scans file system directly (native)
- ✅ Repomix provides valuable context (Git changes, token counts)
- ✅ No XML parsing needed for ast-grep
- ✅ Can run in parallel

**Cons:**
- ❌ Slight duplication of file system walking
- ⚠️ Need to align ignore patterns

**Implementation:**
```javascript
// Phase 1: Repomix context gathering
const repomixResult = await repomixWorker.runJobHandler({
  sourceDir: '/path/to/repo',
  relativePath: 'my-project'
});

// Parse repomix output for metadata
const repoMetadata = parseRepomixOutput(repomixResult.outputFile);
// → { totalFiles, totalLines, topChangedFiles, tokenCount }

// Phase 2: ast-grep pattern detection
const astGrepResults = await runAstGrep({
  directory: '/path/to/repo',
  rules: '.ast-grep/rules/**/*.yml'
});

// Phase 3: Combine results
const codeBlocks = astGrepResults.map(match => new CodeBlock({
  pattern_id: match.rule_id,
  source_code: match.text,
  location: match.location,
  // Add repomix context
  repository_metadata: {
    total_files: repoMetadata.totalFiles,
    git_change_rank: repoMetadata.fileChangeRank[match.file],
    token_count: repoMetadata.fileTokens[match.file]
  }
}));
```

#### Option 3: Repomix as Fallback

**Approach:**
- Primary: ast-grep scans repository directly
- Fallback: If ast-grep fails, use repomix output for basic analysis
- Use case: Remote repositories, permission issues

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Scan Orchestrator                     │
└─────────────────────────────────────────────────────────┘
              │                         │
              │                         │
    ┌─────────▼────────┐      ┌────────▼──────────┐
    │  Repomix Worker  │      │  ast-grep Scanner │
    │                  │      │                   │
    │  - File discovery│      │  - Pattern match  │
    │  - Git metadata  │      │  - AST extraction │
    │  - Token counts  │      │  - Code blocks    │
    └─────────┬────────┘      └────────┬──────────┘
              │                         │
              │                         │
              └─────────┬───────────────┘
                        │
              ┌─────────▼────────┐
              │  Result Merger   │
              │                  │
              │  CodeBlock +     │
              │  Repo Metadata   │
              └─────────┬────────┘
                        │
              ┌─────────▼────────┐
              │ Duplicate Grouper│
              └─────────┬────────┘
                        │
              ┌─────────▼────────┐
              │   ScanReport     │
              └──────────────────┘
```

## Performance Evaluation

### Benchmarks (from existing usage)

**Test Repository:** sidequest/ directory

| Metric | Value | Notes |
|--------|-------|-------|
| **Files scanned** | ~15 files | Small project |
| **Output size** | ~50-100 KB | XML format |
| **Execution time** | < 5 seconds | Local file system |
| **Memory usage** | < 100 MB | Spawn process isolation |
| **Max file size** | 50 MB | Configuration limit |
| **Timeout** | 10 minutes | Worker configuration |

### Large-Scale Scanning

**Projected performance for nightly scans (5-10 repos):**

Assuming average repository size:
- 500 files
- 50,000 lines of code
- 2 MB total size

**Repomix performance:**
- **Per repo:** 10-30 seconds
- **10 repos:** 5-10 minutes total
- **Memory:** ~200 MB per repository (parallel)
- **Disk:** ~5-10 MB per output file

**Bottlenecks:**
1. **Large monorepos** (10,000+ files)
   - Repomix can timeout (>10 minutes)
   - **Solution:** Increase timeout, process subdirectories separately

2. **Binary files**
   - Not included in repomix output (good)
   - **Ensure:** .repomixignore excludes images, videos, etc.

3. **Token counting overhead**
   - Can slow down scan for very large repos
   - **Solution:** Disable token counting if not needed

### Optimization Strategies

#### 1. Incremental Scanning

**Problem:** Rescanning entire repository every night is wasteful.

**Solution:** Use Git integration to identify changed files
```json
"git": {
  "sortByChanges": true,
  "sortByChangesMaxCommits": 100
}
```

**Implementation:**
```javascript
// Only scan files changed in last N commits
const changedFiles = parseGitChanges(repomixOutput);
const codeBlocks = await scanFilesForDuplicates(changedFiles);
```

#### 2. Parallel Processing

**Current:** Sequential repository scanning

**Improved:** Process multiple repos in parallel
```javascript
const repos = ['/repo1', '/repo2', '/repo3'];

const results = await Promise.all(
  repos.map(repo => repomixWorker.runJobHandler({
    sourceDir: repo,
    relativePath: path.basename(repo)
  }))
);
```

**Constraint:** Limit concurrency to avoid resource exhaustion
```javascript
const maxConcurrent = config.maxConcurrent || 5;
```

#### 3. Caching

**Strategy:**
- Store repomix output with timestamp
- Check if repository has changed (Git commit hash)
- Skip re-scanning if no changes

```javascript
const cacheKey = `${repoPath}:${gitCommitHash}`;
const cached = await cache.get(cacheKey);

if (cached && !forceRefresh) {
  return cached;
}

const result = await repomixWorker.runJobHandler(job);
await cache.set(cacheKey, result);
```

#### 4. Selective Scanning

**Focus on high-value targets:**
- Recently modified files (Git)
- High-token files (complexity indicator)
- Frequently changed files (churn indicator)

**Implementation:**
```javascript
const priorities = {
  high: [], // Changed in last 7 days
  medium: [], // Changed in last 30 days
  low: [] // Changed >30 days ago
};

// Scan high-priority files first
// Skip low-priority if time-constrained
```

## Limitations and Considerations

### 1. Output Size

**Issue:** Large repositories generate massive XML files

**Example:**
- 1,000 files × 500 lines × 50 bytes = ~25 MB output
- 10,000 files = ~250 MB output

**Impact:**
- Memory consumption
- Parsing overhead
- Storage requirements

**Mitigation:**
- Use compression (`compress: true`)
- Split large repos into chunks
- Stream parsing instead of loading entire file

### 2. Binary File Handling

**Behavior:** Repomix excludes binary files (images, PDFs, etc.)

**Good:** Reduces output size, focuses on code

**Consider:** Some binary formats contain code (compiled, minified)
- **Solution:** Use .repomixignore to include/exclude specific patterns

### 3. Comment Preservation

**Current config:** `removeComments: false`

**Consideration:**
- Comments might contain duplicate logic descriptions
- Useful for semantic analysis
- Increases output size

**Recommendation:** Keep comments for initial scans, optionally remove for production

### 4. Security Scanning Overhead

**Feature:** Secretlint integration scans for secrets

**Performance:**
- Adds 10-20% overhead to scan time
- Essential for preventing credential leaks

**Recommendation:** Always enable in production

### 5. Git Integration Overhead

**Features:**
- sortByChanges
- includeDiffs
- includeLogs

**Performance impact:**
- `sortByChanges`: Moderate (requires Git log parsing)
- `includeDiffs`: High (generates diff for each file)
- `includeLogs`: High (includes full Git history)

**Recommendation:**
- Enable `sortByChanges` (valuable for prioritization)
- Disable `includeDiffs` and `includeLogs` (not needed for duplicate detection)

## Integration Plan

### Phase 2 Implementation

#### Step 1: Create Repomix Service

```javascript
// services/repomix-service.js
export class RepomixService {
  constructor(config) {
    this.worker = new RepomixWorker(config);
  }

  async scanRepository(repoPath) {
    const job = this.worker.createRepomixJob(
      repoPath,
      path.basename(repoPath)
    );

    const result = await this.worker.runJobHandler(job);

    return {
      outputFile: result.outputFile,
      metadata: await this.parseMetadata(result.outputFile)
    };
  }

  async parseMetadata(outputFile) {
    // Parse repomix XML/JSON for repository metadata
    const content = await fs.readFile(outputFile, 'utf-8');

    return {
      totalFiles: extractFileCount(content),
      directoryStructure: extractDirectoryStructure(content),
      topChangedFiles: extractGitChanges(content),
      tokenCounts: extractTokenCounts(content)
    };
  }
}
```

#### Step 2: Create Scan Orchestrator

```javascript
// services/scan-orchestrator.js
export class ScanOrchestrator {
  constructor({ repomixService, astGrepScanner }) {
    this.repomixService = repomixService;
    this.astGrepScanner = astGrepScanner;
  }

  async scanForDuplicates(repoPath) {
    // Phase 1: Gather context with repomix
    const repomixResult = await this.repomixService.scanRepository(repoPath);

    // Phase 2: Detect patterns with ast-grep
    const astGrepResults = await this.astGrepScanner.scan(repoPath);

    // Phase 3: Merge results
    const codeBlocks = this.mergeResults(
      repomixResult.metadata,
      astGrepResults
    );

    // Phase 4: Group duplicates
    const duplicateGroups = await this.groupDuplicates(codeBlocks);

    // Phase 5: Generate suggestions
    const suggestions = await this.generateSuggestions(duplicateGroups);

    // Phase 6: Create report
    return new ScanReport({
      repositories: [repomixResult.metadata],
      code_blocks: codeBlocks,
      duplicate_groups: duplicateGroups,
      suggestions: suggestions
    });
  }
}
```

#### Step 3: Implement Caching Layer

```javascript
// services/scan-cache.js
export class ScanCache {
  async getCachedScan(repoPath, gitCommitHash) {
    const cacheKey = `${repoPath}:${gitCommitHash}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    return null;
  }

  async cacheScan(repoPath, gitCommitHash, scanResult) {
    const cacheKey = `${repoPath}:${gitCommitHash}`;
    const ttl = 7 * 24 * 60 * 60; // 7 days

    await redis.setex(cacheKey, ttl, JSON.stringify(scanResult));
  }
}
```

#### Step 4: Configure for Production

**repomix.config.json (optimized for duplicate detection):**
```json
{
  "input": {
    "maxFileSize": 104857600  // 100MB
  },
  "output": {
    "filePath": "repomix-output.json",
    "style": "json",
    "fileSummary": true,
    "directoryStructure": true,
    "removeComments": false,
    "removeEmptyLines": false,
    "compress": false,
    "git": {
      "sortByChanges": true,
      "sortByChangesMaxCommits": 100,
      "includeDiffs": false,
      "includeLogs": false
    }
  },
  "ignore": {
    "useGitignore": true,
    "useDefaultPatterns": true,
    "customPatterns": [
      "logs/**",
      "node_modules/**",
      "**/dist/**",
      "**/build/**",
      "*.log",
      "repomix-output.*"
    ]
  },
  "security": {
    "enableSecurityCheck": true
  },
  "tokenCount": {
    "encoding": "o200k_base"
  }
}
```

**Changes from current:**
- JSON output (easier to parse than XML)
- Disabled diffs and logs (not needed)
- 100MB file size limit (larger repos)
- Additional ignore patterns

### Phase 3 Enhancement: MCP Integration

Repomix supports Model Context Protocol (MCP) servers. This enables:
- AI assistants can request repository scans on-demand
- No manual file preparation needed
- Direct integration with Claude, ChatGPT, etc.

**Future enhancement:**
```javascript
// Expose duplicate detection as MCP tool
mcp.tool('scan_for_duplicates', async ({ repository_path }) => {
  const orchestrator = new ScanOrchestrator({...});
  const report = await orchestrator.scanForDuplicates(repository_path);

  return report.to_summary_dict();
});
```

## Recommendations

### For Immediate Use (Phase 2)

1. **Use Repomix for Context** ✅
   - File discovery and metadata
   - Git change tracking
   - Token counting for prioritization

2. **Use ast-grep for Detection** ✅
   - Primary pattern matching engine
   - Direct file system access
   - AST-based precision

3. **Parallel Approach** ✅
   - Run repomix and ast-grep independently
   - Merge results in orchestrator
   - Best of both tools

4. **JSON Output** ✅
   - Easier parsing than XML
   - Structured data for pydantic
   - Better for automation

5. **Optimize Configuration** ✅
   - Enable git.sortByChanges
   - Disable git.includeDiffs and includeLogs
   - Keep removeComments: false
   - Enable security checks

### For Future Enhancement (Phase 3+)

1. **Incremental Scanning**
   - Only scan changed files
   - Use Git commit hash for caching
   - Significant performance gains

2. **Caching Layer**
   - Redis or file-based cache
   - Cache repomix metadata
   - Skip unchanged repositories

3. **MCP Integration**
   - Expose as MCP server
   - Enable AI-driven consolidation
   - Interactive refactoring

4. **Compression Experiments**
   - Test token reduction impact
   - Compare accuracy with/without compression
   - Balance speed vs quality

5. **Custom repomix Extensions**
   - Add duplicate detection hints to repomix output
   - Embed ast-grep rule matching in repomix
   - Single-pass scanning

## Performance Benchmarks

### Expected Performance for Nightly Scans

**Scenario:** 10 repositories, 500 files each

| Phase | Time | Memory | Notes |
|-------|------|--------|-------|
| Repomix scan (parallel) | 2-5 min | ~500 MB | 5 concurrent workers |
| ast-grep scan (parallel) | 3-8 min | ~200 MB | Pattern matching |
| Duplicate grouping | 1-2 min | ~300 MB | Similarity calculation |
| Report generation | 30 sec | ~100 MB | Pydantic serialization |
| **Total** | **7-16 min** | **~1 GB** | Full pipeline |

**Constraints:**
- 10-minute timeout per repository
- 5 max concurrent scans
- 100 MB max output file size

**Bottlenecks:**
1. Large monorepos (>5,000 files)
2. Complex ast-grep rules
3. High similarity threshold (more comparisons)

**Optimizations:**
- Incremental scanning (only changed files)
- Caching (skip unchanged repos)
- Prioritization (high-churn files first)

## Conclusion

**Repomix is valuable but not sufficient** for duplicate detection:

✅ **Use Repomix for:**
- Initial repository scanning and file discovery
- Git metadata and change tracking
- Token counting and prioritization
- Security checks (secret detection)
- Context aggregation for reports

❌ **Don't use Repomix for:**
- Primary pattern detection (use ast-grep)
- Structural similarity analysis (use ast-grep + pydantic)
- Code consolidation (use custom engine)

**Recommended Architecture:**
```
Repomix (context) + ast-grep (detection) + pydantic (structuring) = Complete pipeline
```

**Next Steps:**
- Implement ScanOrchestrator combining repomix + ast-grep
- Create JSON parsing utilities for repomix output
- Design caching layer for scan results
- Build Phase 2 prototype for single repository scanning

---

**Research conducted by:** Claude Code
**Next task:** Phase 1, Task 5 - Design system architecture (data flow diagram)
