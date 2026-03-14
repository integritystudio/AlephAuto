# Condense: Zstd Dictionary Compression for Repomix Outputs

Implementation plan for integrating `.condense/dictionaries/dict_typescript.zdict` into the existing repomix workflow to reduce read payload sizes for LLM context loading.

> **Roadmap summary:** [`docs/roadmap/README.md`](../../docs/roadmap/README.md)
>
> **Sync note:** This is the canonical plan. A summary lives in `docs/roadmap/README.md`. Keep both documents in sync when updating scope, phases, or decisions.

## Problem

| Output file | Raw size | Repomix-compressed XML | Notes |
|---|---|---|---|
| `repomix.xml` | 1.8 MB | 604 KB (`repo-compressed.xml`) | Full codebase, comments/blanks stripped |
| `repomix-git-ranked.xml` | 3.8 MB | — | Git-ranked variant, no compressed form |
| `repomix-docs.xml` | 1.1 MB | — | Docs-only pack |
| `sidequest-utils.xml` | 120 KB | — | Subset pack |

Repomix's built-in `removeComments`/`removeEmptyLines` compression is lossy and operates at the text level. There is no binary compression step. The resulting XML files are loaded as-is into LLM context windows, consuming tokens proportional to raw byte count.

## Measured Compression Gains

### Individual `.ts` files (133 files, 1015 KB total)

| Method | Compressed | Ratio | vs no-dict |
|---|---|---|---|
| zstd -3 (no dict) | 305 KB | 3.4x | baseline |
| zstd -3 + dict | 233 KB | 4.5x | **23.8% smaller** |

### Representative files

| File | Raw | Dict | No-dict | Dict advantage |
|---|---|---|---|---|
| `sidequest/core/server.ts` (27 KB) | 27,121 B | 6,234 B (4.4x) | 7,721 B (3.5x) | +25% |
| `api/server.ts` (20 KB) | 20,312 B | 5,244 B (3.9x) | 6,760 B (3.0x) | +29% |
| `sidequest/core/constants.ts` (16 KB) | 16,228 B | 4,507 B (3.6x) | 5,511 B (2.9x) | +22% |

### Packed repomix XML outputs (diminishing returns)

| File | Dict (3) | No-dict (3) | Delta |
|---|---|---|---|
| `repo-compressed.xml` (604 KB) | 135 KB (4.6x) | 137 KB (4.5x) | +0.9% |
| `repomix.xml` (1.8 MB) | 469 KB (4.1x) | 464 KB (4.1x) | **-1.1%** (worse) |

The dictionary adds ~24% savings on individual small files but provides negligible benefit on already-large XML bundles. This is expected: large files have enough internal repetition that self-trained zstd matches dictionary-assisted compression.

## Key Insight: Where to Apply

The dictionary is valuable for **per-file storage and transfer**, not for compressing already-packed XML bundles. The integration should:

1. Compress individual `.ts`/`.js`/`.py` files when caching or storing them
2. Optionally compress repomix XML outputs (marginal gain, but consistent format)
3. NOT replace Repomix's text-level compression — these are complementary

## Architecture

```
scripts/repomix/
├── condense.ts              # Main entry: compress/decompress with dict
├── condense-repomix.ts      # Post-repomix hook: compress XML outputs
├── train-dictionary.ts      # Re-train dict from current codebase
└── CONDENSE-PLAN.md         # This document

.condense/
├── dictionaries/
│   └── dict_typescript.zdict  # Pre-trained zstd dictionary (110 KB)
└── cache/                     # Compressed file cache (gitignored)
    ├── api/server.ts.zst
    ├── sidequest/core/server.ts.zst
    └── ...

docs/repomix/
├── repomix.xml                # Existing: uncompressed full pack
├── repo-compressed.xml        # Existing: text-compressed pack
├── repomix.xml.zst            # NEW: zstd-compressed full pack
├── repo-compressed.xml.zst    # NEW: zstd-compressed text+binary pack
└── ...
```

## Implementation Plan

