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

## Dashboard Type Fixes

TypeScript errors in the dashboard (`TS2339: Property 'SIDEQUEST_API_BASE_URL' does not exist on type 'Window'`) can be resolved by:

1. **Use the typed window constant:**

```javascript
// ✅ Correct - uses DashboardGlobals typedef
const win = window;
const baseUrl = win.SIDEQUEST_API_BASE_URL || 'http://localhost:8080';

// ❌ Wrong - direct access fails type checking
const baseUrl = window.SIDEQUEST_API_BASE_URL || 'http://localhost:8080';
```

2. **Type declaration is in `public/dashboard.js`:**

```javascript
/**
 * @typedef {Window & {
 *   SIDEQUEST_API_BASE_URL?: string;
 * }} DashboardGlobals
 */
const win = /** @type {DashboardGlobals} */ (window);
```

This pattern allows TypeScript to properly recognize custom properties on the window object.

## Related Files

- `scripts/fix-types.js` - Automated fix script
- `scripts/verify-setup.js` - Now includes @types/node check
- `.github/workflows/ci.yml` - Updated to include dev dependencies
- `public/dashboard.js` - Dashboard type declarations and window object access