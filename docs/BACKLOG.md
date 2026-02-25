# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-02-25

---

## Deferred / Blocked Items

| ID | Description | Reason |
|----|-------------|--------|
| LOG8 | `mcp-server.test.js` skipped — binary (`mcp-servers/duplicate-detection/index.js`) not implemented | Blocked on MCP server binary |
| LOG9 | TODO comments in `schema-enhancement-pipeline.js`, `grouping.py`, `extract_blocks.py` | Feature work (Layer 3 semantic equivalence), not cleanup |

---

## tcad-scraper Test Suite — Remaining Items (2026-02-24)

> **Repo:** `aledlie/tcad-scraper`
> **Completed:** TST-C1..C4 (Critical), TST-H1..H12 (High) — see [CHANGELOG 1.9.0](CHANGELOG.md)

### Medium — Redundancy and Noise

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| TST-M1 | `server/vitest.config.ts:68-70` | **`mockReset + clearMocks` redundant** — `mockReset: true` supersedes `clearMocks: true`. Drop `clearMocks`. | |
| TST-M2 | `server/src/__tests__/integration.test.ts:117-129` | **`if (!hasFrontend) return` instead of `test.skipIf`** — Tests silently pass with no assertion. 3 of 4 frontend tests use wrong pattern. (1 of 3 fixed in TST-H6.) | |
| TST-M3 | `server/src/__tests__/factories.ts:22-24` | **`resetFactoryCounter` exported but never called** — Counter accumulates across tests, latent isolation issue. Call in global `beforeEach` or use `crypto.randomUUID()`. | |
| TST-M4 | `server/src/__tests__/test-utils.ts:62-123` | **`skipIfRedisUnavailable` throws errors to "skip"** — Reports as failure, not skip. Functions unused — all tests use `isRedisAvailable` directly. Remove. | |
| TST-M5 | `server/src/__tests__/security.test.ts:196-199` | **Documentation-only test** — `expect(true).toBe(true)` with "This is a note" comment. Delete test case. | |
| TST-M6 | `src/__tests__/App.test.tsx:63-88` | **Two tests assert same thing** — Both render `<App>` and check `PropertySearchContainer`. Neither observes loading state. Collapse into one. | |
| TST-M7 | `src/utils/__tests__/formatters.test.ts:78-103` | **"Type safety" block duplicates "edge cases"** for null/undefined — Same calls, zero runtime value from TS annotations. Remove block. | |

### Low — Info

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| TST-L1 | `server/src/lib/__tests__/tcad-scraper.test.ts:188-307` | **Weak assertions** — `humanDelay` tests assert `expect(true).toBe(true)`, user agent tests assert only `expect(scraper).toBeDefined()`. | |

### Summary

| Priority | Count | Theme |
|----------|-------|-------|
| Medium | 7 | Redundant tests, unused helpers, silent skips |
| Low | 1 | Weak assertions |
| **Total** | **8** | All in tcad-scraper (separate repo) |
