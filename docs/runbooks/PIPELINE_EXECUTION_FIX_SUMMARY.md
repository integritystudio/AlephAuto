# Pipeline Execution Guide

Quick reference for running pipeline scripts with Doppler and PM2.

## Common Error

```
Error: fork/exec .../duplicate-detection-pipeline.js: permission denied
```

**Cause:** Attempting to execute JavaScript files directly instead of via Node.js interpreter.

**Fix:** Always use explicit `node` interpreter or ensure PM2 config has `interpreter: 'node'`.

## Execution Methods

### Development
```bash
# Recommended: explicit Node.js interpreter
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# With startup flag
doppler run -- RUN_ON_STARTUP=true node sidequest/pipeline-runners/duplicate-detection-pipeline.js
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

All files in `api/server.js` and `sidequest/pipeline-runners/*.js` must have:

1. **Shebang** (first line):
   ```javascript
   #!/usr/bin/env node
   ```

2. **Executable permissions**:
   ```bash
   chmod +x <file>
   ```

3. **PM2 config** must use explicit interpreter:
   ```javascript
   interpreter: 'node',  // CRITICAL: prevents permission denied errors
   ```

## Validation Commands

### Check shebangs
```bash
for file in api/server.js sidequest/pipeline-runners/*.js; do
  echo "=== $file ===" && head -n 1 "$file"
done
```

### Check permissions
```bash
ls -la api/server.js sidequest/pipeline-runners/*.js | awk '{print $1, $9}'
# Should show: -rwxr-xr-x
```

### Check PM2 interpreter config
```bash
grep -A 1 "interpreter:" config/ecosystem.config.cjs
```

## Adding New Pipeline Files

1. Add shebang: `#!/usr/bin/env node`
2. Make executable: `chmod +x <file>`
3. Test locally: `doppler run -- node <file>`
4. Add to PM2 config with `interpreter: 'node'`

Pre-commit hook automatically validates shebangs and permissions.

## Key Files

| File | Purpose |
|------|---------|
| `config/ecosystem.config.cjs` | PM2 configuration |
| `.husky/pre-commit` | Validates shebangs/permissions |
| `docs/runbooks/pipeline-execution.md` | Comprehensive execution guide |
