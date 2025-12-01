# Bugfix Verification Quick Reference

Fast reference for deployment verification commands and expected outputs.

## Quick Commands

```bash
# Full verification suite (all checks)
npm run verify:bugfixes

# Individual check suites
npm run verify:bugfixes:pre      # Before deployment
npm run verify:bugfixes:post     # After deployment
npm run verify:bugfixes:health   # Health checks
npm run verify:bugfixes:smoke    # Smoke tests

# Direct script access
./scripts/verify-bugfixes.sh --all
./scripts/verify-bugfixes.sh --rollback  # Create rollback script
```

## Deployment Checklist

### Before Deployment

- [ ] `npm run verify:bugfixes:pre` - All checks pass
- [ ] `npm run typecheck` - No TypeScript errors
- [ ] `npm test` - All unit tests pass
- [ ] `npm run test:integration` - All integration tests pass
- [ ] `./scripts/verify-bugfixes.sh --rollback` - Rollback script created

### After Deployment

- [ ] `npm run verify:bugfixes:post` - Post-deployment checks pass
- [ ] `npm run verify:bugfixes:health` - All health checks green
- [ ] `npm run verify:bugfixes:smoke` - Smoke tests pass
- [ ] `pm2 status` - All processes online
- [ ] `pm2 logs aleph-dashboard --lines 20 --nostream` - No errors

## Expected Results

### Pre-Deployment (30+ checks)

**Critical Files:**
```
✓ File exists: sidequest/pipeline-core/doppler-health-monitor.js
✓ File exists: api/utils/port-manager.js
✓ File exists: api/activity-feed.js
✓ File exists: api/event-broadcaster.js
```

**PM2 Configuration:**
```
✓ PM2 config syntax valid
✓ PM2 config uses node interpreter (prevents permission errors)
✓ PM2 config has restart delay (prevents rapid crash loops)
```

**Tests:**
```
✓ TypeScript type checks passed
✓ Unit tests passed
✓ Integration tests passed
```

**Doppler:**
```
✓ Doppler CLI installed
✓ Doppler configured for project
✓ Doppler secret exists: JOBS_API_PORT
✓ Doppler secret exists: REDIS_HOST
```

### Post-Deployment (15+ checks)

**PM2 Processes:**
```
✓ PM2 installed
✓ aleph-dashboard process online
✓ aleph-worker process online
✓ aleph-dashboard restarts: 1 (normal)
```

**Doppler Health Monitor:**
```
✓ Doppler health monitor initializes successfully
      Cache age: 2 hours
✓ Doppler health check successful
```

**Server:**
```
✓ Server listening on port 8080
✓ Script can be executed with node: duplicate-detection-pipeline.js
```

**Activity Feed:**
```
✓ Activity feed handles null errors gracefully
```

### Health Checks (5+ checks)

**Endpoints:**
```
✓ GET /health returns 200 with healthy status
✓ GET /api/health/doppler returns circuit state (status: healthy)
      Cache age: 2h (healthy)
```

**Dependencies:**
```
✓ WebSocket connection successful
✓ Redis connection healthy (queue stats available)
✓ Sentry DSN configured in Doppler
```

### Smoke Tests (4+ checks)

**End-to-End:**
```
✓ Test job created: scan_1732467890_abc123
✓ Activity feed has 5 activities
✓ Port fallback mechanism configured (current port: 8080)
✓ Doppler fallback cache exists (age: 2h)
```

## Common Warnings (OK to Ignore)

```
⚠ No shebang in: git-activity-pipeline.js (OK if using node interpreter in PM2)
⚠ Doppler cache is 15h old (run 'doppler run --command=echo' to refresh)
⚠ aleph-worker process not online (status: stopped)  # OK if not using cron worker
⚠ wscat not installed (skip WebSocket test)
⚠ Server not running - cannot test port fallback  # Before deployment
```

## Critical Failures (Must Fix)

