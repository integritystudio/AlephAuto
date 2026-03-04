# Changelog — v2.3.x

All notable changes for the v2.3 release cycle.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.3.2] - 2026-03-04

### Summary

Resolved complexity backlog item `CX6` by refactoring the inter-project integration scan script into focused helper functions and retiring the item from active backlog.

### Changed

- Refactored `tests/integration/test-inter-project-scan.ts`:
  - Extracted argument/path resolution, scanner setup, scan execution, report generation, and output-printing helpers from `main()`.
  - Reduced `main()` to orchestration flow while preserving behavior and logging.
- Backlog `CX6` migrated and closed in `docs/BACKLOG.md`.

---

## [2.3.1] - 2026-03-04

### Summary

Backlog hygiene release. Migrated completed backlog items to changelog, retired a non-runnable MCP integration test, and removed stale Layer 3 TODO markers that were already implemented.

### Removed

- `tests/integration/test-mcp-server.ts` (retired)
  - The test referenced deleted binary `mcp-servers/duplicate-detection/index.js` removed earlier in commit `170ca02`.

### Changed

- Backlog `LOG8` migrated and closed (test retired).
- Backlog `LOG9` migrated and closed (stale TODO references removed):
  - `sidequest/pipeline-core/similarity/grouping.py`
  - `sidequest/pipeline-core/extractors/extract_blocks.py`
- `docs/BACKLOG.md` reduced to active items in complexity/smell/standards sections.

---

## [2.3.0] - 2026-03-03

### Summary

Pipeline-core cleanup focused on magic-number reduction and constants consolidation in Python similarity/extractor/reporting modules, plus utility scripts for repomix artifact generation.

### Added

- Repomix generation helper scripts:
  - `scripts/generate-repomix.sh`
  - `scripts/generate-repo-compressed.sh`
  - `scripts/generate-token-tree.sh`
  - `scripts/repomix-regen.sh`
  (commit `f69a95c`)

### Changed

- Centralized and expanded constants in `sidequest/pipeline-core/constants.py` (`56d2c5a`, `d71098e`, `99f96d5`, `ffb9601`, `ce97a5f`)
- Reduced magic-number footprint in pipeline-core and runner modules (commit message notes: `126 -> 31`) (`ce97a5f`)
- Extracted chart color values into constants for `collect_git_activity.py` (`1a9ce69`)
- Reworded effort comments in consolidation model to avoid false positives from magic-number tooling (`964abc5`)
- Replaced numbered docstring lists with bullet style in:
  - `sidequest/pipeline-core/similarity/grouping.py` (`4690b4d`)
  - `sidequest/pipeline-core/similarity/structural.py` (`f6d1717`)

### Notes

- Commit `f69a95c` also included backup snapshots under `.ast-grep-backups/` and `sidequest/pipeline-core/similarity/.ast-grep-backups/` along with script additions.
