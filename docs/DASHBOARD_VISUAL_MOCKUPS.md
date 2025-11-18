# AlephAuto Dashboard - Visual Mockups & Reference

This document contains detailed ASCII mockups and visual specifications for dashboard implementation.

---

## 1. Full Dashboard - Desktop View (1200px+)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚙ AlephAuto Dashboard              ● Healthy | 3 running | 2 queued              Updated 2s ago  ⚙ │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐
│  PIPELINE STATUS         │  │  JOB QUEUE & ACTIVE      │  │  RECENT ACTIVITY         │
├──────────────────────────┤  ├──────────────────────────┤  ├──────────────────────────┤
│                          │  │ Capacity: 3/5 (60%)      │  │ Filter: [All ▼]         │
│ ◆ Duplicate Detection   │  │ Queued: 2 jobs           │  │                          │
│   RUNNING ━━━━░ 67%      │  │                          │  │ ✓ 14:32 Duplicate Detec │
│   342 / 510 repos        │  │ ─── ACTIVE JOBS ───      │  │     2,481 duplicates     │
│ [Details]                │  │                          │  │     [View report]        │
│                          │  │ 1. scan:ai-framework     │  │                          │
│ ◆ Git Activity Reporter  │  │    ████████░ 84%        │  │ ▸ 14:28 Plugin audit     │
│   IDLE ✓                 │  │    342 / 407 blocks      │  │     started              │
│   Last: 2 hours ago      │  │    CPU: 24% | RAM: 145MB │  │                          │
│ [Details]                │  │    [Cancel] [Log]       │  │ ✗ 14:15 Git activity     │
│                          │  │                          │  │     FAILED               │
│ ◆ Plugin Management      │  │ 2. git-weekly-report    │  │     [Retry] [View log]   │
│   QUEUED (position: 2)   │  │    ██████░░░ 61%        │  │                          │
│   Estimated: in 3m       │  │    8 / 13 repos          │  │ ◐ 14:12 Progress: 68%    │
│ [Details]                │  │    CPU: 8% | RAM: 32MB  │  │                          │
│                          │  │    [Cancel] [Log]       │  │ ▸ 14:05 Plugin audit     │
│ ◆ Claude Health Monitor  │  │                          │  │     queued (position: 2) │
│   FAILED ⚠               │  │ 3. plugin-audit (0:19)  │  │                          │
│   Redis connection lost  │  │    ████████████ 100%    │  │ ✓ 13:58 Claude health    │
│   Retry: in 2m 15s       │  │    Finalizing...         │  │     check passed         │
│   [View error]           │  │    [Cancel] [Log]       │  │                          │
│   [Manual retry]         │  │                          │  │ ▸ 13:45 Plugin audit     │
│                          │  │ ─── QUEUED (2) ───       │  │     started              │
│                          │  │                          │  │                          │
│                          │  │ → claude-health (2m)    │  │ [Auto-scroll]            │
│                          │  │ → scan:jobs (1m)         │  │                          │
│                          │  │                          │  │                          │
└──────────────────────────┘  └──────────────────────────┘  └──────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ DOCUMENTATION                                                                                    │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Getting Started] [Components] [Configuration] [Logs] [Errors]                                  │
│                                                                                                  │
│ Getting Started                                                                                  │
│                                                                                                  │
│ AlephAuto is a job queue framework for automation pipelines. This dashboard provides             │
│ real-time monitoring of job execution, queue depth, and historical activity.                    │
│                                                                                                  │
│ Quick Links:                                                                                     │
│  • API Documentation                                                                             │
│  • Configure Pipelines                                                                          │
│  • View System Logs                                                                              │
│  • Contact Support                                                                               │
│                                                                                                  │
│ [Collapse] [Export as PDF]                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Pipeline Status Card - Expanded State

```
┌──────────────────────────────────────────┐
│ ▼ ◆ Duplicate Detection                 │
├──────────────────────────────────────────┤
│                                          │
│ Status: RUNNING                          │
│ Progress: 342 / 510 repos (67%)          │
│                                          │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ 0%                                   100%│
│                                          │
│ Current Job: scan-repo:ai-framework     │
│ Elapsed: 3h 42m                          │
│ Estimated Remaining: 1h 52m              │
│                                          │
│ ─── Job Statistics ───                   │
│ Jobs in pipeline: 5 (3 active)           │
│ Avg job duration: 8m 32s                 │
│ Total duplicates found: 2,481            │
│                                          │
│ ─── Success History (last 10 runs) ───   │
│ ▁▁▂▂▂▃▃▃▃▃  Success rate: 95% (9/10)     │
│ (▁=failed, ▂=partial, ▃=success)         │
│                                          │
│ Last error: 2 days ago                   │
│ Error: Timeout while processing repo     │
│                                          │
│ [View full history] [View details]       │
│ [Cancel pipeline] [Manual trigger]       │
│                                          │
└──────────────────────────────────────────┘
```

