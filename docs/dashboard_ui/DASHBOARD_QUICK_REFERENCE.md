# AlephAuto Dashboard - Quick Reference Guide

**For Developers:** Keep this handy while building the dashboard. Pin it to your workspace.

---

## Layout at a Glance

```
Desktop (1200px+)           Tablet (768-1199px)      Mobile (< 768px)
┌─────────────────────┐     ┌──────────────┐         ┌─────────┐
│  HEADER (sticky)    │     │  HEADER      │         │ HEADER  │
├─┬─────┬───┬─────┬──┤     ├──┬──────┬───┤         ├─────────┤
│P│QUEUE│ACT│ DOC │EO│     │PI│QUEUE │ACT│         │PIPELINE │
│I│ &   │  │TABS │TS│     │PE│COMBINED│ │         │ STATUS  │
│P│JOBS │  │     │ │     │IM│      │  │         ├─────────┤
│S│     │  │     │  │     └──┴──────┴──┘         │ JOB     │
│T│     │  │     │  │     ┌──────────────┐       │ QUEUE   │
│A│     │  │     │  │     │ DOCS TABS    │       ├─────────┤
│T│     │  │     │  │     └──────────────┘       │ACTIVITY │
│U│     │  │     │  │                            ├─────────┤
│S│     │  │     │  │                            │  DOCS   │
├─┼─────┼───┼─────┼──┤                            │ (stacked)│
│  DOCUMENTATION TABS          │                            └─────────┘
└─────────────────────┘
```

---

## Component Decision Tree

**Building a new component?**

```
Is it a full page layout?
├─ Yes → Build a Layout component (Grid, sections)
└─ No → Is it reusable?
    ├─ Yes (StatusBadge, ProgressBar) → Build a small component
    └─ No (PipelineCard, JobItem) → Build a medium component
```

---

## Color Quick Pick

| Purpose | Hex | Usage |
|---------|-----|-------|
| Success | #10B981 | ✓ badges, progress (complete) |
| Error | #EF4444 | ✗ badges, warnings, failed |
| Running | #3B82F6 | ▶ active jobs, status badge |
| Queued | #F59E0B | ↷ waiting, queue indicator |
| Idle | #6B7280 | ─ offline, idle status |
| Primary Text | #1A1A1A | Main text, headings |
| Secondary Text | #666666 | Descriptions, metadata |
| Border | #CCCCCC | Card borders, dividers |
| Background | #FFFFFF | Page background |

---

## Typography Quick Pick

| Usage | Size | Weight | Line Height |
|-------|------|--------|-------------|
| Page Title | 1.5rem (24px) | 600 | 1.3 |
| Section Title | 1.125rem (18px) | 600 | 1.4 |
| Body Text | 0.875rem (14px) | 400 | 1.5 |
| Small Text | 0.75rem (12px) | 400 | 1.4 |
| Monospace (logs) | 0.75rem (12px) | 400 | 1.5 |

---

## Spacing Scale

```
px-1  = 8px      (tight)
px-2  = 16px     (standard)
px-3  = 24px     (medium)
px-4  = 32px     (large)
px-6  = 48px     (extra large)

gap-2 = 16px between items
gap-4 = 32px between sections
```

---

## Status Icon Cheat Sheet

| Icon | Meaning | Color | Usage |
|------|---------|-------|-------|
| ✓ | Success | Green | Job completed, health good |
| ✗ | Failed | Red | Job failed, error state |
| ▶ | Running/Started | Blue | Job active, pipeline running |
| ↷ | Queued | Amber | Waiting for slot |
| ● | Healthy | Green | System status |
| ● | Degraded | Amber | System warning |
| ● | Error | Red | System critical |
| ◐ | Progress | Blue | Job in progress |
| ─ | Idle | Gray | Sleeping, offline |
| ◆ | Pipeline | Gray | Pipeline identifier |
| ⚠ | Warning | Amber | Alert, needs attention |

---

## Component Props (TypeScript)

