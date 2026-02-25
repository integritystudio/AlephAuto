# AlephAuto Dashboard - Design System & Component Reference

**Version**: 1.0 | **Updated**: 2026-02-25

Consolidated design specification: layout, components, design tokens, mockups, and patterns.

---

## Design Philosophy

**Signal over noise.** Every element serves a functional purpose. Real-time visibility without cognitive overhead.

Clean typography, generous whitespace, monochromatic foundation with semantic color accents. Developer-focused: quick status checks, actionable alerts, historical context.

| Principle | Implementation |
|-----------|----------------|
| Signal over noise | Only actionable items; hide non-essential details until needed |
| Hierarchy | Large pipeline cards > smaller job items > compact activity feed |
| Scanability | Monochromatic text + semantic color accents; icons for quick recognition |
| Progressive disclosure | Expandable sections; details on demand via modals |
| Real-time without flicker | Batch updates every 500ms; subtle animations |
| Accessibility first | WCAG AA; keyboard navigation; semantic HTML |
| Mobile-ready | Responsive breakpoints; 44px minimum touch targets |

---

## Layout

### Desktop (1200px+) - 3-Column

```
+---------------------------------------------------------------------------+
|                         HEADER (sticky)                                    |
|  Logo / Title         Status Indicators       Last Update / Settings       |
+---------------------------------------------------------------------------+
|                         MAIN CONTENT (3-column)                            |
|                                                                            |
|  +------------------+  +------------------+  +------------------+         |
|  |                  |  |                  |  |                  |         |
|  |  PIPELINE STATUS |  |  JOB QUEUE       |  |  RECENT          |         |
|  |  (left)          |  |  & ACTIVE JOBS   |  |  ACTIVITY        |         |
|  |                  |  |  (center)        |  |  (right)         |         |
|  |  * Duplicate Det |  |                  |  |                  |         |
|  |  * Git Activity  |  |  Active: 3/5     |  |  10 recent items |         |
|  |  * Plugin Mgmt   |  |  Queued: 2       |  |  w/ timestamps   |         |
|  |  * Claude Health |  |                  |  |                  |         |
|  |                  |  |  [ Real-time ]   |  |  Filterable      |         |
|  +------------------+  +------------------+  +------------------+         |
|                                                                            |
+---------------------------------------------------------------------------+
|                    DOCUMENTATION SECTION                                    |
|  [ Getting Started ] [ Components ] [ Configuration ] [ Logs ] [ Errors ]  |
|  [Content area - scrollable]                                               |
+---------------------------------------------------------------------------+
```

### Tablet (768-1199px) - 2-Column

```
+---------------------------------------+
|           HEADER (sticky)              |
+------------------+--------------------+
|  PIPELINE STATUS |  JOB QUEUE &       |
|  (35%)           |  ACTIVITY (65%)    |
|                  |  (combined)        |
+------------------+--------------------+
|   DOCUMENTATION (full width)           |
+---------------------------------------+
```

### Mobile (<768px) - Single Column

```
+-----------------------------+
|       HEADER (sticky)        |
+-----------------------------+
|  PIPELINE STATUS             |
|  (collapsible sections)      |
+-----------------------------+
|  JOB QUEUE & ACTIVITY        |
|  (combined, scrollable)      |
+-----------------------------+
|  DOCUMENTATION               |
|  (tabs become accordion)     |
+-----------------------------+
```

---

## Components

### Header (Sticky)

```
+--------------------------------------------------------------+
| (gear) AlephAuto Dashboard    * Healthy | 3 running | 2 queued  (gear) |
+--------------------------------------------------------------+
```

- **System Status**: Green (Healthy) / Yellow (Degraded) / Red (Error)
- **Tooltip**: "3 pipelines running, 12 queued, Connection: stable"
- **Last Update**: "Updated 2s ago" - real-time refresh
- **Degraded banner**: Shows when WebSocket disconnected, with polling fallback info

### Pipeline Status Card

```
+----------------------------------------+
| v (diamond) Duplicate Detection        |
+----------------------------------------+
| Status: RUNNING                        |
| Progress: 342 / 510 repos (67%)       |
| ========-------- 67%                  |
| Current Job: scan-repo:ai-framework   |
| Elapsed: 3h 42m | Remaining: 1h 52m   |
| Success rate: ########-- 95% (9/10)   |
|                                        |
| [View full history] [Cancel]          |
+----------------------------------------+
```

**Status badges**:
- RUNNING: Blue bg, animated progress bar
- IDLE: Gray bg, checkmark
- QUEUED: Yellow bg, position indicator
- FAILED: Red bg, warning icon + [View error] [Manual retry]

### Job Queue & Active Jobs

