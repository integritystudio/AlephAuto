# Code Review Report: ~/code/jobs

**Date:** 2026-02-25
**Tools:** ast-grep-mcp (complexity, code smells, security, standards, orphans, deduplication)
**Session:** `52ae960a-23f6-4dff-a5ee-622b62dacb38`

---

## Summary

| Tool | Status | Action Items |
|------|--------|-------------|
| Complexity | 33 violations | Refactor `useWebSocketConnection.ts` (CC 38) |
| Code Smells | 33 large classes | Investigate large class warnings in source |
| Security | 0 issues | None |
| Standards | 203 violations | Address `prefer-const` and `==` usage |
| Orphans | 151 files / 147 functions | Audit `sidequest/pipeline-core/` for dead code |
| Deduplication | 3 groups (low priority) | Defer -- test helpers, intentional |

---

## 1. Complexity Analysis

**154 functions analyzed across 208 files -- 33 exceed thresholds**

| Metric | Avg | Max | Threshold |
|--------|-----|-----|-----------|
| Cyclomatic | 4.37 | 38 | 10 |
| Cognitive | 3.23 | 38 | 15 |
| Nesting | -- | 4 | 4 |
| Length | -- | 174 | 50 |

### Critical

| File | Lines | Cyclomatic | Cognitive | Length |
|------|-------|-----------|-----------|--------|
| `frontend/src/hooks/useWebSocketConnection.ts` | 42-215 | **38** | **38** | **174** |

### High Cyclomatic (>= 13)

| File | Lines | Cyclomatic | Cognitive | Length |
|------|-------|-----------|-----------|--------|
| `tests/integration/test-error-classification-ui.ts` | 234-301 | 16 | 12 | 68 |
| `tests/accuracy/accuracy-test.ts` | 42-81 | 15 | 14 | 40 |
| `tests/integration/test-error-classification-ui.ts` | 306-372 | 14 | 12 | 67 |
| `sidequest/utils/refactor-test-suite.ts` | 874-978 | 13 | 12 | 105 |
| `tests/accuracy/metrics.ts` | 245-279 | 13 | 0 | 35 |

Remaining 27 violations are length-only (>50 lines), primarily in test files.

---

## 2. Code Smells

**4,114 total** (includes node_modules)

| Type | Count | Severity |
|------|-------|----------|
| Magic numbers | 4,081 | Low |
| Large classes | 33 | Medium/High |

Note: Magic number count is inflated by node_modules (`ip-address`, `zod`, `@noble/hashes`). The 33 large class findings are the actionable items.

---

## 3. Security Issues

**0 issues found.** Clean pass across all severity levels.

---

## 4. Standards Enforcement

**7 rules, 203 violations across 5 files**

| Rule | Violations | Notes |
|------|-----------|-------|
| `no-console-log` | 100 (capped) | Expected in scripts |
| `prefer-const` | 100 (capped) | Main actionable finding |
| `no-double-equals` | 3 | See below |
| `no-var` | 0 | Clean |
| `no-debugger` | 0 | Clean |
| `no-empty-catch` | skipped | Pattern parse error |

### Violations by File (no-console-log)

| File | Count |
|------|-------|
| `scripts/cleanup-error-logs.ts` | 32 |
| `scripts/validate-permissions.ts` | 19 |
| `tests/scripts/test-repomix-fix.ts` | 19 |
| `scripts/verify-setup.ts` | 18 |
| `tests/scripts/validate-test-paths.ts` | 12 |

### no-double-equals (3 violations)

Detected across the 5 scanned files. File/line details were truncated by the `max_violations=100` cap consumed by `no-console-log`. Re-run with `--rule no-double-equals` only to get exact locations.

---

## 5. Orphan Detection

**151 orphan files (uncertain), 147 orphan functions (likely)**

All file-level orphans have status "uncertain" (grep verification timed out -- expected for large projects). Function-level orphans are "likely" (no call sites found).

### Orphan Functions by Module (147 total)

#### sidequest/pipeline-core/extractors/extract_blocks.py (24 functions)

