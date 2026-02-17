# Phase 2-3 Migration: Hallucination Audit

Systematic comparison of every migrated `.ts` file against its original `.js` source.
Hallucination = any behavioral change, fabricated logic, or dropped functionality not specified in the migration plan.

**Audited:** 2026-02-17 | **Files:** 16 migrated + 2 config changes

---

## H1: `sidequest/core/config.ts` — `||` changed to `??` (15 env var reads)

**Severity:** HIGH | **Type:** Behavioral change

The original `.js` used `||` for all `process.env` fallbacks. The migration changed 15 of them to `??`.

```javascript
// ORIGINAL (.js)
nodeEnv: process.env.NODE_ENV || 'production',
logLevel: process.env.LOG_LEVEL || 'info',
codeBaseDir: process.env.CODE_BASE_DIR || path.join(os.homedir(), 'code'),

// MIGRATED (.ts)
nodeEnv: process.env.NODE_ENV ?? 'production',
logLevel: process.env.LOG_LEVEL ?? 'info',
codeBaseDir: process.env.CODE_BASE_DIR ?? path.join(os.homedir(), 'code'),
```

**Why it matters:** `||` treats `''` (empty string) as falsy and falls through to the default. `??` only treats `null`/`undefined` as nullish and preserves `''`. If an env var is explicitly set to `''` (e.g. by Doppler or a shell misconfiguration), the migrated code passes the empty string through instead of using the default.

**Affected properties (15):**
`codeBaseDir`, `nodeEnv`, `repomixSchedule`, `docSchedule`, `gitBaseBranch`, `gitBranchPrefix`, `logLevel`, `apiPort` (inner `??`), `doppler.cacheDir`, `redis.url`, `redis.host`, `migrationApiKey`, `homeDir`, `sentryDsn`, `schemaMcpUrl`

**Risk:** `nodeEnv=''` and `logLevel=''` would be invalid values that break logger initialization. Path-based properties with `''` would resolve to CWD instead of the intended default.

**Mitigation:** The CLAUDE.md pattern #4 says "use `??` for numeric options" to preserve `0`. For string env vars where `''` is never a valid value, `||` was the correct original choice. Revert string fallbacks to `||`; keep `??` only for the two `safeParseInt` calls (lines 14, 26) where it was already correct in the original.

---

## H2: `sidequest/utils/pipeline-names.ts` — `||` changed to `??` in getPipelineName

**Severity:** LOW | **Type:** Behavioral change

```javascript
// ORIGINAL (.js)
return PIPELINE_NAMES[id] || id;

// MIGRATED (.ts)
return (PIPELINE_NAMES as Record<string, string>)[id] ?? id;
```

**Why it matters:** If a pipeline name value were ever `''`, the original returns the `id` fallback; the migration returns `''`. In practice, no pipeline name is `''`, so this is a theoretical-only divergence.

**Also added:** `as Record<string, string>` cast to satisfy `as const` indexing — this is a correct type-level workaround, not a behavioral change.

---

## H3: `config/ecosystem.config.cjs` — `--require` changed to `--import`

**Severity:** MEDIUM | **Type:** Behavioral change (introduced by code review fix)

```javascript
// ORIGINAL
node_args: '--strip-types --require ./api/preload.js --max-old-space-size=512',

// MIGRATED (after code review fix)
node_args: '--strip-types --import ./api/preload.ts --max-old-space-size=512',
```

**Why it matters:**
- `--require` is CJS-only; the code reviewer flagged that it can't load ESM `.ts` files and recommended `--import`
- `--import` changes loading semantics: it runs as an async ESM loader hook, not a synchronous CJS preload
- The original `--require ./api/preload.js` worked because `.js` was loaded before `"type": "module"` took effect
- Whether `--import ./api/preload.ts` works correctly with `--strip-types` depends on the Node.js version

**Context:** This change was made on the code reviewer's recommendation, not in the original migration plan. The plan only specified updating the file extension (`.js` to `.ts`), not changing the flag.

---

## H4: `sidequest/pipeline-core/errors/types.d.ts` — Type guard declarations dropped

**Severity:** LOW | **Type:** Dropped exports

The deleted `types.d.ts` declared two type guard functions:

```typescript
export function isHTTPError(error: Error): error is HTTPError;
export function isClassifiedError(error: Error): error is ClassifiedError;
```

These were **never implemented** in the original `.js` file — they were dead declarations. No consumers import them (verified by grep). However, they were part of the public type surface.

**Mitigation:** None needed unless a future consumer expects them. If needed, they are trivial to add to `error-classifier.ts`.

---

## Clean Files (12 of 16)

These files have **no hallucinations** — behavior is identical to the originals:

| File | Notes |
|------|-------|
| `sidequest/core/constants.ts` | Only change: `as const` added (type-only) |
| `sidequest/utils/logger.ts` | Signatures match deleted `.d.ts` exactly |
| `sidequest/utils/time-helpers.ts` | All logic preserved |
| `sidequest/pipeline-core/utils/error-helpers.ts` | Type casts added for strict mode, behavior identical |
| `sidequest/pipeline-core/utils/fs-helpers.ts` | `NodeJS.ErrnoException` cast added, behavior identical |
| `sidequest/pipeline-core/utils/timing-helpers.ts` | `_label` param preserved from original |
| `sidequest/pipeline-core/utils/process-helpers.ts` | Re-export barrel, no logic |
| `sidequest/pipeline-core/utils/index.ts` | Re-export barrel, no logic |
| `packages/shared-logging/src/logger.ts` | Logic matches original; `LoggerConfig` interface replaces JSDoc `@typedef` |
| `packages/shared-logging/src/index.ts` | `LoggerConfig` re-export preserves what `.d.ts` provided |
| `packages/shared-process-io/src/index.ts` | `@type {any}` casts replaced with intersection types, behavior identical |
| `api/utils/api-error.ts` | All functions and exports match original |
| `api/preload.ts` | `process.setMaxListeners(20)` preserved |

---

## Remediation Status

| # | Fix | Status |
|---|-----|--------|
| H1 | Revert string `??` back to `||` in config.ts | FIXED — 11 string fallbacks reverted; `??` kept in `safeParseInt`/`safeParseFloat` |
| H2 | Revert `??` to `||` in getPipelineName | FIXED |
| H3 | Verify `--import` + `--strip-types` works on production Node version | VERIFIED — works on Node v25.6.0, no revert needed |
| H4 | Add `isHTTPError`/`isClassifiedError` type guards | FIXED — added to `error-classifier.ts` |