```
+----------------------------------------------+
| Capacity: 3/5 (60%)                          |
| ===---  60%                                  |
|                                              |
| --- ACTIVE JOBS ---                          |
|                                              |
| 1. scan-repo:ai-framework (3:42)            |
|    Duplicate Detection Pipeline              |
|    ========- 84% | 342 / 407 blocks          |
|    CPU: 24% | Memory: 145 MB                 |
|    [Cancel] [Log]                            |
|                                              |
| --- QUEUED (2) ---                           |
| -> claude-health-check (queued 2m)           |
| -> scan-repo:jobs (queued 1m)                |
+----------------------------------------------+
```

### Recent Activity

```
+----------------------------------------------+
| Filter: [All v]  [x] Auto-scroll             |
|                                              |
| (check) 14:32  Duplicate Detection complete  |
|         2,481 duplicates found               |
|         [View report]                        |
|                                              |
| (x) 14:15  Git activity FAILED              |
|     Repository unreachable                   |
|     [Retry] [View log]                       |
+----------------------------------------------+
```

**Status icons**: check=Success (green), x=Failed (red), arrow=Info (gray), circle=Progress (blue)

### Documentation Section

Tabs: Getting Started | Components | Configuration | Logs | Errors
- Collapsible, state saved in localStorage
- Mobile: tabs become accordion
- Code blocks are copyable

---

## Color System

### Foundation

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#FFFFFF` | Page background |
| Text Primary | `#1A1A1A` | Main text, headings |
| Text Secondary | `#666666` | Descriptions, metadata |
| Border | `#CCCCCC` | Card borders, dividers |
| Divider | `#EEEEEE` | Very light separator |

### Semantic Status Colors

| Status | Light | Main | Dark | Text |
|--------|-------|------|------|------|
| Success (Green) | `#ECFDF5` | `#10B981` | `#047857` | `#064E3B` |
| Warning (Amber) | `#FFFBEB` | `#F59E0B` | `#D97706` | `#78350F` |
| Error (Red) | `#FEF2F2` | `#EF4444` | `#DC2626` | `#7F1D1D` |
| Info (Blue) | `#EFF6FF` | `#3B82F6` | `#1D4ED8` | `#1E3A8A` |
| Neutral (Gray) | `#F3F4F6` | `#6B7280` | `#374151` | `#1F2937` |

### Pipeline Colors

| Pipeline | Hex | Vibe |
|----------|-----|------|
| Duplicate Detection | `#8B5CF6` (Purple) | Interactive |
| Git Activity | `#06B6D4` (Cyan) | Analytical |
| Plugin Management | `#EC4899` (Pink) | Energetic |
| Claude Health | `#14B8A6` (Teal) | Monitoring |

---

## Typography

```
Heading 2:   1.5rem  (24px) | weight: 600 | line-height: 1.3
Heading 3:   1.25rem (20px) | weight: 600 | line-height: 1.4
Body Large:  1rem    (16px) | weight: 400 | line-height: 1.5
Body:        0.875rem (14px) | weight: 400 | line-height: 1.5
Small:       0.75rem  (12px) | weight: 400 | line-height: 1.4

Font:      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
Monospace: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace
```

## Spacing (8px base)

```
0.5 = 4px   (tight)
1   = 8px   (standard)
2   = 16px  (medium gap)
3   = 24px  (large gap)
4   = 32px  (extra large)
6   = 48px  (section gap)
```

## Borders & Shadows

```
Border Radius:  4px (badges) | 8px (cards, buttons) | 12px (modals) | 9999px (circular)

Shadows:
  Subtle:    0 1px 2px rgba(0,0,0,0.05)
  Light:     0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)
  Medium:    0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)
  Strong:    0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)
```

## Animation

```
Fast:    100ms  (hover states, icon changes)
Normal:  200ms  (expanding sections, fade-ins)
Slow:    500ms  (batch updates, progress changes)
```

Respect `prefers-reduced-motion`. No JavaScript-based animations.

---

## Status Icons

| Icon | Meaning | Color | Context |
|------|---------|-------|---------|
| check | Success | Green | Completed, health good |
| x | Failed | Red | Error state |
| arrow | Running/Started | Blue | Active, pipeline running |
| curved-arrow | Queued | Amber | Waiting for slot |
| filled-circle | Healthy | Green | System status |
| filled-circle | Degraded | Amber | System warning |
| filled-circle | Error | Red | System critical |
| half-circle | Progress | Blue | Job in progress |
| dash | Idle | Gray | Sleeping, offline |
| diamond | Pipeline | Gray | Pipeline identifier |
| warning | Warning | Amber | Needs attention |

---

## Component TypeScript Interfaces