| Function | Lines | Size |
|----------|-------|------|
| `validate_file_path` | 51-57 | 7 |
| `validate_line_range` | 61-66 | 6 |
| `_debug` | 103-106 | 4 |
| `detect_language` | 179-190 | 12 |
| `_match_function_pattern` | 213-220 | 8 |
| `_search_file_for_function_name` | 223-254 | 32 |
| `extract_function_name` | 257-285 | 29 |
| `_get_function_name_from_tags` | 287-292 | 6 |
| `_try_add_by_function` | 295-321 | 27 |
| `_try_add_by_location` | 324-333 | 10 |
| `deduplicate_blocks` | 336-362 | 27 |
| `_create_code_block` | 365-399 | 35 |
| `extract_code_blocks` | 402-426 | 25 |
| `group_duplicates` | 429-442 | 14 |
| `generate_suggestions` | 445-488 | 44 |
| `_apply_strategy_rules` | 549-562 | 14 |
| `_determine_strategy` | 565-585 | 21 |
| `_generate_migration_steps` | 588-641 | 54 |
| `_generate_code_example` | 644-690 | 47 |
| `_calculate_roi` | 693-717 | 25 |
| `_is_breaking_change` | 720-732 | 13 |
| `_suggest_target_location` | 735-763 | 29 |
| `_estimate_effort` | 766-784 | 19 |
| `calculate_metrics` | 787-880 | 94 |
| `main` | 883-940 | 58 |

#### sidequest/pipeline-core/similarity/grouping.py (18 functions)

| Function | Lines | Size |
|----------|-------|------|
| `_check_method_chain` | 91-97 | 7 |
| `_check_http_status_codes` | 100-106 | 7 |
| `_check_logical_operators` | 109-120 | 12 |
| `_check_semantic_methods` | 123-129 | 7 |
| `_extract_function_names` | 141-160 | 20 |
| `_run_semantic_checks` | 163-189 | 27 |
| `calculate_code_complexity` | 192-220 | 29 |
| `is_complex_enough` | 223-241 | 19 |
| `calculate_group_quality_score` | 244-298 | 55 |
| `validate_exact_group_semantics` | 301-333 | 33 |
| `_try_accept_group` | 336-387 | 52 |
| `group_by_similarity` | 390-493 | 104 |
| `_group_by_exact_hash` | 496-510 | 15 |
| `_group_by_structural_similarity` | 513-575 | 63 |
| `_calculate_jaccard_similarity` | 594-610 | 17 |
| `_calculate_semantic_similarity` | 613-642 | 30 |
| `_intents_compatible` | 645-674 | 30 |
| `_group_by_semantic_similarity` | 677-742 | 66 |
| `_create_duplicate_group` | 745-783 | 39 |

#### sidequest/pipeline-core/scanners/timeout_detector.py (15 functions)

| Function | Lines | Size |
|----------|-------|------|
| `has_text_in_range` | 51-54 | 4 |
| `has_pattern_in_range` | 56-61 | 6 |
| `_detect_promise_race_no_timeout` | 72-89 | 18 |
| `_detect_loading_without_finally` | 92-110 | 19 |
| `_detect_async_no_error_handling` | 113-134 | 22 |
| `_detect_settimeout_no_cleanup` | 137-158 | 22 |
| `_should_include_file` | 177-179 | 3 |
| `scan_directory` | 189-203 | 15 |
| `_find_files` | 205-211 | 7 |
| `_scan_file` | 213-224 | 12 |
| `_check_line` | 226-231 | 6 |
| `_calculate_statistics` | 233-246 | 14 |
| `generate_report` | 248-275 | 28 |
| `_add_findings_by_severity` | 277-298 | 22 |
| `main` | 301-338 | 38 |

#### sidequest/pipeline-runners/collect_git_activity.py (14 functions)

| Function | Lines | Size |
|----------|-------|------|
| `find_git_repos` | 62-122 | 61 |
| `get_repo_stats` | 125-165 | 41 |
| `analyze_languages` | 168-187 | 20 |
| `find_project_websites` | 190-205 | 16 |
| `categorize_repositories` | 208-240 | 33 |
| `create_pie_chart_svg` | 243-303 | 61 |
| `create_bar_chart_svg` | 306-340 | 35 |
| `_calculate_date_range` | 347-367 | 21 |
| `_resolve_output_dir` | 370-376 | 7 |
| `_collect_repository_stats` | 379-396 | 18 |
| `_compile_activity_data` | 399-430 | 32 |
| `_print_summary` | 433-458 | 26 |
| `generate_jekyll_report` | 461-564 | 104 |
| `generate_visualizations` | 567-611 | 45 |
| `main` | 614-670 | 57 |