```typescript
// Pipeline
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

// Job
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

// Activity
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

## CSS Classes (Tailwind Snippets)

### Status Card Styles

```javascript
// Success state
className="bg-green-50 border border-green-200 text-green-700"

// Error state
className="bg-red-50 border border-red-200 text-red-700"

// Warning state
className="bg-yellow-50 border border-yellow-200 text-yellow-700"

// Info state
className="bg-blue-50 border border-blue-200 text-blue-700"
```

### Progress Bar

```javascript
className="w-full h-2 bg-gray-200 rounded-full overflow-hidden"
// Child: className="h-full bg-blue-500 transition-all"
```

### Button Styles

```javascript
// Primary action
className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"

// Secondary action
className="px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"

// Danger action
className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
```

### Card Container

```javascript
className="bg-white border border-gray-200 rounded-lg p-4 shadow-light"
```

---

## Zustand Store Quick Reference

```typescript
// Get single value
const pipelines = useDashboardStore((state) => state.pipelines);

// Get multiple values (memoized)
const { activeJobs, queuedJobs } = useDashboardStore((state) => ({
  activeJobs: state.activeJobs,
  queuedJobs: state.queuedJobs,
}));

// Call action
useDashboardStore.getState().updatePipeline(id, updates);

// Subscribe to changes
const unsubscribe = useDashboardStore.subscribe(
  (state) => state.activeJobs,
  (jobs) => console.log('Jobs updated:', jobs)
);
```

---

## WebSocket Events Quick Reference

```javascript
// Emitted from server to client
socket.on('job:created', (job) => {});
socket.on('job:started', (job) => {});
socket.on('job:completed', (job) => {});
socket.on('job:failed', (job) => {});
socket.on('job:progress', (data) => {});
socket.on('pipeline:status', (pipeline) => {});

// Sent from client to server
socket.emit('job:retry', { jobId });
socket.emit('job:cancel', { jobId });
socket.emit('job:logs:request', { jobId });
```

---

## Common UI Patterns

### Expanding/Collapsing Section

```typescript
const [expanded, setExpanded] = useState(false);

<button
  onClick={() => setExpanded(!expanded)}
  className="w-full flex justify-between items-center"
>
  <span>{title}</span>
  {expanded ? <ChevronUp /> : <ChevronDown />}
</button>

