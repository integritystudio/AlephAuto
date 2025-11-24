# Pipeline Execution Runbook

## Overview

This runbook documents the correct methods for executing AlephAuto pipeline scripts, explains shebang usage, Doppler execution patterns, and provides troubleshooting guidance for common permission and execution errors.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Execution Methods](#execution-methods)
- [Shebang Requirements](#shebang-requirements)
- [Doppler Integration](#doppler-integration)
- [PM2 Configuration](#pm2-configuration)
- [Troubleshooting](#troubleshooting)
- [Pre-commit Validation](#pre-commit-validation)

## Quick Reference

### Correct Execution Methods

```bash
# Method 1: Direct execution (requires shebang + executable permissions)
./sidequest/pipeline-runners/duplicate-detection-pipeline.js

# Method 2: Explicit Node.js interpreter (always works)
node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# Method 3: With Doppler (recommended for production)
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# Method 4: PM2 via Doppler (production deployment)
doppler run -- pm2 start ecosystem.config.cjs
```

### Incorrect Execution Methods

```bash
# ❌ WRONG: Doppler executing JS file directly without interpreter
doppler run -- sidequest/pipeline-runners/duplicate-detection-pipeline.js
# Error: fork/exec permission denied

# ❌ WRONG: Missing executable permissions
./sidequest/pipeline-runners/duplicate-detection-pipeline.js
# Error: Permission denied

# ❌ WRONG: Missing shebang
./sidequest/pipeline-runners/duplicate-detection-pipeline.js
# Error: exec format error
```

## Execution Methods

### 1. Direct Execution

**Requirements:**
- Shebang line: `#!/usr/bin/env node`
- Executable permissions: `chmod +x <file>`

**Usage:**
```bash
./sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**When to use:**
- Quick manual testing
- Shell scripts calling pipelines
- Cron jobs (if configured correctly)

**Advantages:**
- Concise syntax
- Self-documenting (shebang shows interpreter)

**Disadvantages:**
- Requires both shebang and executable permissions
- Can fail if environment is misconfigured

### 2. Explicit Node.js Interpreter

**Requirements:**
- Node.js installed and in PATH

**Usage:**
```bash
node sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**When to use:**
- Production deployments
- PM2 process management
- Doppler secret injection
- CI/CD pipelines

**Advantages:**
- No shebang required
- No executable permissions required
- Explicit and unambiguous
- Works on all systems

**Disadvantages:**
- Slightly longer syntax

### 3. Doppler + Node.js (Recommended)

**Requirements:**
- Doppler CLI installed
- Doppler project configured (`doppler setup`)

**Usage:**
```bash
# One-off execution
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# With environment override
RUN_ON_STARTUP=true doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**When to use:**
- Production execution requiring secrets
- Local testing with production-like configuration
- Any pipeline that needs Doppler secrets (API keys, tokens, DSNs)

**Advantages:**
- Secrets injected securely
- Environment-specific configuration
- No hardcoded credentials

**Disadvantages:**
- Requires Doppler setup
- Slightly slower startup

### 4. PM2 via Doppler (Production)

**Requirements:**
- PM2 installed globally: `npm install -g pm2`
- Doppler configured
- `ecosystem.config.cjs` present

**Usage:**
```bash
# Start all apps
doppler run -- pm2 start ecosystem.config.cjs

# Start specific app
doppler run -- pm2 start ecosystem.config.cjs --only aleph-worker

# Restart with updated environment
doppler run -- pm2 restart ecosystem.config.cjs --update-env

# View logs
pm2 logs aleph-worker

# Monitor processes
pm2 monit
```

**When to use:**
- Production deployments
- Long-running background workers
- Auto-restart on failure
- Process monitoring and logging

**Advantages:**
- Process management (restart, monitoring, logs)
- Cluster mode for scalability
- Memory/CPU limits
- Startup on boot

**Disadvantages:**
- More complex setup
- Requires PM2 knowledge

## Shebang Requirements

### What is a Shebang?

A shebang (hash-bang) is the first line of a script that tells the operating system which interpreter to use:

```javascript
#!/usr/bin/env node
```

### Why `#!/usr/bin/env node`?

- `/usr/bin/env`: Locates `node` in the user's PATH (portable)
- `node`: The interpreter to use

This is more portable than hardcoding `/usr/local/bin/node` because Node.js location varies across systems.

### All Pipeline Files Must Have Shebangs

**Required files:**
- `api/server.js`
- `sidequest/pipeline-runners/*.js`

**Format:**
```javascript
#!/usr/bin/env node

// Rest of file...
```

**Validation:**
Pre-commit hook validates all pipeline files have correct shebangs.

### Setting Executable Permissions

After adding a shebang, make the file executable:

```bash
chmod +x sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**Verify permissions:**
```bash
ls -la sidequest/pipeline-runners/*.js

# Should show: -rwxr-xr-x (x = executable)
```

## Doppler Integration

### Configuration

**Setup Doppler project:**
```bash
doppler setup --project bottleneck --config dev
```

**Verify configuration:**
```bash
doppler configure get
```

**Key environment variables:**
- `NODE_ENV`: development/production
- `JOBS_API_PORT`: API server port (8080)
- `REDIS_HOST` / `REDIS_PORT`: Redis connection
- `SENTRY_DSN` / `SENTRY_ENVIRONMENT`: Error tracking
- `CRON_SCHEDULE`: Duplicate detection schedule
- `ENABLE_PR_CREATION`: Auto-PR for duplicates
- `ENABLE_GIT_WORKFLOW`: Automated branch/PR creation

### Execution Patterns

**Pattern 1: Direct execution with secrets**
```bash
doppler run -- node api/server.js
```

**Pattern 2: PM2 with secrets**
```bash
doppler run -- pm2 start ecosystem.config.cjs
```

**Pattern 3: Environment override**
```bash
RUN_ON_STARTUP=true doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**Pattern 4: Different environment**
```bash
doppler run --config prd -- node api/server.js
```

### Common Mistakes

**❌ Missing `node` interpreter:**
```bash
doppler run -- sidequest/pipeline-runners/duplicate-detection-pipeline.js
# Error: fork/exec permission denied
```

**✅ Correct:**
```bash
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**❌ Using `process.env` directly:**
```javascript
// ❌ WRONG: Breaks when Doppler not used
const port = process.env.JOBS_API_PORT;

// ✅ CORRECT: Uses centralized config with fallbacks
import { config } from './sidequest/config.js';
const port = config.jobsApiPort;
```

## PM2 Configuration

### Ecosystem Configuration

The `ecosystem.config.cjs` defines two PM2 apps:

**1. aleph-dashboard (API + WebSocket server)**
```javascript
{
  name: 'aleph-dashboard',
  script: 'api/server.js',
  interpreter: 'node',  // Explicit interpreter
  instances: 2,
  exec_mode: 'cluster'
}
```

**2. aleph-worker (Background pipeline)**
```javascript
{
  name: 'aleph-worker',
  script: 'sidequest/pipeline-runners/duplicate-detection-pipeline.js',
  interpreter: 'node',  // Explicit interpreter
  instances: 1,
  exec_mode: 'fork'
}
```

### Key Configuration Points

**Interpreter specification:**
```javascript
interpreter: 'node'
```

This tells PM2 to use Node.js interpreter, making shebangs optional (but still recommended for manual execution).

**Environment variables:**
```javascript
env: {
  NODE_ENV: process.env.NODE_ENV || 'production',
  JOBS_API_PORT: process.env.JOBS_API_PORT || '8080',
  // ... other vars with fallbacks
}
```

Variables are pulled from Doppler when starting PM2 with `doppler run --`.

### PM2 Execution Flow

```
1. doppler run -- pm2 start ecosystem.config.cjs
   ↓
2. Doppler injects secrets into process.env
   ↓
3. PM2 reads ecosystem.config.cjs
   ↓
4. PM2 extracts env variables (with fallbacks)
   ↓
5. PM2 spawns processes with interpreter: 'node'
   ↓
6. Node.js executes script files
```

### PM2 Commands

```bash
# Start all apps
doppler run -- pm2 start ecosystem.config.cjs

# Start specific app
doppler run -- pm2 start ecosystem.config.cjs --only aleph-worker

# Stop all
pm2 stop ecosystem.config.cjs

# Restart with updated env
doppler run -- pm2 restart ecosystem.config.cjs --update-env

# Delete all
pm2 delete ecosystem.config.cjs

# View logs
pm2 logs
pm2 logs aleph-worker
pm2 logs aleph-dashboard

# Monitor processes
pm2 monit

# Save process list (startup on boot)
pm2 save
pm2 startup

# View detailed info
pm2 show aleph-worker
```

## Troubleshooting

### Error: "fork/exec permission denied"

**Symptom:**
```
Error: fork/exec /Users/user/code/jobs/sidequest/pipeline-runners/duplicate-detection-pipeline.js: permission denied
```

**Root cause:**
Doppler trying to execute JS file directly without interpreter.

**Solution:**
Always use explicit `node` interpreter:
```bash
# ❌ Wrong
doppler run -- sidequest/pipeline-runners/duplicate-detection-pipeline.js

# ✅ Correct
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**PM2 Solution:**
Ensure `interpreter: 'node'` in `ecosystem.config.cjs`:
```javascript
{
  name: 'aleph-worker',
  script: 'sidequest/pipeline-runners/duplicate-detection-pipeline.js',
  interpreter: 'node'  // Critical!
}
```

### Error: "Permission denied" (direct execution)

**Symptom:**
```bash
./sidequest/pipeline-runners/duplicate-detection-pipeline.js
bash: ./sidequest/pipeline-runners/duplicate-detection-pipeline.js: Permission denied
```

**Root cause:**
File not executable.

**Solution:**
Add executable permissions:
```bash
chmod +x sidequest/pipeline-runners/duplicate-detection-pipeline.js

# Or for all pipeline files
chmod +x api/server.js sidequest/pipeline-runners/*.js
```

**Verify:**
```bash
ls -la sidequest/pipeline-runners/*.js
# Should show: -rwxr-xr-x
```

### Error: "exec format error"

**Symptom:**
```bash
./sidequest/pipeline-runners/duplicate-detection-pipeline.js
bash: ./sidequest/pipeline-runners/duplicate-detection-pipeline.js: cannot execute binary file: Exec format error
```

**Root cause:**
Missing or incorrect shebang.

**Solution:**
Add shebang as first line:
```javascript
#!/usr/bin/env node

// Rest of file...
```

**Verify:**
```bash
head -n 1 sidequest/pipeline-runners/duplicate-detection-pipeline.js
# Should output: #!/usr/bin/env node
```

### Error: "command not found: node"

**Symptom:**
```bash
./sidequest/pipeline-runners/duplicate-detection-pipeline.js
env: node: No such file or directory
```

**Root cause:**
Node.js not in PATH.

**Solution:**
1. Verify Node.js installation:
   ```bash
   which node
   node --version
   ```

2. If not installed, install via nvm or package manager:
   ```bash
   # Using nvm (recommended)
   nvm install --lts
   nvm use --lts

   # Or using Homebrew
   brew install node
   ```

3. If installed but not in PATH, add to shell profile:
   ```bash
   # Add to ~/.zshrc or ~/.bashrc
   export PATH="/usr/local/bin:$PATH"
   ```

### Error: "Cannot find module"

**Symptom:**
```
Error: Cannot find module '../workers/duplicate-detection-worker.js'
```

**Root cause:**
Incorrect working directory.

**Solution:**
1. Always run from project root:
   ```bash
   cd /Users/alyshialedlie/code/jobs
   node sidequest/pipeline-runners/duplicate-detection-pipeline.js
   ```

2. Or use absolute paths in PM2:
   ```javascript
   {
     cwd: '/Users/alyshialedlie/code/jobs',
     script: 'sidequest/pipeline-runners/duplicate-detection-pipeline.js'
   }
   ```

### Error: "Doppler secrets not loaded"

**Symptom:**
Pipeline fails with missing environment variables or authentication errors.

**Root cause:**
Doppler not configured or not used during execution.

**Solution:**
1. Verify Doppler setup:
   ```bash
   doppler configure get
   ```

2. If not configured:
   ```bash
   doppler setup --project bottleneck --config dev
   ```

3. Always use `doppler run --`:
   ```bash
   doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js
   ```

4. Verify secrets loaded:
   ```bash
   doppler run -- node -e "console.log(process.env.SENTRY_DSN)"
   ```

## Pre-commit Validation

The project includes automated validation to prevent execution errors.

### Automated Checks

**Location:** `.husky/pre-commit`

**Checks performed:**
1. Test path validation (no hardcoded `/tmp/` paths)
2. Executable permissions on pipeline files
3. Shebang validation (all pipeline files must have `#!/usr/bin/env node`)

### Running Validation Manually

```bash
# Run all pre-commit checks
npm run test:validate-paths

# Check permissions
ls -la api/server.js sidequest/pipeline-runners/*.js

# Check shebangs
head -n 1 api/server.js sidequest/pipeline-runners/*.js
```

### Validation Errors

**Missing executable permissions:**
```
❌ Missing executable permission: sidequest/pipeline-runners/duplicate-detection-pipeline.js
Fix with: chmod +x api/server.js sidequest/pipeline-runners/*.js
```

**Missing/incorrect shebang:**
```
❌ Missing or incorrect shebang in: sidequest/pipeline-runners/duplicate-detection-pipeline.js
   Expected: #!/usr/bin/env node
   Found: // Some other comment
```

### Fixing Validation Errors

**Fix permissions:**
```bash
chmod +x api/server.js sidequest/pipeline-runners/*.js
```

**Fix shebangs:**
Edit file and ensure first line is:
```javascript
#!/usr/bin/env node
```

**Re-run validation:**
```bash
git add .
git commit -m "fix: pipeline execution permissions"
# Pre-commit hook runs automatically
```

## Best Practices

### 1. Always Use Explicit Interpreter in Production

```bash
# ✅ GOOD: Explicit and reliable
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# ⚠️ OKAY: Works if properly configured
./sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

### 2. Always Use Doppler for Secrets

```bash
# ✅ GOOD: Secrets injected
doppler run -- node api/server.js

# ❌ BAD: Missing secrets
node api/server.js
```

### 3. Always Use Centralized Config

```javascript
// ✅ GOOD: Centralized with fallbacks
import { config } from './sidequest/config.js';
const port = config.jobsApiPort;

// ❌ BAD: Direct env access
const port = process.env.JOBS_API_PORT;
```

### 4. Always Run from Project Root

```bash
# ✅ GOOD: Correct working directory
cd /Users/alyshialedlie/code/jobs
node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# ❌ BAD: Wrong working directory
cd sidequest/pipeline-runners
node duplicate-detection-pipeline.js
```

### 5. Always Use PM2 for Production Workers

```bash
# ✅ GOOD: Process management + monitoring
doppler run -- pm2 start ecosystem.config.cjs

# ⚠️ OKAY: One-off testing
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# ❌ BAD: No process management
nohup node sidequest/pipeline-runners/duplicate-detection-pipeline.js &
```

## Reference

### Required File Attributes

| File | Shebang | Executable | PM2 Interpreter |
|------|---------|------------|-----------------|
| api/server.js | ✅ Required | ✅ Required | `node` |
| sidequest/pipeline-runners/*.js | ✅ Required | ✅ Required | `node` |

### Execution Method Comparison

| Method | Shebang Required | Permissions Required | Doppler Support | Best For |
|--------|------------------|----------------------|-----------------|----------|
| Direct (`./file.js`) | ✅ Yes | ✅ Yes | ❌ No | Quick testing |
| Node.js (`node file.js`) | ❌ No | ❌ No | ✅ Yes | Manual execution |
| Doppler + Node.js | ❌ No | ❌ No | ✅ Yes | Production |
| PM2 via Doppler | ❌ No | ❌ No | ✅ Yes | Production workers |

### Common Commands

```bash
# Development
doppler run -- npm run dev
doppler run -- npm run dashboard

# Testing
npm test
npm run test:integration

# Production
doppler run -- pm2 start ecosystem.config.cjs
pm2 save
pm2 logs

# Troubleshooting
doppler configure get
pm2 show aleph-worker
pm2 logs aleph-worker --lines 100
node --version
which node
ls -la sidequest/pipeline-runners/*.js
head -n 1 sidequest/pipeline-runners/*.js
```

## Related Documentation

- `/Users/alyshialedlie/code/jobs/docs/deployment/TRADITIONAL_SERVER_DEPLOYMENT.md` - PM2 deployment guide
- `/Users/alyshialedlie/code/jobs/docs/runbooks/DOPPLER_OUTAGE.md` - Doppler troubleshooting
- `/Users/alyshialedlie/code/jobs/docs/architecture/CHEAT_SHEET.md` - Command reference
- `/Users/alyshialedlie/code/jobs/ecosystem.config.cjs` - PM2 configuration
- `/Users/alyshialedlie/code/jobs/.husky/pre-commit` - Pre-commit validation

---

**Version:** 1.0.0
**Last Updated:** 2025-11-24
**Maintained By:** DevOps Team