```typescript
interface Pipeline {
  id: string;
  name: string;
  status: 'running' | 'idle' | 'queued' | 'failed';
  progress?: number;        // 0-100
  currentJob?: string;
  nextRun?: Date;
  lastError?: string;
  successRate?: number;
}

interface Job {
  id: string;
  pipelineId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;        // 0-100
  error?: string;
}

interface ActivityItem {
  id: string;
  type: 'started' | 'completed' | 'failed' | 'queued' | 'progress';
  pipelineId: string;
  pipelineName: string;
  message: string;
  timestamp: Date;
}
```

---

## Tailwind Patterns

### Status Card

```javascript
// Success
className="bg-green-50 border border-green-200 text-green-700"
// Error
className="bg-red-50 border border-red-200 text-red-700"
// Warning
className="bg-yellow-50 border border-yellow-200 text-yellow-700"
// Info
className="bg-blue-50 border border-blue-200 text-blue-700"
```

### Status Badge

```typescript
const statusColors = {
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  queued: 'bg-yellow-100 text-yellow-700',
};

<span className={`px-2 py-1 text-xs font-semibold rounded ${statusColors[status]}`}>
  {status.charAt(0).toUpperCase() + status.slice(1)}
</span>
```

### Progress Bar

```typescript
<div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
  <div
    className="h-full bg-blue-500 transition-all duration-300"
    style={{ width: `${progress}%` }}
  />
</div>
```

### Card Container

```javascript
className="bg-white border border-gray-200 rounded-lg p-4 shadow-light"
```

### Buttons

```javascript
// Primary
className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
// Secondary
className="px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
// Danger
className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
```

---

## Interaction Patterns

### WebSocket Updates

- **Batch**: Collect changes for 500ms, render in batch (prevents flicker)
- **Highlight**: New job -> yellow highlight 3s; completed -> green pulse 2s
- **Badges**: "3 new completions in last 5 min" on activity panel

### Error States

**WebSocket disconnected**:
```
Warning: WebSocket disconnected (retrying 3/10)
Real-time updates paused. Using polling fallback (5s).
```

**API error**:
```
Error: Failed to load job queue (503 Service Unavailable)
[Retry] [View offline cache]
```

### Job Failure (with Remediation)

```
x Git Activity Report FAILED
  Error: Repository unreachable (HTTP 403)
  Root cause: Authentication token expired
  Suggested fixes:
    1. Refresh auth token in configuration
    2. Check network connectivity
    3. Verify repository access permissions
  [Retry now] [Ignore] [View documentation]
```

---

## Accessibility (WCAG AA)

### Contrast Ratios
- Success/Error/Info indicators: 6.8:1+
- Body text: 10.5:1
- All text meets 4.5:1 minimum

### Keyboard Navigation
- **Tab order**: Header -> Pipeline -> Queue -> Activity -> Docs
- **Enter/Space**: Expand/collapse, trigger actions
- **Arrow keys**: Navigate within lists
- **Esc**: Close modals
- **Focus**: 2px solid `#3B82F6` outline, 2px offset

### Screen Reader
- Semantic HTML5: `<main>`, `<section>`, `<nav>`, `<article>`
- `aria-label` on status indicators and icon-only buttons
- `aria-live="polite"` for dynamic updates
- Meaningful heading hierarchy

---

## User Flows

### Quick Status Check (30s)

1. Open dashboard -> glance at header: "Healthy"
2. Scan pipeline column -> all green except "Claude Health" (Failed)
3. Check queue -> 3/5 active, 2 queued
4. Click [Manual retry] on failed pipeline
5. Done

### Investigating a Failed Job (5m)

1. See x in recent activity
2. Click row to expand details
3. Read error message
4. Click [View log] -> filter by component
5. Find root cause
6. Click [Retry] -> watch queue position update

---

## File Structure

```
frontend/src/
  components/
    Layout.tsx, Header.tsx, PipelineStatus.tsx, JobQueue.tsx,
    RecentActivity.tsx, Documentation.tsx, PipelineCard.tsx,
    JobItem.tsx, ActivityItem.tsx
    shared/ StatusBadge.tsx, ProgressBar.tsx, Modal.tsx, Button.tsx
  hooks/
    useWebSocketConnection.ts, useDashboardData.ts
  services/
    api.ts, websocket.ts
  store/
    dashboard.ts (Zustand)
  types/
    index.ts
  utils/
    formatters.ts, colors.ts
  App.tsx
```

---

## Responsive Breakpoints

```
Mobile:   320px - 640px     @media (max-width: 640px)
Tablet:   641px - 1024px    @media (min-width: 641px) and (max-width: 1024px)
Desktop:  1025px - 1440px   @media (min-width: 1025px)
Wide:     1441px+           @media (min-width: 1441px)
```

---

## Related

- [Dashboard Operations](./DASHBOARD.md) - Quick start, config, troubleshooting, deployment
- [System Data Flow](./DATAFLOW_DIAGRAMS.md) - Architecture diagrams