---

## 3. Job Queue - Detailed View

```
┌─────────────────────────────────────────────────┐
│ JOB QUEUE & ACTIVE JOBS                        │
├─────────────────────────────────────────────────┤
│                                                 │
│ Capacity: 3 / 5 slots (60%)                    │
│ ███░░ 60%                                       │
│                                                 │
│ Queue Depth (24h history):                      │
│                                                 │
│ 5 ┤         ╱╲                                   │
│ 4 ┤    ╱╲  ╱  ╲      ╱╲                         │
│ 3 ┤   ╱  ╲╱    ╲    ╱  ╲                        │
│ 2 ┤  ╱          ╲  ╱    ╲                       │
│ 1 ┤ ╱            ╲╱      ╲                      │
│ 0 ┤────────────────────────                     │
│   0    6   12   18   24 (hours ago)             │
│                                                 │
│ ─── ACTIVE JOBS (3) ───                        │
│                                                 │
│ ┌──────────────────────────────────────┐       │
│ │ 1. scan-repo:ai-framework            │       │
│ │    Duplicate Detection Pipeline       │       │
│ │    ████████░ 84%                     │       │
│ │    342 / 407 blocks | 3:42 elapsed   │       │
│ │    CPU: 24% | Memory: 145 MB         │       │
│ │    [Cancel] [View Log] [Details]    │       │
│ └──────────────────────────────────────┘       │
│                                                 │
│ ┌──────────────────────────────────────┐       │
│ │ 2. git-weekly-report                │       │
│ │    Git Activity Reporter             │       │
│ │    ██████░░░ 61%                     │       │
│ │    8 / 13 repos | 5:21 elapsed       │       │
│ │    CPU: 8% | Memory: 32 MB           │       │
│ │    [Cancel] [View Log] [Details]    │       │
│ └──────────────────────────────────────┘       │
│                                                 │
│ ┌──────────────────────────────────────┐       │
│ │ 3. plugin-audit                      │       │
│ │    Plugin Management Pipeline         │       │
│ │    ████████████ 100%                 │       │
│ │    Finalizing... | 0:19 elapsed      │       │
│ │    CPU: 12% | Memory: 54 MB          │       │
│ │    [Cancel] [View Log] [Details]    │       │
│ └──────────────────────────────────────┘       │
│                                                 │
│ ─── QUEUED (2) ───                             │
│                                                 │
│ → claude-health-check                          │
│   Position: 1 | Queued: 2 minutes ago          │
│                                                 │
│ → scan-repo:jobs                               │
│   Position: 2 | Queued: 1 minute ago           │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 4. Recent Activity - Detailed Feed

```
┌──────────────────────────────────────────────────┐
│ RECENT ACTIVITY                                  │
├──────────────────────────────────────────────────┤
│ Filter: [All ▼]  [Errors only] [Last 24h]       │
│ [✓] Auto-scroll              [3 new items ↓]   │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ ✓ 14:32  Duplicate Detection COMPLETED      │ │
│ │     2,481 duplicates found in 510 repos     │ │
│ │     Processing time: 3h 47m                  │ │
│ │     [View report] [Export CSV] [Retry]      │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ ▸ 14:28  Plugin Audit STARTED               │ │
│ │     Scanning 62 installed plugins            │ │
│ │                                              │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ ✗ 14:15  Git Activity Report FAILED        │ │
│ │     Error: Repository unreachable            │ │
│ │     (https://github.com/org/private-repo)    │ │
│ │     [Retry] [View log] [Ignore]             │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ◐ 14:12  Duplicate Detection PROGRESS          │
│     Processing: ai-framework                    │
│     347 / 510 repos (68%)                       │
│                                                  │
│ ▸ 14:05  Plugin Audit QUEUED                   │
│     Position: 2 in queue                        │
│                                                  │
│ ✓ 13:58  Claude Health Check PASSED            │
│     All components nominal                      │
│                                                  │
│ ▸ 13:45  Plugin Audit STARTED                  │
│     Scanning 62 installed plugins               │
│                                                  │
│ ◐ 13:42  Duplicate Detection PROGRESS          │
│     Processing: frontend-lib                    │
│     298 / 510 repos (58%)                       │
│                                                  │
│ ✓ 13:15  Git Activity Report COMPLETED         │
│     Generated for last 30 days                  │
│     Lines changed: +18,234 / -4,521             │
│                                                  │
│ ▸ 13:00  Duplicate Detection STARTED           │
│     Scanning 510 repositories                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 5. Header States

### Healthy State

```
┌────────────────────────────────────────────────────────────┐
│ ⚙ AlephAuto Dashboard   ● Healthy   3 active • 2 queued    │
│                         Updated 2s ago                      │
└────────────────────────────────────────────────────────────┘
```

### Degraded State (WebSocket Disconnected)

```
┌────────────────────────────────────────────────────────────┐
│ ⚙ AlephAuto Dashboard   ● Degraded  3 active • 2 queued    │
│                         Updated 5s ago (polling)            │
├────────────────────────────────────────────────────────────┤
│ ⚠ WebSocket disconnected (retrying 3/10)                   │
│ Real-time updates paused. Using polling fallback (5s).     │
│ Last successful connection: 2 minutes ago                  │
└────────────────────────────────────────────────────────────┘
```

### Error State

```
┌────────────────────────────────────────────────────────────┐
│ ⚙ AlephAuto Dashboard   ● Error    0 active • 0 queued     │
│                         Updated 1m ago (offline)            │
├────────────────────────────────────────────────────────────┤
│ ✗ API server unavailable                                   │
│ Failed to connect to http://localhost:3000                 │
│ [Retry] [View offline cache] [Settings]                    │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Modal: Job Details

```
╔════════════════════════════════════════════════════╗
║           JOB DETAILS - scan-repo:ai-framework     ║ ✕
╠════════════════════════════════════════════════════╣
║                                                    ║
║ Status: RUNNING                                    ║
║ Progress: 84% (342 / 407 blocks)                  ║
║                                                    ║
║ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ║
║                                                    ║
║ ─── Timing ───                                     ║
║ Created: 2025-11-17 10:50:00 (3h 42m ago)        ║
║ Started: 2025-11-17 10:50:15                      ║
║ Elapsed: 3h 42m                                    ║
║ Estimated completion: 1h 52m                      ║
║                                                    ║
║ ─── Resources ───                                  ║
║ CPU: 24% | Memory: 145 MB / 256 MB (57%)         ║
║ Disk I/O: 234 MB read, 45 MB written             ║
║                                                    ║
║ ─── Pipeline ───                                   ║
║ Pipeline: Duplicate Detection (duplicate-detect)  ║
║ Job type: Repository scan                         ║
║ Current subtask: Extracting code blocks           ║
║                                                    ║
║ ─── Repository ───                                 ║
║ Path: /Users/alyshialedlie/code/ai-framework     ║
║ Git: main (abc1234)                               ║
║ Last modified: 3 hours ago                        ║
║                                                    ║
║ ─── Actions ───                                    ║
║                                                    ║
║ [Cancel Job] [View Full Log] [Export Metadata]   ║
║ [Retry] [Priority Up] [Settings]                 ║
║                                                    ║
╚════════════════════════════════════════════════════╝
```

---

## 7. Modal: Error Details

```
╔════════════════════════════════════════════════════╗
║  ERROR DETAILS - Git Activity Report (14:15)      ║ ✕
╠════════════════════════════════════════════════════╣
║                                                    ║
║ Status: FAILED                                     ║
║ Pipeline: Git Activity Reporter                   ║
║                                                    ║
║ ─── Error Message ───                              ║
║ Repository unreachable                            ║
║ https://github.com/org/private-repo               ║
║                                                    ║
║ ─── Root Cause ───                                 ║
║ HTTP 403: Forbidden                               ║
║ Authentication token expired or insufficient      ║
║ permissions                                        ║
║                                                    ║
║ ─── Stack Trace ───                                ║
║                                                    ║
║ Error: Repository unreachable                      ║
║     at fetchRepository (lib/git-scanner.js:234)   ║
║     at processRepo (pipelines/git-activity:156)   ║
║     at runJobHandler (sidequest/server.js:94)     ║
║                                                    ║
║ ─── Suggested Fixes ───                            ║
║                                                    ║
║ 1. Refresh authentication token in configuration  ║
║    [Configure auth]                               ║
║                                                    ║
║ 2. Check network connectivity to github.com       ║
║    [Run connectivity check]                       ║
║                                                    ║
║ 3. Verify repository access permissions           ║
║    [View permissions]                             ║
║                                                    ║
║ ─── Retry Options ───                              ║
║                                                    ║
║ [Retry immediately]                               ║
║ [Retry with exponential backoff]                  ║
║ [Ignore & continue] [View documentation]         ║
║                                                    ║
╚════════════════════════════════════════════════════╝
```

---

## 8. Modal: Log Viewer

```
╔════════════════════════════════════════════════════╗
║ LOG VIEWER - scan-repo:ai-framework               ║ ✕
╠════════════════════════════════════════════════════╣
║ Level: [All ▼] | [Error] [Warn] [Info] [Debug]    ║
║ Search: [___________________] | [Clear] [Export]  ║
║ [Follow tail] ↓                                   ║
├────────────────────────────────────────────────────┤
║                                                    ║
║ 10:50:23 [INFO]  Job started: scan-repo           ║
║ 10:50:24 [DEBUG] Initializing repository scan     ║
║ 10:50:25 [DEBUG] Found 510 repositories           ║
║ 10:50:26 [INFO]  Starting parallel processing     ║
║ 10:51:15 [INFO]  Processing: ai-framework         ║
║ 10:51:16 [DEBUG] Extracting code blocks           ║
║ 10:51:47 [DEBUG] Found 407 blocks                 ║
║ 10:51:48 [INFO]  Calculating similarity scores    ║
║ 10:52:15 [DEBUG] Found 24 duplicates              ║
║ ...                                                ║
║ 14:32:08 [INFO]  Job completed: scan-repo         ║
║ 14:32:09 [INFO]  Results saved to database        ║
║ 14:32:10 [INFO]  Total time: 3h 47m               ║
║                                                    ║
║ [Copy all] [Clear] [Download] [Close]            ║
║                                                    ║
╚════════════════════════════════════════════════════╝
```

---

## 9. Tablet View (768px-1199px) - 2 Column Layout

```
┌─────────────────────────────────────────┐
│ ⚙ AlephAuto Dashboard ● Healthy         │
└─────────────────────────────────────────┘

┌─────────────────────┐  ┌────────────────┐
│  PIPELINE STATUS    │  │  JOB QUEUE &   │
│                     │  │  ACTIVITY      │
│  ◆ Duplicate Det    │  │  (combined)    │
│    RUNNING 67%      │  │                │
│  [Details]          │  │  Capacity:     │
│                     │  │  3/5 (60%)     │
│  ◆ Git Activity     │  │                │
│    IDLE ✓           │  │  ─── ACTIVE   │
│  [Details]          │  │                │
│                     │  │  1. scan-repo  │
│  ◆ Plugin Mgmt      │  │     ████░ 84% │
│    QUEUED           │  │                │
│  [Details]          │  │  2. git-report │
│                     │  │     ███░░ 61%  │
│  ◆ Claude Health    │  │                │
│    FAILED ⚠         │  │  ─── QUEUED   │
│  [Details]          │  │  → claude-h    │
│                     │  │  → scan-repo   │
└─────────────────────┘  └────────────────┘

┌──────────────────────────────────────────┐
│ DOCUMENTATION                            │
├──────────────────────────────────────────┤
│ [Getting Started] [Components]           │
│ [Configuration]   [Logs] [Errors]        │
│                                          │
│ Content area...                          │
│                                          │
└──────────────────────────────────────────┘
```

---

## 10. Mobile View (< 768px) - Single Column

```
┌─────────────────────────────────────┐
│ ⚙ AlephAuto ● Healthy              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ PIPELINE STATUS                     │
├─────────────────────────────────────┤
│ ▼ ◆ Duplicate Detection             │
│   RUNNING 67%                       │
│   [Details]                         │
│ ▶ ◆ Git Activity                    │
│   IDLE ✓                            │
│ ▶ ◆ Plugin Mgmt                     │
│   QUEUED                            │
│ ▶ ◆ Claude Health                   │
│   FAILED ⚠                          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ JOB QUEUE & ACTIVE JOBS             │
├─────────────────────────────────────┤
│ Capacity: 3/5 (60%)                 │
│ ███░░ 60%                           │
│                                     │
│ ─── ACTIVE ───                      │
│                                     │
│ 1. scan-repo:ai-framework           │
│    ████████░ 84%                    │
│    [Cancel] [Log] [Details]        │
│                                     │
│ 2. git-weekly-report                │
│    ██████░░░ 61%                    │
│    [Cancel] [Log] [Details]        │
│                                     │
│ ─── QUEUED (2) ───                  │
│ → claude-health (1)                 │
│ → scan-repo:jobs (2)                │
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ RECENT ACTIVITY                     │
├─────────────────────────────────────┤
│ Filter: [All ▼]                     │
│ [Auto-scroll]                       │
│                                     │
│ ✓ 14:32 Duplicate Detection ✓       │
│   [Details]                         │
│                                     │
│ ▸ 14:28 Plugin Audit started        │
│                                     │
│ ✗ 14:15 Git Activity FAILED         │
│   [Retry] [View log]                │
│                                     │
│ [Load more...]                      │
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ DOCUMENTATION                       │
├─────────────────────────────────────┤
│ Tabs (as accordion):                │
│                                     │
│ ▼ Getting Started                   │
│   [Content visible]                 │
│                                     │
│ ▶ Components                        │
│ ▶ Configuration                     │
│ ▶ Logs                              │
│ ▶ Errors                            │
│                                     │
└─────────────────────────────────────┘
```

---

## 11. Color Palette Reference

### Primary Colors

```
Background:     #FFFFFF (RGB: 255, 255, 255)
Text Primary:   #1A1A1A (RGB: 26, 26, 26)
Text Secondary: #666666 (RGB: 102, 102, 102)
Border Light:   #CCCCCC (RGB: 204, 204, 204)
Border Dark:    #999999 (RGB: 153, 153, 153)
Divider:        #EEEEEE (RGB: 238, 238, 238)
```

### Semantic Colors

```
Success (Green):
  Light:        #ECFDF5 (RGB: 236, 253, 245)
  Main:         #10B981 (RGB: 16, 185, 129)
  Dark:         #047857 (RGB: 4, 120, 87)
  Text:         #064E3B (RGB: 6, 78, 59)

Warning (Amber):
  Light:        #FFFBEB (RGB: 255, 251, 235)
  Main:         #F59E0B (RGB: 245, 158, 11)
  Dark:         #D97706 (RGB: 217, 119, 6)
  Text:         #78350F (RGB: 120, 53, 15)

Error (Red):
  Light:        #FEF2F2 (RGB: 254, 242, 242)
  Main:         #EF4444 (RGB: 239, 68, 68)
  Dark:         #DC2626 (RGB: 220, 38, 38)
  Text:         #7F1D1D (RGB: 127, 29, 29)

Info (Blue):
  Light:        #EFF6FF (RGB: 239, 246, 255)
  Main:         #3B82F6 (RGB: 59, 130, 246)
  Dark:         #1D4ED8 (RGB: 29, 78, 216)
  Text:         #1E3A8A (RGB: 30, 58, 138)

Neutral (Gray):
  Light:        #F3F4F6 (RGB: 243, 244, 246)
  Main:         #6B7280 (RGB: 107, 114, 128)
  Dark:         #374151 (RGB: 55, 65, 81)
  Text:         #1F2937 (RGB: 31, 41, 55)
```

### Pipeline Pipeline Colors (for differentiation)

```
Duplicate Detection:  #8B5CF6 (Purple)    - Interactive, creative
Git Activity:         #06B6D4 (Cyan)      - Clear, analytical
Plugin Management:    #EC4899 (Pink)      - Energetic, active
Claude Health:        #14B8A6 (Teal)      - Calm, monitoring
```

---

## 12. Typography Scale

```
Display:     2.5rem (40px) | font-weight: 700 | line-height: 1.2
Heading 1:   2rem    (32px) | font-weight: 700 | line-height: 1.3
Heading 2:   1.5rem  (24px) | font-weight: 600 | line-height: 1.3
Heading 3:   1.25rem (20px) | font-weight: 600 | line-height: 1.4
Body Large:  1rem    (16px) | font-weight: 400 | line-height: 1.5
Body:        0.875rem (14px) | font-weight: 400 | line-height: 1.5
Small:       0.75rem  (12px) | font-weight: 400 | line-height: 1.4
Tiny:        0.625rem (10px) | font-weight: 500 | line-height: 1.4

Font Family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif
Monospace:   'Monaco', 'Menlo', 'Ubuntu Mono', monospace
```

---

## 13. Spacing Scale (8px base unit)

```
0    = 0px
0.5  = 4px     (tight)
1    = 8px     (standard)
1.5  = 12px    (small gap)
2    = 16px    (medium gap)
3    = 24px    (large gap)
4    = 32px    (extra large)
6    = 48px    (section gap)
8    = 64px    (major section gap)
```

---

## 14. Border Radius

```
None:       0px
Small:      4px    (compact elements like status badges)
Medium:     8px    (cards, buttons)
Large:      12px   (modals, large sections)
Full:       9999px (circular avatars, toggle switches)
```

---

## 15. Shadow System

```
Subtle:    0 1px 2px rgba(0, 0, 0, 0.05)
Light:     0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)
Medium:    0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)
Strong:    0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)
Elevation: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)
```

---

## 16. Animation Durations

```
Instant:     0ms
Fast:        100ms   (hover states, icon changes)
Normal:      200ms   (expanding sections, fade-ins)
Slow:        500ms   (batch updates, progress changes)
Slower:      750ms   (page transitions, major reveals)
Glacial:     1000ms  (introductory animations)
```

---

## 17. Icon Reference (using Unicode)

```
Status & State:
  ● Filled circle       (system status - healthy/degraded/error)
  ◯ Open circle         (system offline)
  ◆ Diamond             (pipeline identifier)
  ✓ Check               (success, completed)
  ✗ Cross               (failed, error)
  ▶ Play/Arrow          (started, queued, info)
  ▼ Chevron down        (expand)
  ▲ Chevron up          (collapse)
  ↷ Curved arrow        (queued, waiting)
  ◐ Partial circle      (progress, running)
  ─ Dash/Line           (idle, offline)
  ⊘ Circled slash       (cancelled, disabled)
  ⚠ Warning             (warning, degraded)
  ℹ Information         (info, help)
  ⚙ Gear                (settings, configuration)

