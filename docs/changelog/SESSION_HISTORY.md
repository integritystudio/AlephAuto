# Session History

Chronological log of development sessions. For current architecture, see CLAUDE.md.

---

## 2026-02-09: Serve Vite Build Output from Express

### Summary
Replaced the deleted vanilla JS dashboard (`public/`) with the new React frontend (`frontend/`). Wired Express to serve the Vite build output and added SPA fallback for client-side routing. Updated deploy script, Render build config, and tracked frontend source in git.

### Problems Solved
- Express static middleware pointed at deleted `public/` directory
- No SPA fallback for React Router — deep links returned 404
- Deploy script used `npm ci` but project uses pnpm workspaces (no `package-lock.json`)
- PM2 ecosystem config path was wrong in deploy script (`ecosystem.config.cjs` vs `config/ecosystem.config.cjs`)
- Frontend `ActivityType` enum values used as string literals causing TypeScript build failure
- Frontend source was gitignored, not version-controlled

### Key Technical Decisions
1. **Static path**: `express.static(path.join(__dirname, '../frontend/dist'))` — serves Vite build output
2. **SPA fallback**: Catch-all GET middleware before 404 handler, excludes `/api/`, `/ws/`, `/health` prefixes
3. **Deploy script**: Switched from `npm ci` to `pnpm install --frozen-lockfile`, added `npm run build:frontend` step
4. **Git tracking**: Removed `frontend/` from root `.gitignore`; `frontend/.gitignore` still excludes `node_modules/` and `dist/`

### Files Modified
| File | Change |
|------|--------|
| `api/server.js` | Static path → `frontend/dist`, added SPA fallback middleware |
| `package.json` | Added `build:frontend` script |
| `render.yaml` | Added `npm run build:frontend` to build command |
| `frontend/src/services/websocket.ts` | Fixed ActivityType enum import and usage |
| `.gitignore` | Removed `frontend/` entry |
| `scripts/deploy-traditional-server.sh` | pnpm, frontend build, PM2 config path fix |

### Commits
- `d48a811` - feat(api): serve Vite build output and add SPA fallback
- `2f0411f` - feat(frontend): track React dashboard source and fix ActivityType enum
- `ad010bb` - fix(deploy): use pnpm, add frontend build, fix PM2 config path

### Verification
- TypeScript: `npm run typecheck` passes
- Unit tests: 1175 pass, 0 fail
- Frontend build: `tsc && vite build` succeeds (115 modules)
- Deploy: `./scripts/deploy-traditional-server.sh --update` succeeds
- Health check: `/health` returns `{"status":"healthy"}`
- Dashboard: `GET /` returns `index.html` (HTTP 200, 466 bytes)
- API routes: `/api/status` returns JSON correctly

### Status
✅ Complete — deployed to production

---

## 2026-02-03: Create @shared/process-io Package

### Summary
Created shared package to eliminate duplicate stdout/stderr capture patterns across 6 files. Addressed high-impact duplicates (score 88, 85) detected by duplicate detection pipeline.

### Problems Solved
- Duplicate `proc.stdout.on('data')` / `proc.stderr.on('data')` patterns across multiple files
- 22 total occurrences of process I/O handling scattered across codebase
- No shared abstraction for common child process execution patterns

### Key Technical Decisions
1. **Package structure**: Created `packages/shared-process-io/` following existing `@shared/logging` pattern
2. **API design**: Four exported functions with increasing abstraction:
   - `captureProcessOutput(proc)` - Low-level: attach to existing ChildProcess
   - `execCommand(cmd, args, opts)` - Mid-level: full result with exit code
   - `execCommandOrThrow(cmd, args, opts)` - Mid-level: throws on non-zero
   - `runCommand(cwd, cmd, args)` - High-level: returns trimmed stdout
3. **Backwards compatibility**: `process-helpers.js` re-exports from shared package
4. **Partial refactoring**: Files with complex spawn options (timeout, maxBuffer) use `captureProcessOutput` only, preserving custom error handling

### Files Modified
| File | Change |
|------|--------|
| `packages/shared-process-io/package.json` | New package manifest |
| `packages/shared-process-io/src/index.js` | Core implementation |
| `packages/shared-process-io/src/index.d.ts` | TypeScript declarations |
| `package.json` | Added `@shared/process-io` workspace dependency |
| `pnpm-lock.yaml` | Updated lockfile |
| `sidequest/pipeline-core/utils/process-helpers.js` | Now re-exports from shared |
| `sidequest/pipeline-core/git/branch-manager.js` | Uses `runCommand` |
| `sidequest/pipeline-core/git/pr-creator.js` | Uses `runCommand` |
| `sidequest/workers/repomix-worker.js` | Uses `captureProcessOutput` |
| `sidequest/workers/git-activity-worker.js` | Uses `captureProcessOutput` |
| `sidequest/pipeline-core/scanners/timeout-pattern-detector.js` | Uses `captureProcessOutput` |

### Commits
- `9377ce4` - refactor(shared): extract process I/O utilities to @shared/process-io package

### Verification
- TypeScript: `npm run typecheck` passes
- Unit tests: `branch-manager.test.js` (33 pass), `pr-creator.test.js` (22 pass)
- Grep verification: 0 occurrences of `proc.stdout.on('data'` remaining in sidequest/

### Status
✅ Complete

