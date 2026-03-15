# ast-grep Code Analysis Report

**Date:** 2026-03-09
**Tool:** [ast-grep MCP](https://github.com/aledlie/ast-grep-mcp) (53 tools, v2026-03-09)
**Target:** `~/code/jobs` (239 TypeScript source files, excluding node_modules/dist/venv)
**Analyses:** Complexity, Code Smells, Security, Standards Enforcement, Duplication, API Documentation

---

## Executive Summary

| Dimension | Result | Status |
|-----------|--------|--------|
| Complexity | 205 functions, 0 exceeding thresholds | Clean |
| Security | 0 issues (SQL injection, XSS, command injection, secrets, crypto) | Clean |
| Duplication | 0 duplicate groups (1,000 constructs analyzed) | Clean |
| Code Smells | 2 high-severity large classes (source code) | Action needed |
| Standards | 109 violations (95 info, 14 warning) | Low priority |

---

## 1. Complexity Analysis

**Thresholds:** cyclomatic >10, cognitive >15, nesting >4, length >50 lines

| Metric | Value |
|--------|-------|
| Files scanned | 239 |
| Functions extracted | 205 |
| Exceeding thresholds | 0 |
| Avg cyclomatic | 2.99 |
| Avg cognitive | 1.72 |
| Max cyclomatic | 10 |
| Max cognitive | 10 |
| Max nesting | 2 |
| Analysis time | 5.6s |

No functions exceed any threshold. The codebase is well-decomposed with low average complexity.

---

## 2. Code Smells (Source Files Only)

2 high-severity large classes detected in source code (4 additional in node_modules, excluded).

### High Severity

| File | Class | Lines | Methods | Threshold |
|------|-------|-------|---------|-----------|
| `sidequest/pipeline-core/git/migration-transformer.ts:163` | MigrationTransformer | 627 | 44 | 300 lines, 20 methods |
| `sidequest/pipeline-core/reports/html-report-generator.ts:18` | HtmlReportGenerator | 607 | 3 | 300 lines |

**Recommendation:** Both classes exceed the 300-line threshold by 2x. `MigrationTransformer` also has 44 methods (threshold: 20) -- strongest candidate for decomposition via Single Responsibility Principle. `HtmlReportGenerator` has only 3 methods but long template strings -- consider extracting HTML templates to separate files.

### Medium Severity (from earlier full scan)

| File | Lines |
|------|-------|
| `sidequest/pipeline-core/scanners/root-directory-analyzer.ts:100` | 564 |
| `sidequest/pipeline-core/scan-orchestrator.ts:319` | 521 |
| `sidequest/pipeline-core/scanners/timeout-pattern-detector.ts:70` | 506 |
| `sidequest/pipeline-core/config/repository-config-loader.ts:127` | 499 |

### Low Severity (from earlier full scan)

| File | Lines |
|------|-------|
| `sidequest/pipeline-core/inter-project-scanner.ts:153` | 429 |
| `sidequest/pipeline-core/git/branch-manager.ts:49` | 410 |
| `frontend/src/services/websocket.ts:19` | 402 |
| `api/activity-feed.ts:42` | 400 |
| `sidequest/pipeline-core/git/pr-creator.ts:58` | 377 |
| `sidequest/pipeline-core/reports/markdown-report-generator.ts:22` | 372 |
| `sidequest/pipeline-core/reports/json-report-generator.ts:168` | 370 |
| `sidequest/pipeline-core/cache/cached-scanner.ts:67` | 352 |
| `sidequest/pipeline-core/cache/git-tracker.ts:38` | 366 |
| `sidequest/utils/doppler-resilience.ts:66` | 313 |

---

## 3. Security Scan

**Result:** 0 issues found.

Scanned for: SQL injection, XSS, command injection, hardcoded secrets, insecure cryptography, directory traversal, unsafe deserialization.

Note: Previous manual code reviews (see [BACKLOG.md](BACKLOG.md) "Code Review Findings -- API Routes") identified and fixed C1 (CORS), C2 (directory traversal), C3 (scanId validation), H4-H9, M10-M15, L16-L18. The clean scan confirms those fixes remain in place.

---

## 4. Standards Enforcement

**Rules executed:** 7 (recommended TypeScript rule set)
**Files scanned:** 34
**Total violations:** 109

### By Rule

| Rule | Count | Severity | Notes |
|------|-------|----------|-------|
| `prefer-const` | 95 | info | Structural pattern match only -- manual review found all 6 `api/` hits are false positives (variables are reassigned in branches/closures). Other areas likely similar. |
| `no-console-log` | 14 | warning | All in `frontend/src/` (websocket.ts: 9, useWebSocketConnection.ts: 5). Should use structured logger. |
| `no-var` | 0 | - | |
| `no-debugger` | 0 | - | |
| `no-empty-catch` | 0 | - | |
| `no-double-equals` | 0 | - | |
| `no-fixme-comments` | 0 | - | |

### Top Files by Violation Count

| File | Total | Warnings | Info |
|------|-------|----------|------|
| `frontend/src/services/websocket.ts` | 9 | 9 | 0 |
| `sidequest/pipeline-core/reports/markdown-report-generator.ts` | 9 | 0 | 9 |
| `tests/scripts/validate-backlog.ts` | 8 | 0 | 8 |
| `tests/integration/activity-feed.integration.test.ts` | 8 | 0 | 8 |
| `sidequest/pipeline-core/git/migration-transformer.ts` | 7 | 0 | 7 |
| `scripts/verify-setup.ts` | 7 | 0 | 7 |
| `frontend/src/hooks/useWebSocketConnection.ts` | 5 | 5 | 0 |
| `sidequest/core/server.ts` | 5 | 0 | 5 |
| `sidequest/utils/schema-mcp-tools.ts` | 5 | 0 | 5 |

### Caveat: `prefer-const` False Positives

The ast-grep `prefer-const` rule uses structural pattern matching (`let $VAR = $VALUE`), not dataflow analysis. It cannot detect reassignment in:
- Conditional branches (`if (x) { variable = newValue; }`)
- Closures (`callback(() => { variable++; })`)
- Loop bodies (`forEach(() => { count++; })`)

All 6 `api/` violations were manually verified as false positives. The 95 total should be treated as candidates requiring manual review, not confirmed violations.

---

## 5. Duplication Analysis

**Constructs analyzed:** 1,000 (const declarations, function definitions)
**Similarity mode:** Hybrid (MinHash/LSH + AST)
**Minimum similarity:** 0.8
**Minimum lines:** 6

| Metric | Value |
|--------|-------|
| Candidate groups (pre-filter) | 3 |
| Groups after precision filter | 0 |
| Duplicated lines | 0 |

All 3 candidate groups were removed by precision filters (false positive elimination). No actionable duplication found.

---

## 6. API Route Documentation (Express)

25 routes discovered across 5 files.

### Routes by File

#### `api/server.ts` (6 routes)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check endpoint |
| GET | `/api/health/doppler` | Doppler integration health |
| GET | `/api/status` | Server status |
| GET | `activityFeed` | Activity feed data |
| GET | `/api/pipeline-data-flow` | Pipeline data flow info |
| GET | `/ws/status` | WebSocket status |

#### `api/routes/reports.ts` (4 routes)

| Method | Path | Parameters |
|--------|------|------------|
| GET | `/` | `?format=html\|markdown\|json`, `?type=summary` |
| GET | `/:filename` | `filename` (path) |
| DELETE | `/:filename` | `filename` (path) |
| GET | `/:scanId/summary` | `scanId` (path) |

#### `api/routes/repositories.ts` (7 routes)

| Method | Path | Parameters |
|--------|------|------------|
| GET | `/` | - |
| GET | `/:name` | `name` (path) |
| POST | `/:name/scan` | `name` (path) |
| GET | `/:name/cache` | `name` (path) |
| DELETE | `/:name/cache` | `name` (path) |
| GET | `/groups/list` | - |
| GET | `/groups/:name` | `name` (path) |

#### `api/routes/scans.ts` (2 routes)

| Method | Path | Parameters |
|--------|------|------------|
| GET | `/:scanId/status` | `scanId` (path) |
| GET | `/:scanId/results` | `scanId` (path) |

#### `api/routes/jobs.ts` (6 routes)

| Method | Path | Parameters |
|--------|------|------------|
| GET | `/` | pagination query params |
| POST | `/bulk-import` | - |
| GET | `/:jobId` | `jobId` (path) |
| POST | `/:jobId/cancel` | `jobId` (path) |
| POST | `/:jobId/retry` | `jobId` (path) |
| GET | `/:jobId/logs` | `jobId` (path) |

---

## 7. Actionable Items

### Priority 1: Replace `console.log` in frontend (14 warnings)

`frontend/src/services/websocket.ts` (9) and `frontend/src/hooks/useWebSocketConnection.ts` (5) use `console.log` instead of the project's structured logger.

### Priority 2: Decompose `MigrationTransformer` (627 lines, 44 methods)

`sidequest/pipeline-core/git/migration-transformer.ts` is the single worst offender across all dimensions -- largest class, most methods, and 7 prefer-const flags. Candidate for extraction:
- Group methods by migration phase (parsing, transforming, validating, writing)
- Extract each phase into a dedicated class or module

### Priority 3: Extract HTML templates from `HtmlReportGenerator` (607 lines)

`sidequest/pipeline-core/reports/html-report-generator.ts` has only 3 methods but 607 lines, indicating large inline HTML/CSS templates. Move templates to separate `.html` files or a template engine.

---

## Tool Configuration

```
analyze_complexity:   cyc>10, cog>15, nest>4, len>50
detect_code_smells:   large_class>300 lines or >20 methods
detect_security:      all issue types, severity>=low
enforce_standards:    recommended TypeScript ruleset (7 rules)
find_duplication:     min_lines=6, min_similarity=0.8, hybrid mode
generate_api_docs:    framework=express, format=markdown
```
