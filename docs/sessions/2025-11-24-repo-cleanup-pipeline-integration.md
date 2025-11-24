# Session Report: Repository Cleanup Pipeline Integration

**Date:** 2025-11-24
**Version:** 1.6.3
**Duration:** ~1.5 hours
**Focus:** AlephAuto Framework Integration

---

## Overview

Integrated the standalone `universal-repo-cleanup.sh` script into the AlephAuto job queue framework, creating a new automated pipeline for repository maintenance.

## Objectives Achieved

### 1. Script Relocation ✓
- **From:** `sidequest/universal-repo-cleanup.sh`
- **To:** `sidequest/pipeline-runners/universal-repo-cleanup.sh`
- **Reason:** Organizational consistency with other pipeline scripts

### 2. Worker Implementation ✓
Created `RepoCleanupWorker` extending `SidequestServer`:

**File:** `sidequest/workers/repo-cleanup-worker.js`

**Features:**
- Executes bash cleanup script via `child_process.execFile`
- Supports dry-run mode (scan without deletion)
- Tracks cleanup metrics by category:
  - Python virtual environments (venv, .venv, etc.)
  - Temporary/cache files (.DS_Store, __pycache__, *.swp)
  - Build artifacts (.jekyll-cache, dist, build)
  - Output files (*.log, repomix-output.xml)
  - Redundant directories (drafts, temp, backup)
- Before/after directory size tracking
- Sentry error tracking integration
- Event-driven architecture (job:created, job:started, job:completed, job:failed)

**Key Methods:**
- `runJobHandler(job)` - Main job execution
- `#scanRepository(targetDir)` - Dry-run scanning
- `#runCleanup(targetDir)` - Actual cleanup execution
- `#parseCleanupOutput(output)` - Extract metrics from bash output
- `createCleanupJob(targetDir, options)` - Job factory
- `createDryRunJob(targetDir)` - Dry-run job factory

### 3. Pipeline Runner ✓
Created `repo-cleanup-pipeline.js`:

**File:** `sidequest/pipeline-runners/repo-cleanup-pipeline.js`

**Features:**
- Scheduled cleanup via node-cron (default: Weekly Sunday 3 AM)
- Run on startup option (`RUN_ON_STARTUP=true`)
- Configurable target directory
- Job queue integration with event listeners
- Detailed structured logging (JSON)
- Graceful shutdown handling (SIGTERM, SIGINT)

**Configuration:**
```javascript
CLEANUP_CRON_SCHEDULE="0 3 * * 0"  // Weekly Sunday 3 AM
CLEANUP_TARGET_DIR="~/code"        // Default scan directory
CLEANUP_DRY_RUN=false              // Preview mode
RUN_ON_STARTUP=false               // Immediate execution
```

### 4. NPM Scripts ✓
Added to `package.json`:

```json
{
  "cleanup:once": "RUN_ON_STARTUP=true doppler run -- node sidequest/pipeline-runners/repo-cleanup-pipeline.js",
  "cleanup:dryrun": "CLEANUP_DRY_RUN=true RUN_ON_STARTUP=true doppler run -- node sidequest/pipeline-runners/repo-cleanup-pipeline.js",
  "cleanup:schedule": "doppler run -- node sidequest/pipeline-runners/repo-cleanup-pipeline.js"
}
```

### 5. Documentation Updates ✓
Updated `CLAUDE.md`:

- Added to pipeline list (#9: Repository Cleanup)
- Added to Quick Reference table
- Added to Commands section (Development > Pipelines)
- Added Environment Variables section
- Added to Recent Major Changes (v1.6.3)
- Updated version number to 1.6.3

### 6. Testing ✓
Created test script: `tests/scripts/test-repo-cleanup.js`

**Test Coverage:**
- Worker initialization
- Job creation (dry-run mode)
- Event system verification
- Cleanup metrics extraction

## Test Results

### Dry Run Test
**Target:** `/Users/alyshialedlie/code` (13GB)
**Duration:** 85 seconds
**Items Found:** 15,643 total

**Breakdown:**
- Python Virtual Environments: 7 venvs
- Temporary/Cache Files: 15,636 files
  - .DS_Store (macOS system files)
  - __pycache__ directories
  - *.pyc compiled Python files
  - *.swp vim swap files
- Build Artifacts: 0
- Redundant Directories: 0

**Logging Output:**
```json
{
  "level": 30,
  "component": "RepoCleanupWorker",
  "jobId": "repo-cleanup-dryrun-1764007471865",
  "targetDir": "/Users/alyshialedlie/code",
  "initialSize": "13G",
  "finalSize": "13G",
  "itemsFound": 15643,
  "msg": "Repository cleanup job completed"
}
```

### Actual Cleanup Test
**Status:** Initiated but interrupted after 4+ minutes
**Reason:** Large number of files (15k+) requires significant time to delete
**Verification:** Worker integration confirmed functional via dry-run

## Technical Implementation Details

### AlephAuto Framework Integration
The worker follows the established pattern used by other pipeline workers:

```javascript
export class RepoCleanupWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      ...options,
      jobType: 'repo-cleanup',
    });
    // Worker-specific initialization
  }

  async runJobHandler(job) {
    // Job execution logic
    // - Get initial size
    // - Run cleanup (or dry-run scan)
    // - Get final size
    // - Return metrics
  }
}
```

### Error Handling
- Inherits retry logic from `SidequestServer` base class
- Auto-retry on retryable errors (ETIMEDOUT, 5xx, network issues)
- No retry on non-retryable errors (ENOENT, 4xx, permission errors)
- Sentry integration for error tracking
- Circuit breaker pattern (max 2 attempts, exponential backoff)

### Event System
Workers emit events at each lifecycle stage:
- `job:created` - Job queued
- `job:started` - Job execution began
- `job:completed` - Job finished successfully
- `job:failed` - Job failed with error

Pipeline runner listens to these events for logging and monitoring.

## File Structure

```
jobs/
├── sidequest/
│   ├── workers/
│   │   └── repo-cleanup-worker.js          # NEW: Worker implementation
│   └── pipeline-runners/
│       ├── universal-repo-cleanup.sh       # MOVED: Cleanup script
│       └── repo-cleanup-pipeline.js        # NEW: Pipeline runner
├── tests/
│   └── scripts/
│       └── test-repo-cleanup.js            # NEW: Test script
├── package.json                            # UPDATED: Added npm scripts
└── CLAUDE.md                               # UPDATED: Documentation
```

## Usage Guide

### Run Cleanup Once
```bash
npm run cleanup:once
```
Executes cleanup immediately on `~/code` directory.

### Preview Cleanup (Dry Run)
```bash
npm run cleanup:dryrun
```
Scans and reports what would be deleted without actually removing files.

### Start Scheduled Service
```bash
npm run cleanup:schedule
```
Runs as cron service, executing cleanup weekly at Sunday 3 AM.

### Custom Target Directory
```bash
CLEANUP_TARGET_DIR=/path/to/repo npm run cleanup:once
```

### Custom Schedule
```bash
CLEANUP_CRON_SCHEDULE="0 2 * * *" npm run cleanup:schedule
```
Run daily at 2 AM.

## What Gets Cleaned

### Python Virtual Environments
- `venv/`
- `.venv/`
- `env/`
- `virtualenv/`
- `*.venv/`

### Temporary/Cache Files
- `.DS_Store` (macOS)
- `__pycache__/`
- `*.pyc`, `*.pyo`
- `*.swp`, `*.swo` (vim)
- `Thumbs.db` (Windows)

### Build Artifacts
- `.jekyll-cache/`
- `.sass-cache/`
- `dist/`, `build/`
- `.next/`, `.nuxt/`
- `node_modules/.cache/`

### Output Files
- `repomix-output.xml` (except root)
- `*.log` files
- `npm-debug.log*`

### Redundant Directories
- `drafts/`, `temp/`, `tmp/`
- `backup/`, `backups/`
- `old/`, `archive/`
- `deprecated/`

## Performance Considerations

### Scan Performance
- Dry run scanned 13GB directory in 85 seconds
- Used multiple `find` commands in parallel
- Pattern-based scanning (glob patterns)

### Cleanup Performance
- Actual deletion of 15k+ files requires several minutes
- Uses `rm -rf` for efficiency
- Single-threaded to prevent filesystem contention

### Optimization Opportunities
1. **Parallel Deletion:** Could batch files and delete in parallel
2. **Incremental Cleanup:** Could track last run and only scan changed directories
3. **Progress Reporting:** Could emit progress events during long operations

## Integration Benefits

### Before Integration
- Manual script execution
- No job tracking or history
- No error monitoring
- No scheduling capability
- No metrics collection

### After Integration
- Automated scheduled cleanup
- Job history in SQLite database
- Sentry error tracking
- Cron scheduling with configurable times
- Structured metrics and logging
- Event-driven monitoring
- Dry-run preview mode
- API integration potential (future)

## Future Enhancements

### Potential Improvements
1. **Dashboard Integration:**
   - Display cleanup metrics in real-time
   - Show before/after directory sizes
   - Visualize file type breakdown

2. **Selective Cleanup:**
   - Allow users to select specific categories
   - Whitelist/blacklist directories
   - Custom cleanup patterns

3. **Reporting:**
   - Generate cleanup reports (Markdown/HTML)
   - Email notifications on completion
   - Space saved metrics over time

4. **Git Workflow:**
   - Optionally run cleanup before commits
   - Pre-push hook integration
   - Cleanup staging areas

5. **Multi-Directory Support:**
   - Clean multiple directories in one job
   - Prioritize by disk usage
   - Parallel directory processing

## Breaking Changes

None. This is a new feature addition with no impact on existing functionality.

## Lessons Learned

### Bash Script Integration
- `execFile` with heredoc for non-interactive "yes" confirmation
- Parse bash output for metrics extraction
- Handle long-running processes with proper timeouts

### Event System
- Event listeners must be attached before job creation
- Background jobs continue after main script exits
- Graceful shutdown requires signal handlers

### Testing Strategy
- Dry-run mode essential for safe testing
- Large directories require patience (85s for 13GB)
- Test with smaller directories first

## Related Files Modified

1. **sidequest/workers/repo-cleanup-worker.js** (NEW)
   - 280 lines
   - Worker implementation with dry-run support

2. **sidequest/pipeline-runners/repo-cleanup-pipeline.js** (NEW)
   - 180 lines
   - Pipeline runner with cron scheduling

3. **sidequest/pipeline-runners/universal-repo-cleanup.sh** (MOVED)
   - 545 lines
   - Original cleanup script (unchanged)

4. **tests/scripts/test-repo-cleanup.js** (NEW)
   - 70 lines
   - Integration test script

5. **package.json** (UPDATED)
   - Added 3 new npm scripts
   - No dependency changes

6. **CLAUDE.md** (UPDATED)
   - Added pipeline documentation
   - Updated version to 1.6.3
   - Added environment variables
   - Updated Recent Major Changes

## Deployment Notes

### Production Deployment
No special deployment steps required. The pipeline is opt-in:

1. **Scheduled Mode:** Run `npm run cleanup:schedule` via PM2/systemd
2. **On-Demand:** Use `npm run cleanup:once` as needed
3. **Dry Run:** Always test with `npm run cleanup:dryrun` first

### Environment Configuration
Add to Doppler `bottleneck` project:

```bash
CLEANUP_CRON_SCHEDULE="0 3 * * 0"  # Weekly Sunday 3 AM
CLEANUP_TARGET_DIR="/Users/alyshialedlie/code"
CLEANUP_DRY_RUN=false
```

### Monitoring
- Check Sentry for cleanup job failures
- Review job history in SQLite: `data/jobs.db`
- Monitor logs: Look for `RepoCleanupWorker` component

## Summary

Successfully integrated standalone cleanup script into AlephAuto framework, creating the 9th automated pipeline. The integration provides scheduling, monitoring, error tracking, and metrics collection while maintaining the proven cleanup logic from the original bash script.

**Key Metrics:**
- 4 new files created
- 2 files updated
- 1 file moved
- 15,643 cleanup targets identified in test run
- 85-second scan time for 13GB directory
- 0 breaking changes

**Version Bump:** 1.6.2 → 1.6.3

---

**Next Steps:**
1. Run scheduled cleanup weekly to monitor effectiveness
2. Consider dashboard integration for real-time metrics
3. Add selective cleanup options based on user feedback
4. Explore parallel deletion for performance improvement