#### sidequest/pipeline-core/similarity/structural.py (12 functions)

| Function | Lines | Size |
|----------|-------|------|
| `extract_semantic_features` | 29-93 | 65 |
| `normalize_code` | 96-189 | 94 |
| `calculate_ast_hash` | 192-200 | 9 |
| `calculate_levenshtein_similarity` | 203-212 | 10 |
| `extract_logical_operators` | 215-239 | 25 |
| `extract_http_status_codes` | 242-258 | 17 |
| `extract_semantic_methods` | 261-276 | 16 |
| `extract_method_chain` | 279-328 | 50 |
| `compare_method_chains` | 331-370 | 40 |
| `calculate_semantic_penalty` | 373-419 | 47 |
| `calculate_structural_similarity` | 422-482 | 61 |
| `are_structurally_similar` | 485-492 | 8 |

#### sidequest/pipeline-core/models/scan_report.py (11 functions)

| Function | Lines | Size |
|----------|-------|------|
| `is_multi_repository` | 149-151 | 3 |
| `total_scanned_files` | 155-157 | 3 |
| `total_scanned_lines` | 161-163 | 3 |
| `duplication_severity` | 167-184 | 18 |
| `consolidation_opportunity_score` | 188-213 | 26 |
| `add_repository` | 215-217 | 3 |
| `add_code_block_id` | 219-222 | 4 |
| `add_duplicate_group_id` | 224-227 | 4 |
| `add_suggestion_id` | 229-232 | 4 |
| `generate_executive_summary` | 234-267 | 34 |
| `to_summary_dict` | 269-284 | 16 |

#### sidequest/pipeline-core/annotators/semantic_annotator.py (9 functions)

| Function | Lines | Size |
|----------|-------|------|
| `_compile_patterns` | 288-292 | 5 |
| `all_tags` | 45-47 | 3 |
| `to_dict` | 49-58 | 10 |
| `get_timing_report` | 356-362 | 7 |
| `extract_annotation` | 364-417 | 54 |
| `_extract_operations` | 419-431 | 13 |
| `_extract_domains` | 433-447 | 15 |
| `_extract_patterns` | 449-461 | 13 |
| `_extract_data_types` | 463-474 | 12 |
| `_infer_intent` | 476-503 | 28 |

#### sidequest/pipeline-core/models/duplicate_group.py (8 functions)

| Function | Lines | Size |
|----------|-------|------|
| `validate_min_members` | 122-126 | 5 |
| `validate_canonical_in_members` | 130-135 | 6 |
| `deduplication_potential` | 139-148 | 10 |
| `impact_score` | 152-178 | 27 |
| `is_cross_repository` | 182-184 | 3 |
| `priority_level` | 188-201 | 14 |
| `add_member` | 203-208 | 6 |
| `remove_member` | 210-219 | 10 |
| `set_canonical` | 221-226 | 6 |

#### sidequest/pipeline-core/models/consolidation_suggestion.py (7 functions)

| Function | Lines | Size |
|----------|-------|------|
| `round_impact_score` | 195-197 | 3 |
| `priority` | 201-217 | 17 |
| `roi_score` | 221-243 | 23 |
| `is_quick_win` | 247-257 | 11 |
| `add_migration_step` | 259-275 | 17 |
| `add_benefit` | 277-280 | 4 |
| `add_drawback` | 282-285 | 4 |
| `to_markdown_summary` | 287-311 | 25 |

#### sidequest/pipeline-core/models/code_block.py (4 functions)

| Function | Lines | Size |
|----------|-------|------|
| `validate_line_range` | 62-66 | 5 |
| `content_hash` | 168-176 | 9 |
| `structural_hash` | 180-188 | 9 |
| `to_dict_for_comparison` | 190-205 | 16 |

