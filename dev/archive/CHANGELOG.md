# AlephAuto Changelog

This file tracks major changes, bug fixes, and feature additions to the AlephAuto job queue framework.

## Version 1.8.0 (2026-01-18)

### Test Suite Expansion 📊

**Comprehensive Unit Test Coverage** - 796 passing tests
- Added tests for SidequestServer core functionality
- Added tests for PR creator and report generator
- Added tests for git-tracker, cached-scanner, markdown-report-generator
- Added tests for rate-limit, repository-scanner, websocket
- Added tests for scan-cache, ast-grep-detector, validation middleware
- Added tests for reports, repositories, event-broadcaster
- Test results: 796 pass, 0 fail, 6 skipped

**CI/CD Improvements**
- Fixed Python pipeline tests (tuple unpacking, model imports)
- Made integration tests non-blocking with skip conditions
- Added timeout flags to integration test scripts
- Excluded standalone test scripts from CI runs
- Updated logger import paths in integration tests

### Security Updates 🔒

**Dependency Vulnerability Fixes**
- Resolved high-severity vulnerabilities in dependencies
- Updated qs to >=6.14.1 via pnpm overrides

### Bug Fixes ✅

**Dashboard & API**
- Fixed: Include reportPaths in duplicate-detection job results
- Fixed: Redirect MCP logger to stderr for protocol compatibility

**TypeScript**
- Resolved pre-existing TypeScript errors
- Use 'any' for Job.data and Job.result for flexibility
- Fixed worker.maxConcurrent reference in types

**Tests**
- Fixed API routes timeout and flaky test issues
- Added proper job cancellation in after hooks
- Handle missing reports directory in CI environment
- Skip integration tests requiring external services in CI

---

## Version 1.7.1 (2025-11-27)

### Documentation Restructuring ✅

**README.md Condensed** - 76% reduction (1537 → 372 lines)
- Removed detailed feature explanations → moved to `dev/archive/FEATURES.md`
- Removed detailed testing information → moved to `dev/archive/TESTING.md`
- Removed MCP server details → moved to `docs/MCP_SERVERS.md`
- Kept only essential quick start, architecture overview, and common troubleshooting
- Added comprehensive documentation links section
- All historical "Recent Updates" section content preserved in CHANGELOG.md

**New Archive Documentation Files**
- `dev/archive/FEATURES.md` - Detailed feature explanations with technical implementation details
  - Core Infrastructure (AlephAuto framework)
  - All 5 pipeline features in depth
  - Job management & architecture
  - Advanced usage examples
  - Performance optimization
  - Security considerations
  - Troubleshooting guide

- `dev/archive/TESTING.md` - Comprehensive testing documentation
  - Test infrastructure (fixtures, automatic cleanup, pre-commit validation)
  - All test suites (unit, integration, accuracy)
  - Running tests (all commands and options)
  - Writing tests (templates, best practices, assertion examples)
  - CI/CD integration
  - Troubleshooting common test issues
  - Test coverage goals

- `docs/MCP_SERVERS.md` - MCP server setup and troubleshooting
  - Detailed server configurations (Sentry, Redis, TaskQueue, Filesystem)
  - Setup instructions for each server
  - Integration points with AlephAuto
  - Troubleshooting guides
  - Advanced usage examples

**Benefits**
- Main README is now scannable and quick-reference focused
- Detailed information properly organized by topic
- Better discoverability through clear documentation links
- Easier onboarding with streamlined quick start
- Historical information preserved in CHANGELOG

---

## Version 1.7.0 (2025-11-27)

### Dashboard Improvements ✅

**Error Handling & Loading States**
- Added loading overlay with spinner for initial data fetch
- Implemented error message component with retry functionality
- Frontend now gracefully handles API connection failures
- Clear user feedback when backend server is not running
- Files: `frontend/src/components/ui/ErrorMessage/`, `frontend/src/store/dashboard.ts`

**Jobs API Endpoint**
- Created `/api/jobs` endpoint for cross-pipeline job queries
- Supports filtering by status (running, queued, completed, failed)
- Pagination with `limit`, `offset`, `page`, `hasMore` fields
- Schema.org @type compliance for all job responses
- Made publicly accessible for dashboard consumption
- Implementation: `api/routes/jobs.js`, `sidequest/core/database.js:getAllJobs()`

**Pipeline Data Flow Documentation**
- Documentation panel loads markdown from `docs/architecture/pipeline-data-flow.md`
- Converts markdown to HTML with mermaid diagram support
- Lazy loading on tab click (361KB content)
- All 9 pipelines documented with data flow diagrams
- Endpoint: `GET /api/pipeline-data-flow` (public access)

