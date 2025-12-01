# CI/CD Pipeline Updates
**Date:** 2025-11-26
**Updated Files:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

## Changes Summary

Enhanced the GitHub Actions deployment pipeline to follow AlephAuto best practices and verify bugfixes are deployed correctly. Added TypeScript type dependency fixes for CI environment.

## Changes Made

### 0. Fixed TypeScript @types/node Installation in CI (2025-11-26)

**File:** `.github/workflows/ci.yml`

**Problem:**
TypeScript compilation was failing in CI with errors:
```
error TS2307: Cannot find module 'path' or its corresponding type declarations.
error TS2580: Cannot find name 'process'. Do you need to install type definitions for node?
```

**Root Cause:**
CI was running `npm ci` without ensuring dev dependencies were installed, causing `@types/node` to be missing.

**Solution:**
Updated the CI workflow to explicitly install dev dependencies:

```yaml
- name: Install Node.js dependencies
  run: NODE_ENV=development npm ci --include=dev --omit=optional
```

**Additional Improvements:**
1. Added `@types/node` to package.json devDependencies as explicit dependency
2. Created `scripts/fix-types.js` utility for local type fix automation
3. Enhanced `scripts/verify-setup.js` to check for @types/node availability
4. Added `npm run fix:types` script for quick fixes

**Related Documentation:**
- `docs/runbooks/fix-missing-types.md` - Complete troubleshooting guide

---

### 1. Updated npm install to use Doppler (Line 92)

**Before:**
```yaml
# Install Node.js dependencies
npm ci --production --omit=optional
```

**After:**
```yaml
# Install Node.js dependencies with Doppler
doppler run -- npm install --production --omit=optional
```

**Rationale:**
- Follows Critical Pattern #1 from CLAUDE.md: "Doppler Required for ALL Commands"
- Ensures environment variables are loaded during dependency installation
- Prevents "secrets won't load" issues documented in project guidelines
- Changed from `npm ci` to `npm install` to allow `doppler run --` wrapper (Doppler cannot wrap `ci` command directly)

### 2. Simplified PM2 restart logic (Lines 100-122)

**Before:**
```yaml
# Restart or start dashboard
if pm2 describe aleph-dashboard > /dev/null 2>&1; then
  doppler run -- pm2 restart aleph-dashboard
else
  doppler run -- pm2 start api/server.js --name aleph-dashboard
fi

# Restart or start duplicate detection worker
if pm2 describe aleph-worker > /dev/null 2>&1; then
  doppler run -- pm2 restart aleph-worker
else
  doppler run -- pm2 start config/ecosystem.config.cjs
fi
```

**After:**
```yaml
# Check if services are already running
if pm2 list | grep -q "aleph-dashboard\|aleph-worker"; then
  echo "Services found, restarting with config/ecosystem.config.cjs..."
  doppler run -- pm2 restart config/ecosystem.config.cjs
else
  echo "Services not found, starting with config/ecosystem.config.cjs..."
  doppler run -- pm2 start config/ecosystem.config.cjs
fi
```

**Rationale:**
- Uses single source of truth (config/ecosystem.config.cjs) for both start and restart
- Eliminates potential configuration drift between manual start and ecosystem config
- Simpler logic: one command for both services instead of two separate blocks
- Consistent with production deployment patterns documented in TRADITIONAL_SERVER_DEPLOYMENT.md

### 3. Enhanced health checks with bugfix verification (Lines 124-176)

**Added health checks:**

#### a) Doppler Health Monitor Check (Lines 150-157)
```yaml
# Check Doppler health monitor (Bugfix E4 verification)
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/health/doppler)
if [ "$RESPONSE" -eq 200 ]; then
  echo "✅ Doppler health monitor is active"
else
  echo "❌ Doppler health monitor check failed (HTTP $RESPONSE)"
  exit 1
fi
```

**Purpose:** Verifies bugfix E4 (Doppler health monitoring) is deployed and functional

#### b) Pipeline Count Verification (Lines 159-166)
```yaml
# Verify bugfix E1: Dashboard returns all pipelines
PIPELINE_COUNT=$(curl -s http://localhost:8080/api/status | jq '.pipelines | length')
if [ "$PIPELINE_COUNT" -ge 7 ]; then
  echo "✅ Dashboard returns $PIPELINE_COUNT pipelines (E1 verified)"
else
  echo "❌ Dashboard only returns $PIPELINE_COUNT pipelines, expected >= 7"
  exit 1
fi
```

