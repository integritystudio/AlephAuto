# Phase 2-3: Foundation & Types/Errors — ✅ COMPLETE

## Phase 2: Foundation (13 files, ~1,475 lines) — ✅ COMPLETE

Zero-dependency, high fan-in files. Migrated first because they block everything downstream.

**Status:** All 13 files migrated. 3 `.d.ts` files deleted. Import paths updated across ~70 downstream files. *(uncommitted — pending commit)*

### Files Migrated

| File | Lines | Fan-In | Status |
|------|------:|-------:|--------|
| `sidequest/core/constants.ts` | 228 | 34 | ✅ |
| `sidequest/core/config.ts` | 239 | 26 | ✅ |
| `sidequest/utils/logger.ts` | 142 | 85+ | ✅ (deleted `logger.d.ts`) |
| `sidequest/utils/time-helpers.ts` | 78 | ~5 | ✅ |
| `sidequest/utils/pipeline-names.ts` | 62 | ~5 | ✅ |
| `sidequest/pipeline-core/utils/error-helpers.ts` | 258 | ~10 | ✅ |
| `sidequest/pipeline-core/utils/fs-helpers.ts` | 104 | ~5 | ✅ |
| `sidequest/pipeline-core/utils/timing-helpers.ts` | 80 | ~5 | ✅ |
| `sidequest/pipeline-core/utils/process-helpers.ts` | 15 | ~3 | ✅ |
| `sidequest/pipeline-core/utils/index.ts` | 12 | ~10 | ✅ |
| `packages/shared-logging/src/logger.ts` | 95 | ~85 | ✅ (deleted `index.d.ts`) |
| `packages/shared-logging/src/index.ts` | 1 | ~85 | ✅ |
| `packages/shared-process-io/src/index.ts` | 161 | ~10 | ✅ (deleted `index.d.ts`) |

### Migration Order

Migrate in dependency order (leaf nodes first):

```
Batch 1 (no dependencies):
  constants.js → constants.ts
  config.js → config.ts
  time-helpers.js → time-helpers.ts
  pipeline-names.js → pipeline-names.ts

Batch 2 (depends on Batch 1):
  logger.js → logger.ts  (wraps @shared/logging)
  process-helpers.js → process-helpers.ts
  timing-helpers.js → timing-helpers.ts
  fs-helpers.js → fs-helpers.ts
  error-helpers.js → error-helpers.ts

Batch 3 (barrel + packages):
  pipeline-core/utils/index.js → index.ts
  shared-logging/src/logger.js → logger.ts
  shared-logging/src/index.js → index.ts
  shared-process-io/src/index.js → index.ts
```

### Per-File Instructions

#### constants.js → constants.ts

Pure data file. All exports are `const` objects.

```typescript
// Add `as const` to all constant objects for literal types:
export const TIMEOUTS = {
  PYTHON_PIPELINE_MS: 300_000,
  // ...
} as const;

// Type helper (optional, for consumers):
export type Timeout = typeof TIMEOUTS;
```

Strict mode fixes: None expected.

#### config.js → config.ts

Wraps `process.env` via Doppler. Add types for the config shape.

```typescript
interface AppConfig {
  jobsApiPort: number;
  sentryDsn: string;
  enableGitWorkflow: boolean;
  enablePrCreation: boolean;
  // ... all config properties
}

export const config: AppConfig = {
  jobsApiPort: parseInt(process.env.JOBS_API_PORT ?? '8080', 10),
  // ...
};
```

Strict mode fixes: Add nullish coalescing for all `process.env` reads.

#### logger.js → logger.ts

Delete `sidequest/utils/logger.d.ts` after migration.

```typescript
import { createLogger } from '@shared/logging';

// Type the logger instance
export const logger: ReturnType<typeof createLogger> = createLogger('aleph-auto');
```

#### shared-process-io/src/index.js → index.ts

**Known issue:** Lines 128-130 and 154-156 have `@type {any}` casts.

```typescript
// Replace @type {any} with proper types:
// Line 128-130: child process stdout/stderr
const stdout: string = result.stdout?.toString() ?? '';
const stderr: string = result.stderr?.toString() ?? '';

// Line 154-156: exec options
const options: ExecOptions = { cwd, timeout, maxBuffer };
```

Delete `packages/shared-process-io/src/index.d.ts` after migration.

#### shared-logging/src/ → .ts

Delete `packages/shared-logging/src/index.d.ts` after migration.

