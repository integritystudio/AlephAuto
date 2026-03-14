# Roadmap

Active implementation plans for AlephAuto.

---

## Condense: Zstd Dictionary Compression for Repomix Outputs

> **Canonical plan:** [`scripts/repomix/CONDENSE-PLAN.md`](../../scripts/repomix/CONDENSE-PLAN.md)
>
> **Sync note:** This section is a summary. The full implementation plan, acceptance criteria, and architecture live in `scripts/repomix/CONDENSE-PLAN.md`. Keep both documents in sync when updating scope, phases, or decisions.

### Motivation

Repomix packs the codebase into XML for LLM context loading. A pre-trained zstd dictionary (`.condense/dictionaries/dict_typescript.zdict`, 110 KB) compresses individual TypeScript files 24% better than vanilla zstd (4.5x vs 3.4x across 133 files). The gain is negligible on already-packed XML bundles — the dictionary targets per-file compression and post-pack sidecars.

### Phases

| Phase | Deliverable | Status |
|---|---|---|
| 1 | `scripts/repomix/condense.ts` — compress/decompress wrapper around `zstd -3 -D <dict>` | Planned |
| 2 | `scripts/repomix/condense-repomix.ts` — post-repomix hook generating `.zst` sidecars | Planned |
| 3 | `scripts/repomix/train-dictionary.ts` — periodic re-training with benchmark regression checks | Planned |
| 4 | `.condense/cache/` — per-file compressed cache for LLM context assembly (deferred) | Planned |

### Key Decisions

- Uses `zstd` CLI (`/opt/homebrew/bin/zstd`), not Node.js native bindings
- Dictionary stays committed to git (110 KB, changes infrequently)
- Operates downstream of repomix — no changes to `repomix.config.json`
- `.condense/cache/` is gitignored; `.condense/dictionaries/` is tracked