### Phase 1: Core compress/decompress utility (`scripts/repomix/condense.ts`)

Thin wrapper around `zstd` CLI (available at `/opt/homebrew/bin/zstd`).

```typescript
// scripts/repomix/condense.ts
import { execCommand } from '@shared/process-io';

const DICT_PATH = '.condense/dictionaries/dict_typescript.zdict';

export async function compress(inputPath: string, outputPath?: string): Promise<string>;
export async function decompress(inputPath: string, outputPath?: string): Promise<string>;
export async function compressBuffer(buf: Buffer): Promise<Buffer>;
export async function decompressBuffer(buf: Buffer): Promise<Buffer>;
```

- Uses `zstd -3 -D <dict>` for compression (level 3 is the sweet spot: 4.5x ratio at 423 MB/s)
- Falls back to no-dict if dictionary missing (graceful degradation)
- Returns output path on success

Dependencies: `@shared/process-io` (existing), `zstd` CLI (already installed)

### Phase 2: Post-repomix compression hook (`scripts/repomix/condense-repomix.ts`)

Runs after `repomix` CLI generates XML outputs. Compresses each output to `.zst` sidecar.

```typescript
// scripts/repomix/condense-repomix.ts
// 1. Glob docs/repomix/*.xml
// 2. For each: compress(xmlPath, `${xmlPath}.zst`)
// 3. Log sizes + ratios
// 4. Optionally update token-tree.txt with compressed sizes
```

Integration point: add to `package.json` scripts:

```jsonc
{
  "repomix:pack": "repomix && node --strip-types scripts/repomix/condense-repomix.ts",
  "repomix:pack:compressed": "repomix -c repomix-compressed.config.json && node --strip-types scripts/repomix/condense-repomix.ts"
}
```

### Phase 3: Dictionary re-training (`scripts/repomix/train-dictionary.ts`)

Periodic re-training to keep the dictionary current as the codebase evolves.

```typescript
// scripts/repomix/train-dictionary.ts
// 1. find all .ts/.js files (exclude node_modules, dist, tests)
// 2. zstd --train -o .condense/dictionaries/dict_typescript.zdict <files>
// 3. Benchmark: compress 10 representative files, log ratios
// 4. Compare against previous dict, warn if regression
```

Training frequency: monthly or after major refactors. Dictionary stays committed to git (110 KB, binary, changes infrequently).

### Phase 4: Per-file cache for context loading (optional)

`.condense/cache/` stores individually compressed files for fast LLM context assembly.

```
condense cache build          # compress all source files → .condense/cache/
condense cache read <path>    # decompress + return to stdout
condense cache invalidate     # rm stale entries based on mtime
```

This is the highest-value phase for the dictionary but also the most complex. Defer until phases 1-3 are validated.

## Integration with Existing Repomix Config

The root `repomix.config.json` already handles:
- File selection (`include`/`ignore` patterns)
- Text compression (`removeComments`, `removeEmptyLines`)
- Security scanning
- Git-ranked sorting

Condense operates **downstream** of repomix — it takes repomix's XML output and applies binary compression. No changes to `repomix.config.json` are needed.

## What NOT to Do

- Do not replace repomix's text-level compression — zstd and comment/blank removal are complementary
- Do not compress XML bundles expecting large gains — the dictionary shines on small individual files
- Do not add Node.js zstd bindings — the CLI is fast enough and avoids native module issues
- Do not store `.zst` files in `docs/repomix/` without the uncompressed originals — tools that read XML directly still need them
- Do not re-train the dictionary on every build — it's stable across small changes

## Acceptance Criteria

1. `scripts/repomix/condense.ts` compresses/decompresses files using the dict
2. `scripts/repomix/condense-repomix.ts` generates `.zst` sidecars for all XML outputs
3. `.condense/cache/` is in `.gitignore`
4. Dictionary re-training script works and benchmarks against previous dict
5. `npm run repomix:pack` produces both XML and `.zst` outputs
6. No changes to existing repomix config or output paths