### Git Hooks for Documentation Maintenance 🎣

**Post-Commit Hook**
- Monitors changes to `sidequest/pipeline-runners/` and `sidequest/workers/`
- Warns when pipeline code changes without documentation updates
- Shows days since `docs/architecture/pipeline-data-flow.md` was last updated
- Provides actionable checklist for maintaining documentation
- Installation: `bash git-hooks/install.sh`
- Location: `git-hooks/post-commit`, `git-hooks/README.md`

### Test Infrastructure Improvements 📊

**Test Fixtures Migration** - COMPLETE
- All tests migrated to use `createTempRepository()` from test fixtures
- Pre-commit hook validates no hardcoded `/tmp/` paths
- Tests: `repomix-worker.test.js` (8/8 passing), `mcp-server.test.js` (10-13/16 passing)
- Test utilities module with 31 passing tests
- Location: `tests/fixtures/test-helpers.js`, `tests/utils/test-utilities.js`

**Test Coverage Updates**
- RepomixWorker: ✅ All 8 tests passing with fixtures
- MCP Server: ⚠️ 10-13/16 passing (intermittent timing issues)
- Directory Scanner: ✅ All 13 tests passing
- Schema MCP Tools: ✅ All 31 tests passing
- SidequestServer: ✅ 10/12 passing (timing-related failures)

---

## Version 1.6.7 (2025-11-26)

### Bug Fixes ✅

**Error #1: Doppler Permission Denied** - FIXED
- Root cause: Missing `node` interpreter in command
- Fix: All pipeline scripts have shebang `#!/usr/bin/env node` and executable permissions
- Verification: `ls -la sidequest/pipeline-runners/*.js` shows `-rwxr-xr-x`

**Error #2: Doppler API HTTP 500** - FIXED
- Root cause: No fallback during Doppler API outages
- Fix: Implemented circuit breaker in `sidequest/utils/doppler-resilience.js`
- Features: 3-state circuit (CLOSED/OPEN/HALF_OPEN), exponential backoff, cache fallback
- Cache: `~/.doppler/.fallback.json`

**Error #3: Missing TypeScript Export** - FIXED
- Root cause: Stale TypeScript build cache
- Fix: Clean rebuild - all files have matching timestamps (2025-11-25 14:09:28)
- Verification: `PipelineHtmlParamsSchema` exports in both .ts and .js files
- Compile check: `npx tsc --noEmit` passes with zero errors

**Error #4: Pagination Total Count** - FIXED
- Root cause: Using `array.length` instead of database `COUNT(*)`
- Fix: `api/routes/pipelines.js:153-164` now uses `includeTotal: true` for database count
- Implementation: Line 171 returns `totalCount` from DB, line 226 fallback uses `allJobs.length` (correct)
- Comment: Line 153 shows `// FIXED E6: Now includes actual DB count`

### Related Projects Status

**TCAD Scraper** - Code Fixed, Operational Issue ⚠️
- Database write logic: ✅ FIXED (`RETURNING (xmax = 0) AS inserted` implemented)
- Zero properties in production: ⚠️ Claude API tokens exhausted (operational, not code bug)
- Action: Refill Claude API tokens to resume scraping

**AnalyticsBot** - Code Fixed, Config Complete ✅
- CORS middleware: ✅ FIXED (health endpoints bypass CORS)
- ALLOWED_ORIGINS: ✅ Configured in render.yaml
- Sentry configuration: ✅ COMPLETE (SENTRY_API_TOKEN with proper scopes)
- **CORS errors: 0** ✅ Verified 2025-11-26 (down from 224 baseline)

### Configuration Monitoring

**New Scripts** in `scripts/config-monitoring/` for verifying production configurations:

**Setup & Verification**
```bash
cd scripts/config-monitoring

# 1. Interactive Doppler setup (Sentry token, Supabase credentials)
./doppler-setup.sh

# 2. One-time verification (tests Sentry API, Supabase, database, cache)
./monitoring-script.sh

# 3. Live monitoring dashboard (auto-refresh every 30s)
./health-check.sh
```

**Project-Specific Verification**
```bash
# Verify AnalyticsBot CORS errors (should be 0, down from 224)
./verify-analyticsbot-cors.sh

# Verify TCAD Scraper API status
./verify-tcad-status.sh

# Check TCAD Scraper database stats (requires psql + network access)
./check-job-stats.sh
```

See `scripts/config-monitoring/README.md` for complete guide.
