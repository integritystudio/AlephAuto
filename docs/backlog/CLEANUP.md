# Codebase Cleanup Backlog

**Date:** 2026-02-14
**Source:** Codebase analyzer scan
**Updated:** 2026-02-15

---

## Completed

- [x] Delete `coverage/tmp/` - 546MB test artifacts
- [x] Delete `sidequest/bug-fixes/node_modules/` - 5MB stale debugging leftover
- [x] **LOG1:** Remove duplicate documentation files (4 files removed, docs/README.md link updated)
- [x] **LOG2:** Remove duplicate route files + Cloudflare tunnel sync infrastructure
- [x] **LOG3:** Replace hardcoded paths with `process.cwd()` in 3 integration tests
- [x] **LOG4:** Replace `console.log` with `createComponentLogger` in codebase-health-scanner.js and report-coordinator.js (html-report-generator.js kept as-is: client-side browser JS)
- [x] **LOG5:** Configure PM2 log rotation (`max_size: '10M'` in ecosystem.config.cjs)
- [x] **LOG6:** Add 30-day report retention policy (`pruneOldReports()` in report-generator.js)
- [x] **LOG7:** Archive one-time migration scripts to `scripts/archive/`
- [x] **LOG10:** Unregistered scripts - 4 of 6 archived via LOG7; remaining 2 (`analyze-duplicates.py`, `warm-doppler-cache.sh`) are utility scripts, no action needed

---

## Deferred

### LOG8: Skipped Tests

3 test files with `describe.skip()` due to SQLite WASM cleanup issue (sql.js conflicts with Node.js test runner, causing CI hangs). `test-gitignore-manager.js` has no skipped tests.

- `tests/unit/sidequest-server.test.js` - SQLite cleanup
- `tests/unit/mcp-server.test.js` - SQLite cleanup
- `tests/unit/websocket.test.js` - SQLite cleanup

**Fix requires:** Test-specific database isolation or jobRepository mocking.

### LOG9: TODO Comments

Outstanding TODOs in production code (feature work, not cleanup):

- `sidequest/pipeline-runners/schema-enhancement-pipeline.js:13` - auto-update README from directory commit data
- `sidequest/pipeline-core/similarity/grouping.py:9` - Layer 3: Semantic equivalence
- `sidequest/pipeline-core/extractors/extract_blocks.py:437` - Layer 3: Semantic equivalence

### LOG11: Deep Relative Imports

14 files in `api/` use `../../` or deeper imports. Deferred to TS migration Phase 9 (see `backlog/2.0/BACKLOG.md`).

### LOG12: Example File Review

`sidequest/utils/doppler-resilience.example.js` (290 lines) - documents the DopplerResilience circuit breaker pattern. Kept as reference implementation.
