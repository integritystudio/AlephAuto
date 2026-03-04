# Pipeline Execution Runbook

## Overview

This runbook documents the current TypeScript execution model for AlephAuto pipelines and API services.

- Runtime: Node.js 22+ (`engines.node >= 22.0.0`)
- Entry points: `.ts` files
- Preferred interpreter mode: `node --strip-types`
- Secret injection: `doppler run -- ...`
- Process manager: PM2 (`config/ecosystem.config.cjs`)

## Quick Reference

### Correct Execution Methods

```bash
# Method 1: Direct execution (requires shebang + executable bit)
./sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# Method 2: Explicit Node interpreter (recommended one-off pattern)
node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# Method 3: With Doppler (recommended for production-like runs)
doppler run -- node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# Method 4: PM2 via Doppler (production deployment)
doppler run -- pm2 start config/ecosystem.config.cjs
```

### Incorrect Execution Methods

```bash
# WRONG: Doppler executing a TS file directly without interpreter
doppler run -- sidequest/pipeline-runners/duplicate-detection-pipeline.ts
# Error: fork/exec permission denied

# WRONG: Missing strip-types when running TS directly with node
node sidequest/pipeline-runners/duplicate-detection-pipeline.ts
# Error: Unknown file extension ".ts" or parse failures
```

## Execution Methods

### 1. Direct Execution

Use direct execution when the file already has a valid shebang and executable permissions.

```bash
./sidequest/pipeline-runners/duplicate-detection-pipeline.ts
```

Notes:
- `duplicate-detection-pipeline.ts` currently uses `#!/usr/bin/env -S npx tsx`
- Most other `*-pipeline.ts` entry points use `#!/usr/bin/env -S node --strip-types`
- Direct execution depends on whatever interpreter is declared in the shebang

### 2. Explicit Node Interpreter (Recommended)

Use explicit Node invocation for consistency and predictable behavior:

```bash
node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts
node --strip-types api/server.ts
```

Benefits:
- No reliance on shebang behavior
- Works consistently in local shells and automation
- Aligns with PM2 `node_args: --strip-types`

### 3. Doppler + Node (Recommended for Secrets)

```bash
# API server
doppler run -- node --strip-types api/server.ts

# Duplicate detection worker
doppler run -- node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# Run duplicate detection immediately
RUN_ON_STARTUP=true doppler run -- node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts
```

### 4. PM2 via Doppler (Production)

```bash
# Start all apps from ecosystem config
doppler run -- pm2 start config/ecosystem.config.cjs

# Restart and refresh environment from Doppler
doppler run -- pm2 restart config/ecosystem.config.cjs --update-env

# Logs and process info
pm2 logs aleph-dashboard
pm2 logs aleph-worker
pm2 show aleph-worker
```

## Shebang and Permissions

### Shebang Expectations

Current entry points use shebangs with command flags via `env -S`:

- `api/server.ts`: `#!/usr/bin/env node`
- Most pipeline runners: `#!/usr/bin/env -S node --strip-types`
- `duplicate-detection-pipeline.ts`: `#!/usr/bin/env -S npx tsx`

Why `env -S`:
- Allows passing interpreter flags (`--strip-types`)
- Keeps scripts portable across machines with different install paths

### Required Executable Files

- `api/server.ts`
- `sidequest/pipeline-runners/*-pipeline.ts`

### Validate and Fix

```bash
# Validate shebangs
head -n 1 api/server.ts sidequest/pipeline-runners/*-pipeline.ts

# Validate executable bits
ls -la api/server.ts sidequest/pipeline-runners/*-pipeline.ts

# Fix permissions if needed
chmod +x api/server.ts sidequest/pipeline-runners/*-pipeline.ts
```

## Doppler Integration

### Setup

```bash
doppler setup --project bottleneck --config dev
doppler configure get
```

### Execution Patterns

```bash
# Development config
doppler run -- node --strip-types api/server.ts

# Production config
doppler run --config prd -- node --strip-types api/server.ts

# PM2 with Doppler-managed env
doppler run -- pm2 start config/ecosystem.config.cjs
```

### Config Usage Pattern

Use centralized config modules, not ad hoc `process.env` reads scattered across business logic:

```ts
import { config } from '../sidequest/core/config.ts';
const port = config.jobsApiPort;
```

## PM2 Configuration

`config/ecosystem.config.cjs` currently defines:

- `aleph-dashboard`
  - `script: 'api/server.ts'`
  - `interpreter: 'node'`
  - `node_args: '--strip-types --import ./api/preload.ts --max-old-space-size=512'`