```
✗ Missing file: sidequest/pipeline-core/doppler-health-monitor.js
✗ PM2 config has syntax errors
✗ TypeScript type checks failed
✗ Unit tests failed
✗ aleph-dashboard process not online (status: errored)
✗ aleph-dashboard has 10 restarts (may indicate instability)
✗ Activity feed crashes on null error
```

## Quick Fixes

### TypeScript Errors
```bash
npm run typecheck  # See errors
# Fix types, then verify again
```

### PM2 Restart Loops
```bash
pm2 logs aleph-dashboard --lines 50  # Find error
pm2 restart aleph-dashboard          # Try restart
doppler run -- pm2 restart config/ecosystem.config.cjs --update-env  # Refresh env
```

### Stale Doppler Cache
```bash
doppler run --command=echo  # Refresh cache
npm run verify:bugfixes:health  # Verify fix
```

### Port Already in Use
```bash
lsof -i :8080  # Find process
kill -9 <PID>  # Kill process
# OR let port-manager fallback to 8081+
```

### Server Won't Start
```bash
# Check PM2 logs
pm2 logs aleph-dashboard --lines 100

# Check Doppler secrets
doppler secrets

# Check node version
node --version  # Should be v18+

# Try manual start
cd /Users/alyshialedlie/code/jobs
doppler run -- node api/server.js
```

## Exit Codes

```
0 = All checks passed (deploy safely)
1 = One or more checks failed (DO NOT deploy)
```

## Integration with Deployment

### Manual Deployment
```bash
# 1. Pre-deployment
npm run verify:bugfixes:pre || exit 1

# 2. Deploy
./scripts/deploy-traditional-server.sh --update

# 3. Post-deployment
sleep 10  # Wait for startup
npm run verify:bugfixes:post
npm run verify:bugfixes:health
npm run verify:bugfixes:smoke

# 4. Monitor
pm2 monit
```

### CI/CD Pipeline
```yaml
pre-deploy:
  script: npm run verify:bugfixes:pre

deploy:
  script: ./scripts/deploy-traditional-server.sh --update

verify:
  script: |
    sleep 10
    npm run verify:bugfixes:post
    npm run verify:bugfixes:health
    npm run verify:bugfixes:smoke
```

## Rollback Procedure

If verification fails after deployment:

```bash
# 1. Create rollback script
./scripts/verify-bugfixes.sh --rollback

# 2. Execute rollback
./scripts/rollback-bugfixes.sh

# 3. Verify rollback
pm2 status
pm2 logs aleph-dashboard

# 4. Investigate issues
pm2 logs aleph-dashboard --lines 100
git log --oneline -5
```

## Summary Format

Every verification run ends with:

```
═══════════════════════════════════════════════════════
  Summary
═══════════════════════════════════════════════════════

  Passed:   45
  Failed:   0
  Warnings: 3

✓ All checks passed!
```

or:

```
═══════════════════════════════════════════════════════
  Summary
═══════════════════════════════════════════════════════

  Passed:   42
  Failed:   3
  Warnings: 2

✗ 3 check(s) failed
```

## Files Created

Running `--rollback` creates:

- `scripts/rollback-bugfixes.sh` - Rollback script
- `~/.pm2/dump.pm2.bak` - PM2 process state backup

## Dependencies

**Required:**
- Node.js v18+
- npm
- Doppler CLI
- jq

**Optional:**
- PM2 (post-deployment checks)
- wscat (WebSocket tests): `npm install -g wscat`

**Install:**
```bash
brew install jq dopplerhq/cli/doppler  # macOS
npm install -g wscat pm2               # Optional
```

## Related Docs

- `docs/deployment/BUGFIX_VERIFICATION.md` - Full guide
- `docs/deployment/TRADITIONAL_SERVER_DEPLOYMENT.md` - Deployment guide
- `scripts/verify-bugfixes.sh` - Verification script
- `scripts/rollback-bugfixes.sh` - Rollback script (auto-generated)

---

**Last Updated:** 2025-11-24
**Script Version:** 1.0.0
