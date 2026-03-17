# AlephAuto - Quick Reference Cheat Sheet

**Version**: 2.3.29 | **Last Updated**: 2026-03-15

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  DASHBOARD (React/Vite)  ←──WebSocket──→  API SERVER (Express 5)   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │       JOB QUEUE FRAMEWORK      │
                    │       (SidequestServer)        │
                    │   ┌─────┬─────┬─────┬─────┐   │
                    │   │ DD  │ SE  │ GA  │ RC  │   │  11 Workers
                    │   └─────┴─────┴─────┴─────┘   │
                    └───────────────┬───────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
┌───────┴───────┐         ┌────────┴────────┐         ┌────────┴────────┐
│  PostgreSQL   │         │   File System   │         │    External     │
│  (jobs DB)    │         │   (reports)     │         │  (Sentry, Git)  │
└───────────────┘         └─────────────────┘         └─────────────────┘
```

| Layer | Technology |
|-------|------------|
| **Frontend** | React + Vite + Zustand |
| **API** | Express 5 + WebSocket |
| **Queue** | SidequestServer (11 workers) |
| **Workers** | bugfix-audit, claude-health, dashboard-populate, duplicate-detection, git-activity, gitignore, plugin-manager, repo-cleanup, repomix, schema-enhancement, test-refactor |
| **Database** | PostgreSQL |
| **Config** | Doppler |
| **Monitoring** | Sentry v8 |

---

## Critical Patterns

### 1. Two-Phase Similarity — extract features BEFORE normalization
```typescript
const features = extractSemanticFeatures(code);    // PHASE 1: Original code
const normalized = normalizeCode(code);            // PHASE 2: Normalize
const penalty = calculateSemanticPenalty(f1, f2);  // PHASE 3: Penalize
```
`sidequest/pipeline-core/similarity/structural.ts`

### 2. Deduplicate by file:function_name (NOT line number)
```typescript
const functionKey = `${filePath}:${functionName}`;  // correct
const functionKey = `${filePath}:${lineNumber}`;    // wrong - lines shift
```
`sidequest/pipeline-core/extractors/extract-blocks.ts`

### 3. Use `tags` field (NOT `semantic_tags`)
```typescript
const block: CodeBlock = { tags: [`function:${name}`] };           // correct
const block: CodeBlock = { semantic_tags: [`function:${name}`] };  // wrong
```
`sidequest/pipeline-core/extractors/extract-blocks.ts`

### 4. Backwards function search (find CLOSEST function)
```typescript
for (let i = lineStart - 1; i >= searchStart; i--) {  // backwards
```
`sidequest/pipeline-core/extractors/extract-blocks.ts`

### 5. Nullish coalescing for numbers
```javascript
this.maxConcurrent = options.maxConcurrent ?? 5;  // ✅ preserves 0
this.maxConcurrent = options.maxConcurrent || 5;  // ❌ 0 becomes 5
```

### 6. Use centralized config (NEVER process.env)
```javascript
import { config } from './sidequest/core/config.ts';
```

---

## Similarity Penalties (multiplicative)

| Difference | Multiplier |
|------------|------------|
| HTTP Status (200 vs 201) | 0.70x |
| Logical Ops (=== vs !==) | 0.80x |
| Semantic Methods (max vs min) | 0.75x |
| **All three combined** | **0.42x** |

## Multi-Layer Grouping

| Layer | Purpose | Threshold |
|-------|---------|-----------|
| 0 | Remove trivial | ≥0.95 |
| 1 | High confidence | ≥0.90 |
| 2 | Potential matches | ≥0.75 |

## Accuracy

Precision: 100% | Recall: 87.50% | F1: 93.33% | ~5ms per comparison

---

## Job Lifecycle

```
Queued → Running → Completed / Failed / Cancelled
                ↘ RetryPending (backoff) → Running
Paused ↔ Running
```

States: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED, PAUSED

---

## Common Commands

```bash
doppler run -- npm start                    # Dev server
npm run dashboard                           # Dashboard UI → localhost:8080
npm test                                    # Unit tests
npm run typecheck                           # TypeScript checks

# Duplicate detection
doppler run -- node --strip-types sidequest/pipeline-core/scan-orchestrator.ts /path/to/repo
doppler run -- RUN_ON_STARTUP=true node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# Similarity regression test
npx vitest run tests/unit/grouping.test.ts
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/status` | GET | Full system status |
| `/api/scans/start` | POST | Intra-project scan |
| `/api/scans/start-multi` | POST | Inter-project scan |
| `/api/scans/:id/status` | GET | Scan status |
| `/api/scans/:id/results` | GET | Scan results |
| `/api/jobs` | GET | List jobs |
| `/api/jobs/:id` | GET | Job details |
| `/api/jobs/:id/cancel` | POST | Cancel job |
| `/api/jobs/:id/retry` | POST | Retry failed job |
| `/api/pipelines` | GET | List pipelines |

---

## Data Models (TypeScript/Zod)

**CodeBlock**: `content`, `filePath`, `lineStart`, `lineEnd`, `functionName`, `tags` (NOT semantic_tags), `patternName`

**SemanticFeatures**: `httpStatusCodes: Set<number>`, `logicalOperators: Set<string>`, `semanticMethods: Set<string>`

**DuplicateGroup**: `representative: CodeBlock`, `duplicates: CodeBlock[]`, `similarityScore: number`, `layer: number`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| False positives | Check similarity threshold (default: 0.90) |
| Missing duplicates | Lower threshold or check normalization |
| Wrong function names | Verify backwards search in extract-blocks.ts |
| Field errors | Use `tags` not `semantic_tags` |
| 0 treated as false | Use `??` not `\|\|` |
| Timeout | Check 10-minute timeout, optimize scan |

---

## Key Files

| File | Purpose |
|------|---------|
| `sidequest/pipeline-core/scan-orchestrator.ts` | Pipeline coordinator |
| `sidequest/pipeline-core/similarity/structural.ts` | Similarity engine |
| `sidequest/pipeline-core/extractors/extract-blocks.ts` | Block extraction |
| `sidequest/pipeline-core/scanners/ast-grep-detector.ts` | Pattern detection (18 rules) |
| `sidequest/core/server.ts` | Base job queue |
| `sidequest/core/config.ts` | Centralized config |
| `sidequest/core/constants.ts` | Domain constants |

## Further Reading

- [System Data Flow](./SYSTEM-DATA-FLOW.md) | [Pipeline Data Flow](./pipeline-data-flow.md) | [Similarity Algorithm](./similarity-algorithm.md) | [README](./README.md) | [CLAUDE.md](../../CLAUDE.md)
