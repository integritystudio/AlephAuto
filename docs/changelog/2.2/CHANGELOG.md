# Changelog — v2.2.0

All notable changes for the v2.2 release cycle.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.2.0] - 2026-02-27

### Summary

Quality-review remediation and DRY cleanup after v2.1. Reduced complexity hotspots, fixed standards findings, consolidated duplicate worker usage in duplicate-detection pipeline flow, and updated backlog tracking.

### Fixed

- **SV3:** Replaced `== null` with explicit `=== null || === undefined` in `sidequest/pipeline-core/utils/error-helpers.ts` (`fe18a0f`)
- **CX1:** `frontend/src/hooks/useWebSocketConnection.ts` refactor and follow-up fixes (`4e3eb88`, `5963112`)
- **CS5:** `api/activity-feed.ts` split inline handlers and fixed high/medium findings (`86d0b3e`, `1fb547e`)
- **CX2-CX10:** Extracted helpers across tests/scripts to reduce complexity in target functions (`a9e0a56`)

### Changed

- `docs/BACKLOG.md` updated to mark CX1-CX5, CX8-CX10, CS5, SV2, and SV3 as completed (`7927f72`)
- Duplicate-detection flow refactor removed duplicated `DuplicateDetectionWorker` usage in pipeline path (`fb93b0c`)
- Follow-up duplicate-detection code review fixes landed in pipeline and worker configuration (`8f32310`)

### Notes

- Analyzer remediation summary commit captured as `aed7679` (session-style commit message with CX/SV/CS outcomes).

