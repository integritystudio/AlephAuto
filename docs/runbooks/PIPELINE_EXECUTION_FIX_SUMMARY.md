# Pipeline Execution Guide

Quick reference for running pipeline scripts with Doppler and PM2.

## Common Error

```
Error: fork/exec .../duplicate-detection-pipeline.ts: permission denied
```

**Cause:** Attempting to execute a TypeScript entrypoint directly (or without `--strip-types`).

**Fix:** Always use explicit `node --strip-types` or run via PM2 ecosystem config.

## Execution Methods

### Development
```bash
# Recommended: explicit Node + strip-types
doppler run -- node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# With startup flag
doppler run -- RUN_ON_STARTUP=true node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts
```

### Production (PM2)
```bash
# Start all apps
doppler run -- pm2 start config/ecosystem.config.cjs

# Start specific app
doppler run -- pm2 start config/ecosystem.config.cjs --only aleph-worker

# View logs
pm2 logs aleph-worker --lines 50

# Stop/delete
pm2 delete aleph-worker
```

## Requirements for Pipeline Files

Entrypoints in `api/server.ts` and `sidequest/pipeline-runners/*-pipeline.ts` should have:

1. **Shebang** (first line):
   ```bash
   #!/usr/bin/env -S node --strip-types
   ```

2. **Non-executable file mode** (repo policy):
   ```bash
   node --strip-types scripts/validate-permissions.ts --check-only
   ```

3. **PM2 config** must use explicit interpreter:
   ```javascript
   interpreter: 'node',  // CRITICAL: prevents permission denied errors
   ```

## Validation Commands

### Check shebangs
```bash
for file in api/server.ts sidequest/pipeline-runners/*-pipeline.ts; do
  echo "=== $file ===" && head -n 1 "$file"
done
```

### Check permissions
```bash
ls -la api/server.ts sidequest/pipeline-runners/*-pipeline.ts | awk '{print $1, $9}'
# Should show: -rw-r--r--
```

### Check PM2 interpreter config
```bash
rg -n "script:|interpreter:|node_args:" config/ecosystem.config.cjs
```

## Adding New Pipeline Files

1. Add shebang: `#!/usr/bin/env -S node --strip-types`
2. Keep file mode non-executable (`644`) and run:
   `node --strip-types scripts/validate-permissions.ts --check-only`
3. Test locally: `doppler run -- node --strip-types <file>`
4. Add to PM2 config with `interpreter: 'node'`

Use `scripts/validate-permissions.ts` as the source of truth for entrypoint mode checks.

## Key Files

| File | Purpose |
|------|---------|
| `config/ecosystem.config.cjs` | PM2 configuration |
| `scripts/validate-permissions.ts` | Enforces entrypoint mode policy (`644`) |
| `docs/runbooks/pipeline-execution.md` | Comprehensive execution guide |