{expanded && (
  <div className="mt-4 pt-4 border-t border-gray-200">
    {/* Details */}
  </div>
)}
```

### Status Badge

```typescript
const statusColors = {
  'running': 'bg-blue-100 text-blue-700',
  'completed': 'bg-green-100 text-green-700',
  'failed': 'bg-red-100 text-red-700',
  'queued': 'bg-yellow-100 text-yellow-700',
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
<span className="text-xs text-gray-600 mt-1">{progress}%</span>
```

### Relative Time

```typescript
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(date).toLocaleDateString();
}
```

---

## API Endpoints Quick Reference

```
GET  /health                        System health
GET  /api/status                    System status (active, queued, etc)
GET  /api/pipelines                 List all pipelines
GET  /api/sidequest/pipeline-runners/:id             Get pipeline details
GET  /api/jobs?status=running       Get active jobs
GET  /api/jobs?status=queued        Get queued jobs
GET  /api/jobs/:id                  Get job details
GET  /api/jobs/:id/logs             Get job logs
POST /api/jobs/:id/cancel           Cancel a job
POST /api/jobs/:id/retry            Retry a job
POST /api/scan                      Trigger new scan
GET  /api/scan/:scanId              Get scan results
```

---

## Common Pitfalls & Solutions

### Problem: Progress bar not animating
**Solution:** Use `transition-all duration-300` on the inner div

### Problem: WebSocket not reconnecting
**Solution:** Check `socket.io-client` config has `reconnection: true`

### Problem: Store not updating UI
**Solution:** Always use `useDashboardStore((state) => ...)` with getState, not direct access

### Problem: Performance laggy with 100+ activity items
**Solution:** Use virtual scrolling (`react-window`) or limit to last 50 items

### Problem: Mobile layout breaking
**Solution:** Test at 375px and 667px widths; use responsive grid (`grid-cols-1 lg:grid-cols-3`)

### Problem: Text getting cut off
**Solution:** Use `truncate` class or `line-clamp-2` for multi-line truncation

---

## Debugging Checklist

- [ ] Is WebSocket connected? Check header status indicator
- [ ] Are props being passed correctly? Check React DevTools
- [ ] Is store updating? Add console.log in store action
- [ ] Is Tailwind applying? Check element in browser DevTools
- [ ] Is API responding? Check Network tab in DevTools
- [ ] Is timestamp formatting correct? Check `new Date()` parsing

---

## Performance Checklist

- [ ] Components memoized with `memo()` where appropriate
- [ ] Update batching set to 500ms
- [ ] Activity feed limited to 100 items
- [ ] Charts don't re-render on every update
- [ ] Large lists use virtual scrolling
- [ ] Images optimized (if any)

---

## Accessibility Checklist

- [ ] All buttons have `aria-label` if icon-only
- [ ] Status updates use `aria-live="polite"`
- [ ] Color + icon for status (not color alone)
- [ ] Focus outlines visible (2px solid #3B82F6)
- [ ] Keyboard navigation works (Tab, Enter, Esc, Arrow keys)
- [ ] Contrast ratio ≥ 4.5:1 for normal text

---

## Responsive Testing Checklist

- [ ] Desktop: 1440px (test 3-column layout)
- [ ] Tablet: 768px (test 2-column layout)
- [ ] Mobile: 375px (test stacked layout)
- [ ] Mobile landscape: 667px width
- [ ] Test touch interactions (no hover-only elements)

---

## File Structure Reference

```
src/
├── components/
│   ├── Layout.tsx              ← Main grid
│   ├── Header.tsx              ← Top nav
│   ├── PipelineStatus.tsx      ← Left column
│   ├── JobQueue.tsx            ← Center column
│   ├── RecentActivity.tsx      ← Right column
│   ├── Documentation.tsx       ← Bottom tabs
│   ├── PipelineCard.tsx        ← Expandable pipeline card
│   ├── JobItem.tsx             ← Job in queue
│   ├── ActivityItem.tsx        ← Activity feed item
│   └── shared/
│       ├── StatusBadge.tsx
│       ├── ProgressBar.tsx
│       ├── Modal.tsx
│       └── Button.tsx
├── hooks/
│   ├── useWebSocketConnection.ts
│   └── useDashboardData.ts
├── services/
│   ├── api.ts
│   └── websocket.ts
├── store/
│   └── dashboard.ts            ← Zustand store
├── types/
│   └── index.ts
├── utils/
│   ├── formatters.ts
│   └── colors.ts
└── App.tsx
```

---

## Quick Copy-Paste Templates

### New Component Template

```typescript
import React from 'react';
import { useDashboardStore } from '../store/dashboard';

interface ComponentProps {
  // Props here
}

export const ComponentName: React.FC<ComponentProps> = (props) => {
  // State and hooks

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Title</h2>
      {/* Content */}
    </section>
  );
};
```

### New Hook Template

```typescript
import { useEffect, useState } from 'react';
import { useDashboardStore } from '../store/dashboard';

export const useCustomHook = () => {
  const [data, setData] = useState(null);
  const store = useDashboardStore();

  useEffect(() => {
    // Hook logic
  }, []);

  return data;
};
```

---

## Resources

- **Design Docs:** Read in order: Summary → UI Design → Implementation Guide → Mockups
- **Color Picker:** Use hex values from Visual Mockups section 11
- **Icons:** Copy Unicode from section 17 of Visual Mockups
- **Responsive Testing:** Chrome DevTools Device Mode or BrowserStack

---

**Last Updated:** 2025-11-23
**Bookmark this page!**