- `aleph-worker`
  - `script: 'sidequest/pipeline-runners/duplicate-detection-pipeline.ts'`
  - `interpreter: 'node'`
  - `node_args: '--strip-types'`

Execution flow:

1. `doppler run -- pm2 start config/ecosystem.config.cjs`
2. Doppler injects env vars
3. PM2 loads `script: *.ts`
4. PM2 starts `node` with `node_args`
5. Node executes TypeScript entry points via strip-types mode

## Troubleshooting

### Error: `fork/exec permission denied`

Symptom:
```
Error: fork/exec .../duplicate-detection-pipeline.ts: permission denied
```

Cause:
- Executing file directly through Doppler without interpreter

Fix:
```bash
# Wrong
doppler run -- sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# Correct
doppler run -- node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts
```

### Error: `Unknown file extension ".ts"` / parse errors

Cause:
- Running `node file.ts` without `--strip-types`

Fix:
```bash
node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts
```

### Error: `Permission denied` (direct `./file.ts`)

Cause:
- Missing executable permission

Fix:
```bash
chmod +x api/server.ts sidequest/pipeline-runners/*-pipeline.ts
```

### Error: `exec format error`

Cause:
- Missing or incorrect shebang at file top

Fix:
```bash
head -n 1 sidequest/pipeline-runners/duplicate-detection-pipeline.ts
# Expect: #!/usr/bin/env -S npx tsx
```

### Error: `Cannot find module ...worker.ts`

Common causes:
- Running from wrong repository
- Out-of-date branch / missing files
- Running without strip-types

Fix checklist:
```bash
cd /Users/alyshialedlie/code/jobs
git status
node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts
```

### Error: Doppler secrets not loaded

Fix checklist:
```bash
doppler configure get
doppler run -- node -e "console.log(process.env.SENTRY_DSN ? 'loaded' : 'missing')"
doppler run -- node --strip-types api/server.ts
```

## Validation Checklist

Run this before committing execution-related changes:

```bash
# Existing test-path validation
npm run test:validate-paths

# TS entrypoint shebang + permission checks
head -n 1 api/server.ts sidequest/pipeline-runners/*-pipeline.ts
ls -la api/server.ts sidequest/pipeline-runners/*-pipeline.ts

# Smoke tests
node --strip-types --version
timeout 10 node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts
```

Note:
- `.husky/pre-commit` still contains legacy `.js` glob checks.
- Keep this runbook as the source of truth for current TS execution until hook checks are migrated.

## Best Practices

1. Prefer explicit interpreter commands in docs, scripts, and runbooks:
   - `node --strip-types <entrypoint.ts>`
2. Use Doppler for all environments that require secrets.
3. Run from repository root: `/Users/alyshialedlie/code/jobs`
4. Use PM2 for long-running production services.
5. Keep entrypoint shebangs and executable bits valid even when PM2 uses explicit interpreter settings.

## Reference

### Required File Attributes

| File | Shebang | Executable | PM2 Interpreter |
|------|---------|------------|-----------------|
| `api/server.ts` | ✅ Required | ✅ Required | `node` |
| `sidequest/pipeline-runners/*-pipeline.ts` | ✅ Required | ✅ Required | `node` |

### Execution Method Comparison

| Method | Shebang Required | Permissions Required | Doppler Support | Best For |
|--------|------------------|----------------------|-----------------|----------|
| Direct (`./file.ts`) | ✅ Yes | ✅ Yes | ❌ No | Quick local testing |
| Node (`node --strip-types file.ts`) | ❌ No | ❌ No | ✅ Yes | One-off runs |
| Doppler + Node | ❌ No | ❌ No | ✅ Yes | Production-like runs |
| PM2 via Doppler | ❌ No | ❌ No | ✅ Yes | Production services |

### Common Commands

```bash
# Development
node --strip-types api/server.ts
node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# With Doppler
doppler run -- node --strip-types api/server.ts
doppler run -- node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# Production
doppler run -- pm2 start config/ecosystem.config.cjs
pm2 save
pm2 logs
```

## Related Documentation

- `/Users/alyshialedlie/code/jobs/docs/deployment/TRADITIONAL_SERVER_DEPLOYMENT.md` - PM2 deployment guide
- `/Users/alyshialedlie/code/jobs/docs/runbooks/DOPPLER_OUTAGE.md` - Doppler troubleshooting
- `/Users/alyshialedlie/code/jobs/docs/architecture/CHEAT-SHEET.md` - command reference
- `/Users/alyshialedlie/code/jobs/config/ecosystem.config.cjs` - PM2 configuration

---

**Version:** 2.0.0
**Last Updated:** 2026-03-04
**Maintained By:** DevOps Team