### .d.ts Files to Delete

After Phase 2 completes, delete these 3 files:
- `sidequest/utils/logger.d.ts`
- `packages/shared-logging/src/index.d.ts`
- `packages/shared-process-io/src/index.d.ts`

### Importer Updates

Each renamed file requires updating all importers. High fan-in files affect many:

```bash
# Find all importers of constants.js (34 files)
grep -r "from.*constants\.js" --include='*.ts' --include='*.js' -l

# Update: change .js → .ts in import path
# Example:
# import { TIMEOUTS } from '../core/constants.js';
# →
# import { TIMEOUTS } from '../core/constants.ts';
```

**Critical:** `logger.js` has 85+ importers. Use a script or sed to bulk-update:

```bash
# Bulk update logger imports
find . -name '*.js' -o -name '*.ts' | xargs sed -i '' "s|from '\(.*\)logger\.js'|from '\1logger.ts'|g"
```

### Verification

```bash
npx tsc --noEmit    # strict errors should decrease from Phase 1 baseline
npm test            # all existing tests pass
```

---

## Phase 3: Types & Errors (3 files, ~586 lines) — ✅ COMPLETE

**Status:** All 3 files migrated. 2 `.d.ts` files deleted. *(uncommitted — pending commit)*

### Files Migrated

| File | Lines | Status |
|------|------:|--------|
| `sidequest/pipeline-core/errors/error-classifier.ts` | 433 | ✅ (deleted `error-types.d.ts`, `types.d.ts`) |
| `api/utils/api-error.ts` | 144 | ✅ |
| `api/preload.ts` | 9 | ✅ (`ecosystem.config.cjs` updated) |

### Per-File Instructions

#### error-classifier.js → error-classifier.ts

Error classification with pattern matching. Moderate complexity.

```typescript
// Define error classification types (replace .d.ts files):
interface ClassifiedError {
  category: ErrorCategory;
  isRetryable: boolean;
  message: string;
  originalError?: unknown;
}

type ErrorCategory = 'NETWORK' | 'FILESYSTEM' | 'PROCESS' | 'TIMEOUT' | 'VALIDATION' | 'UNKNOWN';

// Pattern matching arrays need element types:
interface ErrorPattern {
  test: (error: unknown) => boolean;
  category: ErrorCategory;
  retryable: boolean;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // existing patterns...
];
```

Strict mode fixes:
- `error` parameter in classify function: type as `unknown`, use type guards
- Pattern test callbacks: ensure `error` is narrowed before property access
- Return type: explicit `ClassifiedError`

#### api-error.js → api-error.ts

Express error response utilities.

```typescript
import { Response } from 'express';

type ErrorCode = 'INVALID_REQUEST' | 'NOT_FOUND' | 'INTERNAL_ERROR' | 'RATE_LIMITED' | 'UNAUTHORIZED';

export function sendError(
  res: Response,
  code: ErrorCode,
  message: string,
  statusCode: number
): void {
  res.status(statusCode).json({ error: { code, message } });
}

export function sendNotFoundError(res: Response, resource: string): void {
  sendError(res, 'NOT_FOUND', `${resource} not found`, 404);
}
```

#### api/preload.js → api/preload.ts

9 lines. Sets `EventEmitter.defaultMaxListeners`.

```typescript
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;
```

Update `ecosystem.config.cjs`: `--require ./api/preload.js` → `--require ./api/preload.ts`

### .d.ts Files to Delete

After Phase 3 completes, delete these 3 files:
- `sidequest/pipeline-core/errors/error-types.d.ts`
- `sidequest/pipeline-core/errors/types.d.ts`
- `api/types/pipeline-requests.d.ts` (if not already deleted in Phase 0)

### Verification

```bash
npx tsc --noEmit
npm test
```

### Phase 2-3 Commit Strategy

1. **Commit 1:** Phase 2 Batch 1 — constants, config, time-helpers, pipeline-names + importer updates
2. **Commit 2:** Phase 2 Batch 2 — logger, error-helpers, fs-helpers, timing-helpers, process-helpers + importer updates + delete logger.d.ts
3. **Commit 3:** Phase 2 Batch 3 — utils/index, shared-logging, shared-process-io + delete package .d.ts files
4. **Commit 4:** Phase 3 — error-classifier, api-error, preload + delete error .d.ts files

Each commit: `npx tsc --noEmit && npm test`