#### sidequest/pipeline-core/similarity/semantic.py (4 functions)

| Function | Lines | Size |
|----------|-------|------|
| `are_semantically_compatible` | 19-62 | 44 |
| `calculate_tag_overlap` | 65-85 | 21 |
| `_extract_function_tag` | 88-93 | 6 |
| `validate_duplicate_group` | 96-124 | 29 |

#### sidequest/pipeline-core/utils/timing.py (4 functions)

| Function | Lines | Size |
|----------|-------|------|
| `record` | 35-44 | 10 |
| `avg_ms` | 47-51 | 5 |
| `to_dict` | 53-62 | 10 |
| `elapsed_ms` | 93-95 | 3 |

#### sidequest/pipeline-core/models/test_models.py (3 functions)

| Function | Lines | Size |
|----------|-------|------|
| `calculate_impact_score` | 168-177 | 10 |
| `calculate_roi_score` | 193-197 | 5 |
| `main` | 215-231 | 17 |

#### scripts/analyze-duplicates.py (3 functions)

| Function | Lines | Size |
|----------|-------|------|
| `get_file_path` | 17-23 | 7 |
| `analyze_report` | 26-54 | 29 |
| `find_latest_report` | 57-67 | 11 |

#### sidequest/pipeline-core/similarity/config.py (2 functions)

| Function | Lines | Size |
|----------|-------|------|
| `to_dict` | 57-98 | 42 |
| `print_config` | 101-106 | 6 |

#### sidequest/pipeline-core/extractors/test_extract_blocks.py (1 function)

| Function | Lines | Size |
|----------|-------|------|
| `main` | 325-375 | 51 |

#### sidequest/pipeline-core/similarity/test_grouping_layer3.py (1 function)

| Function | Lines | Size |
|----------|-------|------|
| `run_tests` | 404-442 | 39 |

#### sidequest/pipeline-core/annotators/test_semantic_annotator.py (1 function)

| Function | Lines | Size |
|----------|-------|------|
| `run_tests` | 387-428 | 42 |

---

### Orphan Files (151 total, all "uncertain")

Status: All marked "uncertain" because grep verification timed out. Test files and config files invoked by runners don't have explicit imports.

#### Source Files (non-test)