**Purpose:** Verifies bugfix E1 (dashboard returns all pipelines, not just 1) is deployed

#### c) Pagination Endpoint Check (Lines 168-176)
```yaml
# Verify bugfix E2: Pagination returns accurate totals
REPOMIX_RESPONSE=$(curl -s 'http://localhost:8080/api/sidequest/pipeline-runners/repomix/jobs?limit=10')
REPOMIX_STATUS=$(echo $REPOMIX_RESPONSE | jq -r '.total // "skip"')
if [ "$REPOMIX_STATUS" != "skip" ] && [ "$REPOMIX_STATUS" != "null" ]; then
  echo "✅ Pagination endpoint working (E2 verified)"
else
  echo "⚠️ Pagination endpoint returned no data (may be normal for new deployment)"
fi
```

**Purpose:** Verifies bugfix E2 (pagination returns accurate database totals) is deployed

**Note:** This check is lenient (warning only) because new deployments may not have job data yet.

## Benefits

### Reliability Improvements
- ✅ Prevents environment variable loading issues during npm install
- ✅ Ensures consistent configuration between start/restart operations
- ✅ Catches regressions in bugfixes before production impact

### Visibility Improvements
- ✅ Explicit verification that each bugfix is deployed correctly
- ✅ Clear error messages if health checks fail
- ✅ Deployment log shows bugfix verification status

### Maintenance Improvements
- ✅ Single source of truth (config/ecosystem.config.cjs) reduces configuration drift
- ✅ Simpler deployment logic is easier to understand and debug
- ✅ Automated verification reduces manual testing burden

## Testing the Pipeline

### Prerequisites
Ensure GitHub Secrets are configured:
- `DOPPLER_TOKEN` - Doppler service token for production config
- `DEPLOY_HOST` - Production server hostname
- `DEPLOY_USER` - SSH username for deployment
- `DEPLOY_SSH_KEY` - Private SSH key for authentication
- `DEPLOY_PATH` - Absolute path to deployment directory on server

### Manual Trigger
```bash
# Trigger deployment via GitHub UI
1. Go to Actions → CD - Production Deployment
2. Click "Run workflow"
3. Select branch (main)
4. Click "Run workflow"
```

### Verify Success
Check the Actions log for:
```
✅ Redis is healthy
✅ Dashboard is healthy
✅ Doppler health monitor is active
✅ Dashboard returns 9 pipelines (E1 verified)
✅ Pagination endpoint working (E2 verified)
```

## Rollback

If deployment fails, the pipeline will automatically attempt rollback:

```yaml
- name: Rollback on failure
  if: failure()
  script: |
    cd ${{ secrets.DEPLOY_PATH }}
    echo "⚠️ Deployment failed, attempting rollback..."
    pm2 resurrect
```

To manually rollback:
```bash
# SSH to production server
ssh user@n0ai.app

cd /path/to/jobs
git log -1  # Note current commit
pm2 stop all
git reset --hard <previous-commit>
doppler run -- pm2 restart config/ecosystem.config.cjs
```

## Related Documentation

- **Bugfix Plan:** `~/dev/active/bugfix-alephauto-errors-2025-11-24/plan.md`
- **Production Deployment:** `~/dev/active/bugfix-alephauto-errors-2025-11-24/PRODUCTION_DEPLOYMENT_NEEDED.md`
- **Traditional Deployment Guide:** `docs/deployment/TRADITIONAL_SERVER_DEPLOYMENT.md`
- **Critical Patterns:** `CLAUDE.md` (sections: Doppler Required, PM2 Configuration)
- **Error Handling:** `docs/architecture/ERROR_HANDLING.md`

## Next Steps

1. ✅ Commit these CI/CD changes to main branch
2. ⏳ Trigger manual deployment to production
3. ⏳ Verify all health checks pass in Actions log
4. ⏳ Test production dashboard at https://n0ai.app
5. ⏳ Monitor for 24 hours to confirm stability

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2025-11-24 | Claude Code | Added Doppler to npm install, simplified PM2 restart, added bugfix verification health checks |
