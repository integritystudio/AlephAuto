# Fix Missing @types/node Installation

## Problem

TypeScript compilation fails in CI/CD with errors like:

```
error TS2307: Cannot find module 'path' or its corresponding type declarations.
error TS2307: Cannot find module 'fs/promises' or its corresponding type declarations.
error TS2580: Cannot find name 'process'. Do you need to install type definitions for node?
```

This occurs when `@types/node` is not installed, even though it's listed in `package.json` devDependencies.

## Root Cause

The issue occurs when:
1. `npm install` or `npm ci` runs with `NODE_ENV=production` (common in CI/CD)
2. Dev dependencies are skipped in production mode
3. `@types/node` is a dev dependency needed for TypeScript compilation

## Solution

### Quick Fix (Local Development)

```bash
# Use the automated fix script
npm run fix:types
```

Or manually:

```bash
# Ensure dev dependencies are installed
NODE_ENV=development npm ci --include=dev
```

### CI/CD Fix

Update your CI workflow to explicitly include dev dependencies:

```yaml
# .github/workflows/ci.yml
- name: Install Node.js dependencies
  run: NODE_ENV=development npm ci --include=dev --omit=optional
```

### Verification

Check that @types/node is installed:

```bash
# Run the verify script
npm run verify

# Or check manually
ls node_modules/@types/node

# Test TypeScript compilation
npm run typecheck
```

## Prevention

1. **Always use `NODE_ENV=development` in CI for builds that need TypeScript**
   - CI testing needs dev dependencies
   - Production deployment can skip them

2. **Use `npm ci --include=dev` explicitly**
   - Ensures dev dependencies are installed regardless of NODE_ENV

3. **Monitor with verify script**
   - The `npm run verify` script now checks for @types/node
   - Run this in CI to catch missing dependencies early

## Deployment Note

Production deployments (`npm ci --production`) correctly exclude dev dependencies since TypeScript compilation happens during CI/CD, not in production runtime.

## Related Files

- `scripts/fix-types.js` - Automated fix script
- `scripts/verify-setup.js` - Now includes @types/node check
- `.github/workflows/ci.yml` - Updated to include dev dependencies