| File | Lines | Language |
|------|-------|----------|
| `sidequest/pipeline-core/doppler-health-monitor.ts` | 286 | typescript |
| `sidequest/utils/dependency-validator.ts` | 151 | typescript |
| `sidequest/pipeline-core/scanners/timeout_detector.py` | 343 | python |
| `scripts/archive/migrate-reports-to-db.js` | 42 | javascript |
| `scripts/cleanup-error-logs.ts` | 380 | typescript |
| `sidequest/pipeline-core/scanners/codebase-health-scanner.ts` | 249 | typescript |
| `frontend/src/services/websocket.ts` | 418 | typescript |
| `sidequest/types/duplicate-detection-types.ts` | 437 | typescript |
| `scripts/validate-permissions.ts` | 165 | typescript |
| `frontend/src/store/dashboard.ts` | 147 | typescript |
| `sidequest/pipeline-core/scanners/timeout-pattern-detector.ts` | 526 | typescript |
| `sidequest/utils/pipeline-names.ts` | 49 | typescript |
| `frontend/src/hooks/useWebSocketConnection.ts` | 252 | typescript |
| `docs/setup/sentry-to-discord.js` | 252 | javascript |
| `api/server.ts` | 462 | typescript |
| `scripts/fix-types.ts` | 100 | typescript |
| `sidequest/pipeline-core/utils/timing.py` | 109 | python |
| `frontend/tailwind.config.js` | 25 | javascript |
| `api/preload.ts` | 10 | typescript |
| `scripts/archive/migrate-db-to-render.js` | 262 | javascript |
| `api/routes/pipelines.ts` | 305 | typescript |
| `sidequest/utils/doppler-resilience.example.js` | 290 | javascript |
| `scripts/verify-setup.ts` | 246 | typescript |
| `docs/setup/configure-discord-alerts.js` | 214 | javascript |
| `scripts/analyze-duplicates.py` | 80 | python |
| `sidequest/pipeline-runners/duplicate-detection-pipeline.ts` | 1002 | typescript |
| `api/routes/reports.ts` | 272 | typescript |
| `sidequest/pipeline-core/utils/process-helpers.ts` | 16 | typescript |
| `sidequest/pipeline-runners/git-activity-pipeline.ts` | 226 | typescript |
| `frontend/src/vite-env.d.ts` | 12 | typescript |
| `sidequest/pipeline-runners/dashboard-populate-pipeline.ts` | 144 | typescript |
| `frontend/vite.config.ts` | 16 | typescript |
| `sidequest/pipeline-runners/claude-health-pipeline.ts` | 444 | typescript |
| `api/routes/scans.ts` | 229 | typescript |
| `sidequest/pipeline-core/utils/timing-helpers.ts` | 63 | typescript |
| `sidequest/pipeline-runners/gitignore-pipeline.ts` | 209 | typescript |
| `scripts/archive/generate-retroactive-reports.js` | 187 | javascript |
| `api/types/shared-schemas.ts` | 72 | typescript |
| `packages/shared-logging/src/logger.ts` | 71 | typescript |
| `sidequest/pipeline-runners/repo-cleanup-pipeline.ts` | 217 | typescript |
| `sidequest/pipeline-runners/plugin-management-pipeline.ts` | 205 | typescript |
| `frontend/postcss.config.js` | 7 | javascript |
| `sidequest/pipeline-runners/schema-enhancement-pipeline.ts` | 321 | typescript |
| `sidequest/pipeline-core/scanners/root-directory-analyzer.ts` | 617 | typescript |
| `sidequest/pipeline-runners/bugfix-audit-pipeline.ts` | 250 | typescript |
| `api/middleware/auth.ts` | 99 | typescript |
| `sidequest/pipeline-core/types/scan-orchestrator-types.ts` | 289 | typescript |
| `api/middleware/error-handler.ts` | 74 | typescript |
| `frontend/src/services/api.ts` | 268 | typescript |
| `sidequest/pipeline-runners/collect_git_activity.py` | 675 | python |
| `sidequest/pipeline-core/utils/fs-helpers.ts` | 67 | typescript |
| `scripts/archive/setup-github-pages-dns.js` | 179 | javascript |
| `api/routes/repositories.ts` | 302 | typescript |
| `api/routes/jobs.ts` | 383 | typescript |
| `sidequest/utils/time-helpers.ts` | 55 | typescript |
| `eslint.config.js` | 56 | javascript |

#### Test Files (90 total)

All test files (`.test.ts`, `test-*.ts`, `validate-*.ts`) are listed in the full orphan scan but omitted here for brevity. These are invoked by test runners, not explicit imports.

---

## 6. Deduplication Analysis

**3 duplicate groups found** -- all in Python test files (`sidequest/pipeline-core/`), all scored low priority (34.5/100). Test helper functions with similar structure -- intentional duplication, safe to defer.

---

## 7. Data Gaps and Follow-Up

| Gap | Action |
|-----|--------|
| `no-double-equals` locations | Re-run `enforce_standards_tool` with `rule_set="no-double-equals"` or `max_violations=0` |
| `prefer-const` locations | Same -- re-run with higher cap or filtered rule |
| `no-empty-catch` skipped | Pattern `catch ($E) {}` failed to parse -- investigate ast-grep pattern syntax |
| Orphan file verification | All 151 files marked "uncertain" -- grep timed out on large codebase. Manual audit recommended for `sidequest/pipeline-core/` |
| Complexity function names | Reported as "unknown" -- ast-grep couldn't extract names from TS AST |

---

## Priority Actions

1. **P0** -- Refactor `frontend/src/hooks/useWebSocketConnection.ts` (CC 38, cognitive 38, 174 lines)
2. **P1** -- Audit `sidequest/pipeline-core/` for dead code (147 likely orphan functions, 47K lines)
3. **P2** -- Fix 3 `==` comparisons (re-run to locate)
4. **P2** -- Address `prefer-const` violations in scripts
5. **P3** -- Investigate 33 large class warnings in source (excluding node_modules)