Progress:
  ░ Light block         (incomplete)
  ▒ Medium block        (partial)
  █ Dark block          (complete)
  ▁ Lower block         (failed - in history)
  ▂ Lower mid           (partial - in history)
  ▃ Low                 (success - in history)
```

---

## 18. Interaction States

### Button States

```
Default:      bg-white border-gray-300 text-gray-900
Hover:        bg-gray-50 border-gray-400
Active:       bg-gray-100 border-gray-500
Disabled:     opacity-50 cursor-not-allowed

Primary (action):
Default:      bg-blue-500 text-white
Hover:        bg-blue-600
Active:       bg-blue-700
Focus:        outline 2px solid blue-400 offset 2px
```

### Link States

```
Default:      text-blue-600 underline
Hover:        text-blue-700 underline
Active:       text-blue-800
Focus:        outline 2px solid blue-400 offset 2px
```

### Form Input States

```
Default:      border-gray-300 bg-white text-gray-900
Focus:        border-blue-500 ring-1 ring-blue-400
Disabled:     bg-gray-50 text-gray-500 border-gray-200
Error:        border-red-500 ring-1 ring-red-400
Success:      border-green-500 ring-1 ring-green-400
```

---

## 19. Accessibility Focus State

```
All interactive elements must show:
  outline: 2px solid #3B82F6 (blue)
  outline-offset: 2px

Contrast ratios:
  Normal text:     4.5:1 minimum (WCAG AA)
  Large text:      3:1 minimum (WCAG AA)
  UI components:   3:1 minimum (WCAG AA)
```

---

## 20. Responsive Breakpoints

```
Mobile:   320px - 640px
Tablet:   641px - 1024px
Desktop:  1025px - 1440px
Wide:     1441px +

Media queries:
  Mobile only:      @media (max-width: 640px)
  Tablet+:          @media (min-width: 641px)
  Tablet only:      @media (min-width: 641px) and (max-width: 1024px)
  Desktop+:         @media (min-width: 1025px)
  Wide:             @media (min-width: 1441px)
```

---

## 21. Print Styles

```
Hide on print:
  • Navigation/header
  • Filters/search
  • Action buttons (except "Print")
  • Real-time indicators

Show on print:
  • Main content (pipeline status, activity)
  • Charts and data
  • Timestamps and metadata

Default:
  • Black text on white background
  • Page breaks between major sections
  • Preserve monospace font for logs/code
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-17