### Patterns Discovered
- `captureProcessOutput` pattern works well for files needing custom spawn options
- `runCommand` is ideal for simple git/CLI commands that just need stdout
- Re-exporting from shared package maintains backwards compatibility without breaking imports

### Pipeline Run Results (for reference)
```
Repositories scanned: 2 (sidequest, pipeline-core)
Total code blocks: 2,140
Cross-repository duplicate groups: 548
High-impact duplicates addressed: 2 of 4 (process_io category)
```

### Remaining High-Impact Duplicates
The timing-patterns duplicates (score 83.5, 81.5) were not addressed this session - flagged as `autonomous_agent` strategy with high migration risk and breaking changes.

---

## 2026-02-03: DRY Logging Utilities & Magic Number Migration

### Summary
Two-part session: (1) Adopted `logError` utility across 35 files to standardize error logging patterns, (2) Migrated 100+ magic numbers to named constants in `sidequest/core/constants.js`.

### Problems Solved
1. **Logging inconsistency**: 60+ files using `logger.error({ error }, 'message')` instead of `logError(logger, error, 'message')`
2. **Magic numbers**: Hardcoded timeouts, delays, and limits scattered across codebase (1000, 5000, 30000, 60000, etc.)
3. **Type safety**: `logError` JSDoc needed broader type annotation to accept `JobError` and other error-like objects

### Key Technical Decisions

#### Part 1: Logging Standardization
1. **Pattern transformation**: `logger.error({ error }, msg)` → `logError(logger, error, msg, context)`
2. **Type annotation fix**: Changed `@param {Error}` to `@param {Error | unknown}` in `logError` JSDoc
3. **Type assertions**: Added `/** @type {Error} */` for `JobError` types in pipeline files
4. **Preserved patterns**: Left `{ error: error.message }` unchanged (uses string, not Error object)

#### Part 2: Constants Migration
1. **New constant categories added**:
   - `TIME` - Base conversion helpers (`SECOND`, `MINUTE`, `HOUR`, `DAY`)
   - `TIMEOUTS` - Duration values (poll intervals, timeouts by severity)
   - `RETRY` - Retry/backoff delays (network, server, rate limit)
   - `CACHE` - Cache age thresholds
   - `WEBSOCKET` - Connection timing
   - `WORKER_COOLDOWN` - Cooldown timing
   - `RATE_LIMIT` - Rate limit windows
   - `LIMITS` - Size limits

2. **Scope decisions**:
   - Updated production files only (skipped test files for clarity)
   - Skipped config.js validation checks (compare against literal minimums)
   - Skipped mathematical conversions where division is the actual intent
   - Skipped frontend dashboard.js (no access to server-side constants)

### Files Modified

#### Logging Update (35 files)
- `api/`: activity-feed.js, server.js, websocket.js, middleware/validation.js, routes/*.js, utils/worker-registry.js
- `sidequest/core/`: job-repository.js
- `sidequest/workers/`: repomix-worker.js
- `sidequest/pipeline-runners/`: all 7 pipeline files
- `sidequest/pipeline-core/`: cache/scan-cache.js, config/repository-config-loader.js, doppler-health-monitor.js, git/*.js, inter-project-scanner.js, reports/report-coordinator.js
- `sidequest/bug-fixes/`: bugfix-audit-worker.js
- `sidequest/utils/`: doppler-resilience.js, report-generator.js
- `mcp-servers/duplicate-detection/`: index.js
- `scripts/`: cleanup-error-logs.js, generate-retroactive-reports.js

#### Constants Migration (34 files)
| Category | Files |
|----------|-------|
| Constants definition | `sidequest/core/constants.js` |
| Pipeline runners | duplicate-detection-pipeline.{js,ts}, git-activity-pipeline.js, schema-enhancement-pipeline.js, plugin-management-pipeline.js, test-refactor-pipeline.ts |
| Workers | repomix-worker.js, git-activity-worker.js, duplicate-detection-worker.js, claude-health-worker.js |
| Core | index.js, server.js, database.js |
| Utils | doppler-resilience.js, time-helpers.js, report-generator.js, dependency-validator.js |
| API | server.js, websocket.js, activity-feed.js, worker-registry.js, rate-limit.js, scans.ts |
| Pipeline-core | error-classifier.js, doppler-health-monitor.js, timing-helpers.js |

### Commits
- `cc9bce3` - refactor(logging): adopt logError utility across 35 files
- `6445416` - refactor(constants): migrate magic numbers to named constants

### Verification
- TypeScript: `npm run typecheck` passes
- All updated modules load correctly (verified with dynamic imports)
- Pre-commit hooks passed (including CloudFlare sync)

### Status
✅ Complete

### Patterns Discovered

1. **Error type flexibility**: When accepting errors from external sources (like job queues), use `Error | unknown` type annotation
2. **Type assertions for external types**: Use `/** @type {Error} */` for error-like objects that don't extend Error
3. **Constants organization**: Group by domain (TIMEOUTS, RETRY, CACHE) rather than by value
4. **TIME helpers**: Export base conversion constants (`SECOND = 1000`) for readable duration calculations
5. **Pre-commit sync**: CloudFlare tunnel files must be synced when modifying middleware files

### Next Steps
1. Commit the constants migration
2. Consider adding remaining Priority 2-4 logging utilities (logStart, logWarn fixes, logStage/logMetrics/logRetry)
3. Address remaining `{ err: error }` patterns if any discovered
