# Bugfix Deployment Verification Guide

Comprehensive guide for verifying bugfix deployments using `scripts/verify-bugfixes.sh`.

## Quick Start

```bash
# Run all verification checks
./scripts/verify-bugfixes.sh

# Run specific check suites
./scripts/verify-bugfixes.sh --pre      # Pre-deployment checks
./scripts/verify-bugfixes.sh --post     # Post-deployment verification
./scripts/verify-bugfixes.sh --health   # Health checks
./scripts/verify-bugfixes.sh --smoke    # Smoke tests
./scripts/verify-bugfixes.sh --rollback # Create rollback script
```

## What This Script Verifies

### Recent Bugfixes Covered

1. **Doppler Circuit Breaker Initialization** (Issue #1)
   - Verifies DopplerHealthMonitor can initialize
   - Checks circuit breaker state and cache age
   - Tests fallback behavior

2. **Server Port Binding with Fallback** (Issue #2)
   - Verifies port manager can bind to configured port
   - Tests automatic fallback to next available port
   - Validates graceful shutdown works

3. **Activity Feed Null Error Handling** (Issue #3)
   - Tests activity feed handles null errors without crashing
   - Verifies error serialization is safe
   - Checks WebSocket broadcasts work

4. **Pipeline Script Permissions** (Issue #4)
   - Validates pipeline scripts have proper shebangs
   - Checks PM2 uses node interpreter (prevents permission errors)
   - Verifies scripts can be executed

5. **PM2 Configuration Validation** (Issue #5)
   - Validates config/ecosystem.config.cjs syntax
   - Checks restart delay settings (prevents crash loops)
   - Verifies exponential backoff configuration

## Check Suites

### 1. Pre-Deployment Checks (`--pre`)

Run these **before deploying** to catch issues early:

- ✅ Verify new files exist (doppler-health-monitor.js, port-manager.js, etc.)
- ✅ Check shebangs on pipeline scripts
- ✅ Validate PM2 configuration syntax
- ✅ Run TypeScript type checks
- ✅ Run unit tests
- ✅ Run integration tests
- ✅ Verify Doppler connection and secrets
- ✅ Check script permissions

**Exit Code:** 0 if all checks pass, 1 if any fail

**Example Output:**
```
═══════════════════════════════════════════════════════
  Pre-Deployment Checks
═══════════════════════════════════════════════════════

▸ Verifying New Files

✓ File exists: sidequest/pipeline-core/doppler-health-monitor.js
✓ File exists: api/utils/port-manager.js
✓ File exists: api/activity-feed.js
✓ File exists: api/event-broadcaster.js

▸ Checking Pipeline Script Shebangs

✓ Shebang present: sidequest/pipeline-runners/duplicate-detection-pipeline.js
⚠ No shebang in: sidequest/pipeline-runners/git-activity-pipeline.js (OK if using node interpreter in PM2)
...
```

### 2. Post-Deployment Verification (`--post`)

Run these **after deployment** to verify the system is running correctly:

- ✅ Check PM2 processes are running (aleph-dashboard, aleph-worker)
- ✅ Verify process status is "online"
- ✅ Check for excessive restarts (indicates crash loops)
- ✅ Test Doppler health monitor initialization
- ✅ Verify server binds to configured port
- ✅ Test activity feed null error handling
- ✅ Verify pipeline scripts can be executed by node

**Exit Code:** 0 if all checks pass, 1 if any fail

**Example Output:**
```
═══════════════════════════════════════════════════════
  Post-Deployment Verification
═══════════════════════════════════════════════════════

▸ Verifying PM2 Processes

✓ PM2 installed
✓ aleph-dashboard process online
✓ aleph-worker process online
✓ aleph-dashboard restarts: 1 (normal)

▸ Testing Doppler Health Monitor

✓ Doppler health monitor initializes successfully
      Cache age: 2 hours
...
```

### 3. Health Checks (`--health`)

Verify all system endpoints and dependencies:

- ✅ GET /health endpoint responds
- ✅ GET /api/health/doppler shows circuit state
- ✅ WebSocket connection successful
- ✅ Redis connection healthy (via queue stats)
- ✅ Sentry SDK initialized

**Exit Code:** 0 if all checks pass, 1 if any fail

**Example Output:**
```
═══════════════════════════════════════════════════════
  Health Checks
═══════════════════════════════════════════════════════

▸ Testing /health Endpoint

✓ GET /health returns 200 with healthy status

▸ Testing /api/health/doppler Endpoint

✓ GET /api/health/doppler returns circuit state (status: healthy)
      Cache age: 2h (healthy)
...
```

### 4. Smoke Tests (`--smoke`)

Quick end-to-end tests:

- ✅ Create a test job via API
- ✅ Verify job appears in Activity Feed
- ✅ Verify port fallback mechanism configured
- ✅ Test Doppler circuit breaker fallback cache

**Exit Code:** 0 if all checks pass, 1 if any fail

**Example Output:**
```
═══════════════════════════════════════════════════════
  Smoke Tests
═══════════════════════════════════════════════════════

▸ Creating Test Job

✓ Test job created: scan_1732467890_abc123

▸ Verifying Activity Feed

✓ Activity feed has 5 activities
...
```

### 5. Rollback Script Creation (`--rollback`)

Creates a rollback script if issues are found:

- ✅ Generate `scripts/rollback-bugfixes.sh`
- ✅ Backup PM2 process state
- ✅ Document rollback procedure

**Output:**
```
═══════════════════════════════════════════════════════
  Creating Rollback Script
═══════════════════════════════════════════════════════

✓ Rollback script created: scripts/rollback-bugfixes.sh
✓ PM2 process state backed up
```

## Typical Deployment Workflow

### Before Deployment

```bash
# 1. Run pre-deployment checks
./scripts/verify-bugfixes.sh --pre

# 2. Fix any failures
npm run typecheck     # If TypeScript errors
npm test              # If unit tests fail
chmod +x scripts/*    # If permission errors

# 3. Create rollback script (just in case)
./scripts/verify-bugfixes.sh --rollback
```

### During Deployment

```bash
# Deploy using existing script
./scripts/deploy-traditional-server.sh --update
```

### After Deployment

```bash
# 1. Run post-deployment checks
./scripts/verify-bugfixes.sh --post

# 2. Run health checks
./scripts/verify-bugfixes.sh --health

# 3. Run smoke tests
./scripts/verify-bugfixes.sh --smoke

# 4. If all pass, deployment is verified!
# If any fail, check logs and consider rollback
```

### If Issues Found

```bash
# Option 1: Check logs
pm2 logs aleph-dashboard --lines 100

# Option 2: Rollback
./scripts/rollback-bugfixes.sh

# Option 3: Manual fixes
doppler run -- pm2 restart config/ecosystem.config.cjs --update-env
```

## Understanding Check Results

### ✓ Green Checkmark
- Check passed successfully
- No action needed

### ✗ Red X
- Check failed critically
- Must be fixed before deployment
- Deployment may fail or be unstable

### ⚠ Yellow Warning
- Check has minor issues or cannot be fully verified
- Review the warning but may be OK to proceed
- Examples:
  - Doppler cache is stale (can refresh with `doppler run --command=echo`)
  - Server not running (expected if not deployed yet)
  - WebSocket test skipped (wscat not installed)

## Common Issues & Solutions

### Issue: "TypeScript type checks failed"

**Solution:**
```bash
npm run typecheck  # See detailed errors
# Fix type errors, then re-run verification
```

### Issue: "PM2 config has syntax errors"

**Solution:**
```bash
node -c config/ecosystem.config.cjs  # See syntax errors
# Fix syntax, then re-run verification
```

### Issue: "Doppler cache is critically stale"

**Solution:**
```bash
# Refresh Doppler cache
doppler run --command=echo

# Or restart server with fresh secrets
doppler run -- pm2 restart config/ecosystem.config.cjs --update-env
```

### Issue: "aleph-dashboard has 10+ restarts"

**Solution:**
```bash
# Check logs for crash reason
pm2 logs aleph-dashboard --lines 100

# Common causes:
# 1. Port already in use (restart delay should fix)
# 2. Missing env variables (check Doppler)
# 3. Code errors (check git log, consider rollback)
```

### Issue: "Server not listening on port 8080"

**Solution:**
```bash
# Check if server is running
pm2 status

# Check if port is configured correctly
doppler secrets get JOBS_API_PORT

# Check if another process is using the port
lsof -i :8080

# If port-manager working correctly, server should auto-fallback to 8081+
```

### Issue: "Activity feed handles null errors" fails

**Solution:**
This indicates a regression in the Activity Feed fix. Check:
```bash
# Verify error-helpers.js is up to date
git diff api/activity-feed.js
git diff sidequest/pipeline-core/utils/error-helpers.js

# Check for import errors
node -c api/activity-feed.js
```

## Check Dependencies

### Required
- Node.js (v18+)
- npm
- Doppler CLI
- jq (JSON processor)

### Optional
- PM2 (for post-deployment checks)
- wscat (for WebSocket tests): `npm install -g wscat`
- lsof (for port checks, usually pre-installed on macOS/Linux)

### Installing Dependencies

```bash
# Install jq (macOS)
brew install jq

# Install jq (Ubuntu)
sudo apt-get install jq

# Install wscat (optional)
npm install -g wscat

# Install Doppler CLI
brew install dopplerhq/cli/doppler  # macOS
# or see https://docs.doppler.com/docs/install-cli
```

## CI/CD Integration

Add to your deployment pipeline:

```yaml
# Example GitHub Actions
- name: Pre-deployment verification
  run: ./scripts/verify-bugfixes.sh --pre

- name: Deploy
  run: ./scripts/deploy-traditional-server.sh --update

- name: Post-deployment verification
  run: |
    sleep 10  # Wait for services to start
    ./scripts/verify-bugfixes.sh --post
    ./scripts/verify-bugfixes.sh --health
    ./scripts/verify-bugfixes.sh --smoke

- name: Create rollback script
  if: failure()
  run: ./scripts/verify-bugfixes.sh --rollback
```

## Exit Codes

- `0`: All checks passed
- `1`: One or more checks failed

Use in scripts:
```bash
if ./scripts/verify-bugfixes.sh --pre; then
  echo "Pre-deployment checks passed!"
else
  echo "Pre-deployment checks failed - fix issues before deploying"
  exit 1
fi
```

## Maintenance

### Updating Verification Script

When adding new bugfixes, update `scripts/verify-bugfixes.sh`:

1. Add new file paths to `pre_deployment_checks()` if new files were created
2. Add new tests to `post_deployment_checks()` if new behavior needs verification
3. Add new health endpoints to `health_checks()` if new endpoints were added
4. Update this documentation

### Regular Verification

Run periodically to ensure system health:

```bash
# Weekly health check
./scripts/verify-bugfixes.sh --health

# Before major changes
./scripts/verify-bugfixes.sh --all
```

## Related Documentation

- `/docs/deployment/TRADITIONAL_SERVER_DEPLOYMENT.md` - Deployment guide
- `/docs/architecture/ERROR_HANDLING.md` - Error handling patterns
- `/config/ecosystem.config.cjs` - PM2 configuration
- `/scripts/deploy-traditional-server.sh` - Deployment script

## Changelog

### v1.0.0 (2025-11-24)
- Initial release
- Covers 5 recent bugfixes:
  1. Doppler circuit breaker initialization
  2. Server port binding with fallback
  3. Activity feed null error handling
  4. Pipeline script permissions
  5. PM2 configuration validation
- 4 check suites: pre-deployment, post-deployment, health, smoke
- Rollback script generation
- 30+ individual checks

---

**Last Updated:** 2025-11-24
**Script Version:** 1.0.0
**Maintainer:** AlephAuto Team
