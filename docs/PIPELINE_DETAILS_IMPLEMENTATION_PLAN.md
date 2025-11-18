# Pipeline Details Panel - Implementation Plan

**Version**: 1.1 (Updated with Type Safety & Error Tracking)
**Created**: 2025-11-18
**Updated**: 2025-11-18
**Status**: Planning Phase

## Overview

Enhance the AlephAuto dashboard to make pipeline cards clickable, revealing detailed job information in a slide-out panel. This implementation combines UX best practices with vanilla JavaScript (no framework) to maintain the current lightweight architecture.

## Design Decision: Slide-Out Panel (Recommended)

### Rationale
- **Maintains Context**: Users keep pipeline grid visible while exploring details
- **Mobile-Friendly**: Works seamlessly from mobile (100% width) to desktop (side panel)
- **No Layout Shift**: Panel occupies fixed sidebar space, preventing CLS
- **Real-time Monitoring**: Users can see WebSocket updates across all pipelines
- **Natural Feedback**: Horizontal slide clearly communicates expansion

### Alternative Patterns Rejected
- ❌ **Modal**: Blocks entire grid, breaks monitoring experience
- ❌ **Accordion Expand**: Creates massive vertical growth, forces scrolling
- ❌ **Separate Page**: Loses context of other pipelines

---

## Visual Design Specifications

### Panel Dimensions
```
Desktop (>1200px):  400px width, 100vh height
Tablet (768-1199px): 350px width, 100vh height
Mobile (<768px):     100% width, 100vh height (full overlay)
```

### Interaction States

**Default Card State:**
```css
.pipeline-card {
    cursor: pointer;
    border: 1px solid var(--color-gray-200);
    transition: all var(--transition-base); /* 250ms */
}
```

**Hover State:**
```css
.pipeline-card:hover {
    border-color: var(--color-info);
    box-shadow: 0 0 0 3px var(--color-info-bg); /* Blue glow */
}
```

**Focus State (Accessibility):**
```css
.pipeline-card:focus-visible {
    outline: 2px solid var(--color-info);
    outline-offset: 2px;
}
```

**Active State (Panel Open):**
```css
.pipeline-card.active {
    border-color: var(--color-info);
    background-color: var(--color-info-bg);
}
```

### Animation Specifications

**Panel Slide Animation:**
```css
.details-panel {
    transform: translateX(100%); /* Hidden */
    transition: transform 250ms ease; /* Matches --transition-base */
}

.details-panel.open {
    transform: translateX(0); /* Visible */
}

/* Respect user motion preferences */
@media (prefers-reduced-motion: reduce) {
    .details-panel {
        transition: none;
    }
}
```

**Job Item Entrance (Staggered Fade-in):**
```css
.job-item {
    opacity: 0;
    animation: fadeIn 200ms ease forwards;
}

.job-item:nth-child(1) { animation-delay: 0ms; }
.job-item:nth-child(2) { animation-delay: 50ms; }
.job-item:nth-child(n+3) { animation-delay: 100ms; }

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}
```

---

## Information Architecture

### Panel Structure (Top to Bottom)

```
┌─────────────────────────────────────┐
│ [X] Close Button          Priority 1│
├─────────────────────────────────────┤
│ Pipeline Name + Status Badge        │
│ Duplicate Detection [IDLE]          │
├─────────────────────────────────────┤
│ Key Metrics                         │
│ Last Run: 3 hours ago               │
│ Next Run: in 2 hours                │
│ Active Jobs: 2                      │
├─────────────────────────────────────┤
│ Tabs: [Recent] [Failed] [All]       │
├─────────────────────────────────────┤
│ Job History List                    │
│ ┌─────────────────────────────────┐ │
│ │ Job #1234                       │ │
│ │ Status: Running                 │ │
│ │ Started: 5 min ago              │ │
│ │ Duration: --                    │ │
│ │ [Expand for details ▼]          │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Job #1233                       │ │
│ │ Status: Success                 │ │
│ │ Started: 1 hour ago             │ │
│ │ Duration: 2m 34s                │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Actions                             │
│ [Manual Trigger] [View All Logs]    │
└─────────────────────────────────────┘
```

### Job Card Expanded State

```
┌─────────────────────────────────────┐
│ Job #1233                           │
│ Status: Success ✓                   │
│ Started: 2025-11-18 14:23:15        │
│ Duration: 2m 34s                    │
│ ─────────────────────────────────── │
│ Parameters:                         │
│ • repositoryPath: /path/to/repo     │
│ • dryRun: false                     │
│ ─────────────────────────────────── │
│ Output:                             │
│ • Scanned 42 files                  │
│ • Found 3 duplicates                │
│ • Generated report.html             │
│ ─────────────────────────────────── │
│ [View Full Logs]                    │
└─────────────────────────────────────┘
```

---

## Type Safety & Error Tracking

### TypeScript + Zod Validation

Following the project's established patterns (see `api/types/scan-requests.ts`, `api/middleware/validation.js`), all new API endpoints must use:

1. **Zod schemas** for runtime validation
2. **TypeScript types** inferred from Zod schemas (`z.infer<>`)
3. **Validation middleware** for automatic request/response validation
4. **Type-safe route handlers** with proper TypeScript generics

**Benefits:**
- Runtime validation catches bad data before processing
- TypeScript provides compile-time type safety
- Single source of truth for types and validation
- Clear error messages for API consumers

### Sentry Error Tracking

All errors must be captured in Sentry following the project's patterns (see `api/activity-feed.js`, `api/middleware/error-handler.js`):

1. **Always log first**, then capture to Sentry
2. **Include tags**: `component`, `endpoint`, `operation`
3. **Include extra context**: `pipelineId`, `jobId`, request parameters
4. **Use severity levels**: error for failures, warning for validation issues

**Pattern:**
```javascript
try {
  // Operation
} catch (error) {
  logger.error({ error, context }, 'Operation failed');
  Sentry.captureException(error, {
    tags: { component: 'PipelineAPI', endpoint: '/api/pipelines/:id/jobs' },
    extra: { pipelineId, queryParams }
  });
  // Handle error response
}
```

---

## Implementation Steps

### Phase 0: Type Definitions & Schemas (Priority: Critical)

**Create: `api/types/pipeline-requests.ts`**

```typescript
/**
 * Type Definitions for Pipeline API Requests/Responses
 *
 * Provides TypeScript types and Zod validation schemas for pipeline endpoints.
 */

import { z } from 'zod';

/**
 * Job Status Enum
 */
export const JobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/**
 * Job Query Parameters Schema
 */
export const JobQueryParamsSchema = z.object({
  status: JobStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  tab: z.enum(['recent', 'failed', 'all']).optional()
}).strict();

export type JobQueryParams = z.infer<typeof JobQueryParamsSchema>;

/**
 * Job Details Schema
 */
export const JobDetailsSchema = z.object({
  id: z.string(),
  pipelineId: z.string(),
  status: JobStatusSchema,
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  duration: z.number().int().nonnegative().optional(), // milliseconds
  parameters: z.record(z.unknown()).optional(),
  result: z.object({
    output: z.string().optional(),
    error: z.string().optional(),
    stats: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
  }).optional()
});

export type JobDetails = z.infer<typeof JobDetailsSchema>;

/**
 * Jobs List Response Schema
 */
export const JobsListResponseSchema = z.object({
  pipelineId: z.string(),
  jobs: z.array(JobDetailsSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  timestamp: z.string().datetime()
});

export type JobsListResponse = z.infer<typeof JobsListResponseSchema>;

/**
 * Pipeline Details Schema (for panel header)
 */
export const PipelineDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['idle', 'running', 'error', 'completed']),
  lastRun: z.string().datetime().nullable(),
  nextRun: z.string().datetime().nullable(),
  activeJobs: z.number().int().nonnegative(),
  completedJobs: z.number().int().nonnegative(),
  failedJobs: z.number().int().nonnegative()
});

export type PipelineDetails = z.infer<typeof PipelineDetailsSchema>;

/**
 * Manual Trigger Request Schema
 */
export const ManualTriggerRequestSchema = z.object({
  parameters: z.record(z.unknown()).optional()
}).strict();

export type ManualTriggerRequest = z.infer<typeof ManualTriggerRequestSchema>;

/**
 * Manual Trigger Response Schema
 */
export const ManualTriggerResponseSchema = z.object({
  jobId: z.string(),
  pipelineId: z.string(),
  status: JobStatusSchema,
  timestamp: z.string().datetime()
});

export type ManualTriggerResponse = z.infer<typeof ManualTriggerResponseSchema>;

/**
 * Error Response Schema
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  timestamp: z.string().datetime(),
  status: z.number().optional()
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Validation Error Response Schema
 */
export const ValidationErrorResponseSchema = ErrorResponseSchema.extend({
  errors: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string()
  })).optional()
});

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;
```

**Verification:**
- [ ] All schemas use `.strict()` to prevent extra fields
- [ ] All timestamps use `.datetime()` for ISO 8601 validation
- [ ] All numbers use `.int()` and `.nonnegative()` where appropriate
- [ ] Enums are used for fixed value sets (status, tab)
- [ ] Types are inferred using `z.infer<>` (single source of truth)

---

### Phase 1: Backend API (Priority: High)

**Create: `api/routes/pipelines.ts`**

```typescript
/**
 * Pipeline Routes (TypeScript with Zod validation)
 *
 * API endpoints for fetching pipeline details and job history.
 */

import express, { Request, Response, NextFunction } from 'express';
import { validateQuery, validateRequest } from '../middleware/validation.js';
import {
  JobQueryParamsSchema,
  ManualTriggerRequestSchema,
  type JobQueryParams,
  type JobsListResponse,
  type ManualTriggerRequest,
  type ManualTriggerResponse
} from '../types/pipeline-requests.js';
import { createComponentLogger } from '../../sidequest/logger.js';
import * as Sentry from '@sentry/node';

const router = express.Router();
const logger = createComponentLogger('PipelineRoutes');

/**
 * GET /api/pipelines/:pipelineId/jobs
 * Fetch job history for a specific pipeline
 */
router.get(
  '/:pipelineId/jobs',
  validateQuery(JobQueryParamsSchema), // Automatic query validation
  async (
    req: Request<{ pipelineId: string }, {}, {}, JobQueryParams>,
    res: Response<JobsListResponse>,
    next: NextFunction
  ) => {
    const { pipelineId } = req.params;
    const { status, limit, offset, tab } = req.query;

    try {
      logger.info({
        pipelineId,
        status,
        limit,
        offset,
        tab
      }, 'Fetching pipeline jobs');

      // TODO: Implement actual job fetching logic
      // For now, return mock data structure
      const jobs = await fetchJobsForPipeline(pipelineId, {
        status,
        limit,
        offset,
        tab
      });

      const response: JobsListResponse = {
        pipelineId,
        jobs,
        total: jobs.length,
        hasMore: jobs.length === limit,
        timestamp: new Date().toISOString()
      };

      res.json(response);
    } catch (error) {
      logger.error({
        error,
        pipelineId,
        queryParams: { status, limit, offset, tab }
      }, 'Failed to fetch pipeline jobs');

      Sentry.captureException(error, {
        tags: {
          component: 'PipelineAPI',
          endpoint: '/api/pipelines/:id/jobs',
          pipelineId
        },
        extra: {
          queryParams: { status, limit, offset, tab }
        }
      });

      next(error);
    }
  }
);

/**
 * POST /api/pipelines/:pipelineId/trigger
 * Manually trigger a pipeline job
 */
router.post(
  '/:pipelineId/trigger',
  validateRequest(ManualTriggerRequestSchema), // Automatic body validation
  async (
    req: Request<{ pipelineId: string }, {}, ManualTriggerRequest>,
    res: Response<ManualTriggerResponse>,
    next: NextFunction
  ) => {
    const { pipelineId } = req.params;
    const { parameters = {} } = req.body;

    try {
      logger.info({
        pipelineId,
        parameters
      }, 'Manually triggering pipeline job');

      // TODO: Implement actual job trigger logic
      const jobId = await triggerPipelineJob(pipelineId, parameters);

      const response: ManualTriggerResponse = {
        jobId,
        pipelineId,
        status: 'queued',
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error({
        error,
        pipelineId,
        parameters
      }, 'Failed to trigger pipeline job');

      Sentry.captureException(error, {
        tags: {
          component: 'PipelineAPI',
          endpoint: '/api/pipelines/:id/trigger',
          pipelineId
        },
        extra: {
          parameters
        }
      });

      next(error);
    }
  }
);

/**
 * Helper: Fetch jobs for a pipeline
 * TODO: Implement with actual data source
 */
async function fetchJobsForPipeline(
  pipelineId: string,
  options: JobQueryParams
): Promise<JobDetails[]> {
  // Placeholder implementation
  return [];
}

/**
 * Helper: Trigger a manual job
 * TODO: Implement with actual worker
 */
async function triggerPipelineJob(
  pipelineId: string,
  parameters: Record<string, unknown>
): Promise<string> {
  // Placeholder implementation
  return `job-${Date.now()}`;
}

export default router;
```

**Register Route in `api/server.js`:**
```javascript
import pipelineRoutes from './routes/pipelines.js';

// ... existing routes ...
app.use('/api/pipelines', pipelineRoutes);
```

**Key Features:**
- ✅ **Zod validation** for query parameters (status, limit, offset, tab)
- ✅ **TypeScript generics** for type-safe request/response
- ✅ **Sentry integration** captures all errors with context
- ✅ **Component logger** logs all operations
- ✅ **Automatic error handling** via Express error middleware

**Query Parameters:**
- `status` (optional): Filter by job status (queued, running, completed, failed)
- `limit` (optional): Max jobs to return (default: 10, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `tab` (optional): UI tab context (recent, failed, all)

**Response:** `JobsListResponse` (validated by Zod)

**Example Request:**
```bash
GET /api/pipelines/duplicate-detection/jobs?status=failed&limit=5
```

**Example Response:**
```json
{
  "pipelineId": "duplicate-detection",
  "jobs": [
    {
      "id": "job-123",
      "pipelineId": "duplicate-detection",
      "status": "failed",
      "startTime": "2025-11-18T14:30:00.000Z",
      "endTime": "2025-11-18T14:32:15.000Z",
      "duration": 135000,
      "parameters": {
        "repositoryPath": "/path/to/repo"
      },
      "result": {
        "error": "File not found: /path/to/repo/.git",
        "stats": {
          "filesScanned": 0
        }
      }
    }
  ],
  "total": 1,
  "hasMore": false,
  "timestamp": "2025-11-18T15:00:00.000Z"
}
```

### Phase 2: HTML Structure (Priority: High)

**Add to public/index.html (before closing `</body>`):**

```html
<!-- Pipeline Details Panel -->
<aside id="detailsPanel" class="details-panel" aria-hidden="true">
    <div class="details-panel-header">
        <button
            id="closePanelBtn"
            class="close-button"
            aria-label="Close pipeline details"
            type="button">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
        </button>
    </div>

    <div class="details-panel-content">
        <!-- Pipeline Header -->
        <div class="details-header">
            <h2 id="detailsPipelineName" class="details-title">Loading...</h2>
            <span id="detailsStatusBadge" class="status-badge"></span>
        </div>

        <!-- Key Metrics -->
        <div class="details-metrics">
            <div class="metric-item">
                <span class="metric-label">Last Run</span>
                <span id="detailsLastRun" class="metric-value">--</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Next Run</span>
                <span id="detailsNextRun" class="metric-value">--</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Active Jobs</span>
                <span id="detailsActiveJobs" class="metric-value">0</span>
            </div>
        </div>

        <!-- Tabs -->
        <div class="details-tabs" role="tablist">
            <button role="tab" aria-selected="true" class="tab-button active" data-tab="recent">Recent</button>
            <button role="tab" aria-selected="false" class="tab-button" data-tab="failed">Failed</button>
            <button role="tab" aria-selected="false" class="tab-button" data-tab="all">All</button>
        </div>

        <!-- Job History -->
        <div
            id="jobHistoryContainer"
            class="job-history"
            role="region"
            aria-live="polite"
            aria-label="Job history">
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Loading jobs...</p>
            </div>
        </div>

        <!-- Actions -->
        <div class="details-actions">
            <button id="manualTriggerBtn" class="action-button primary">
                Manual Trigger
            </button>
            <button id="viewAllLogsBtn" class="action-button secondary">
                View All Logs
            </button>
        </div>
    </div>
</aside>

<!-- Backdrop (optional, for mobile) -->
<div id="panelBackdrop" class="panel-backdrop" aria-hidden="true"></div>
```

### Phase 3: CSS Styles (Priority: High)

**Add to public/dashboard.css:**

```css
/* ===== DETAILS PANEL ===== */

.details-panel {
    position: fixed;
    right: 0;
    top: 0;
    width: 400px;
    height: 100vh;
    background: var(--color-white);
    border-left: 1px solid var(--color-gray-200);
    box-shadow: var(--shadow-lg);
    transform: translateX(100%);
    transition: transform var(--transition-base);
    z-index: 200;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.details-panel.open {
    transform: translateX(0);
}

.details-panel[aria-hidden="true"] {
    visibility: hidden;
}

.details-panel[aria-hidden="false"] {
    visibility: visible;
}

/* Panel Header */
.details-panel-header {
    position: sticky;
    top: 0;
    background: var(--color-white);
    border-bottom: 1px solid var(--color-gray-200);
    padding: var(--space-2);
    z-index: 10;
    display: flex;
    justify-content: flex-end;
}

.close-button {
    width: 40px;
    height: 40px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color var(--transition-fast);
}

.close-button:hover {
    background-color: var(--color-gray-100);
}

.close-button:focus-visible {
    outline: 2px solid var(--color-info);
    outline-offset: 2px;
}

/* Panel Content */
.details-panel-content {
    padding: var(--space-3);
    flex: 1;
}

/* Details Header */
.details-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
}

.details-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-gray-900);
    margin: 0;
}

/* Metrics */
.details-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    padding: var(--space-2);
    background-color: var(--color-gray-50);
    border-radius: var(--radius-md);
}

.metric-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.metric-label {
    font-size: 12px;
    color: var(--color-gray-600);
    font-weight: 500;
    text-transform: uppercase;
}

.metric-value {
    font-size: 14px;
    color: var(--color-gray-900);
    font-weight: 600;
}

/* Tabs */
.details-tabs {
    display: flex;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-gray-200);
}

.tab-button {
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-gray-600);
    border-bottom: 2px solid transparent;
    transition: all var(--transition-fast);
}

.tab-button:hover {
    color: var(--color-gray-900);
}

.tab-button.active {
    color: var(--color-info);
    border-bottom-color: var(--color-info);
}

.tab-button:focus-visible {
    outline: 2px solid var(--color-info);
    outline-offset: 2px;
}

/* Job History */
.job-history {
    min-height: 200px;
    margin-bottom: var(--space-3);
}

.job-item {
    background: var(--color-white);
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    margin-bottom: var(--space-2);
    cursor: pointer;
    transition: all var(--transition-fast);
    opacity: 0;
    animation: fadeIn 200ms ease forwards;
}

.job-item:nth-child(1) { animation-delay: 0ms; }
.job-item:nth-child(2) { animation-delay: 50ms; }
.job-item:nth-child(n+3) { animation-delay: 100ms; }

.job-item:hover {
    border-color: var(--color-info);
    box-shadow: var(--shadow-sm);
}

.job-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-1);
}

.job-id {
    font-weight: 600;
    font-size: 14px;
    color: var(--color-gray-900);
}

.job-status-badge {
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
}

.job-status-badge.running {
    background-color: var(--color-info-bg);
    color: var(--color-info-dark);
}

.job-status-badge.completed {
    background-color: var(--color-success-bg);
    color: var(--color-success-dark);
}

.job-status-badge.failed {
    background-color: var(--color-error-bg);
    color: var(--color-error-dark);
}

.job-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    color: var(--color-gray-600);
}

/* Job Details (Expanded) */
.job-details {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 150ms ease, opacity 150ms ease;
}

.job-item.expanded .job-details {
    max-height: 500px;
    opacity: 1;
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-gray-200);
}

.job-details-section {
    margin-bottom: var(--space-2);
}

.job-details-section h4 {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-gray-900);
    margin-bottom: var(--space-1);
}

.job-details-section ul {
    list-style: none;
    padding: 0;
}

.job-details-section li {
    font-size: 13px;
    color: var(--color-gray-600);
    padding: 4px 0;
}

/* Actions */
.details-actions {
    display: flex;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-gray-200);
}

.action-button {
    flex: 1;
    padding: var(--space-2);
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
}

.action-button.primary {
    background-color: var(--color-info);
    color: white;
}

.action-button.primary:hover {
    background-color: var(--color-info-dark);
}

.action-button.secondary {
    background-color: var(--color-gray-100);
    color: var(--color-gray-900);
}

.action-button.secondary:hover {
    background-color: var(--color-gray-200);
}

.action-button:focus-visible {
    outline: 2px solid var(--color-info);
    outline-offset: 2px;
}

.action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Backdrop */
.panel-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.3);
    opacity: 0;
    visibility: hidden;
    transition: opacity var(--transition-base);
    z-index: 199;
}

.panel-backdrop.visible {
    opacity: 1;
    visibility: visible;
}

/* Animations */
@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Clickable Card Indication */
.pipeline-card {
    cursor: pointer;
    transition: all var(--transition-base);
}

.pipeline-card:hover {
    border-color: var(--color-info);
    box-shadow: 0 0 0 3px var(--color-info-bg);
}

.pipeline-card:focus-visible {
    outline: 2px solid var(--color-info);
    outline-offset: 2px;
}

.pipeline-card.active {
    border-color: var(--color-info);
    background-color: var(--color-info-bg);
}

.card-footer {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-gray-200);
}

.click-hint {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 12px;
    color: var(--color-gray-600);
    font-weight: 500;
}

.arrow-icon {
    transform: rotate(90deg);
    transition: transform var(--transition-fast);
}

.pipeline-card:hover .arrow-icon {
    transform: rotate(90deg) translateX(2px);
}

/* Responsive Design */
@media (max-width: 1199px) {
    .details-panel {
        width: 350px;
    }
}

@media (max-width: 767px) {
    .details-panel {
        width: 100%;
    }

    .details-metrics {
        grid-template-columns: 1fr;
    }

    .details-actions {
        flex-direction: column;
    }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
    .details-panel,
    .job-item,
    .tab-button,
    .action-button,
    .close-button {
        transition: none;
        animation: none;
    }
}
```

### Phase 4: JavaScript Implementation (Priority: High)

**Add to public/dashboard.js:**

```javascript
class DashboardController {
    constructor() {
        // ... existing code ...
        this.detailsPanel = null;
        this.currentPipelineId = null;
        this.currentTab = 'recent';
    }

    init() {
        // ... existing init code ...

        // Initialize details panel
        this.initializeDetailsPanel();
    }

    /**
     * Initialize details panel interactions
     */
    initializeDetailsPanel() {
        this.detailsPanel = document.getElementById('detailsPanel');
        const closeBtn = document.getElementById('closePanelBtn');
        const backdrop = document.getElementById('panelBackdrop');

        // Close button click
        closeBtn?.addEventListener('click', () => this.closeDetailsPanel());

        // Backdrop click (mobile)
        backdrop?.addEventListener('click', () => this.closeDetailsPanel());

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isPanelOpen()) {
                this.closeDetailsPanel();
            }
        });

        // Tab switching
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Manual trigger button
        document.getElementById('manualTriggerBtn')?.addEventListener('click', () => {
            this.triggerManualJob();
        });
    }

    /**
     * Make pipeline cards clickable
     */
    renderPipelines(pipelines) {
        const container = document.getElementById('pipelineCards');
        if (!container) return;

        container.innerHTML = pipelines.map(pipeline => `
            <div
                class="pipeline-card"
                role="button"
                tabindex="0"
                data-pipeline-id="${pipeline.id}"
                aria-expanded="false"
                aria-controls="detailsPanel"
                aria-label="View details for ${pipeline.name} pipeline. Status: ${pipeline.status}"
            >
                <div class="pipeline-header">
                    <h3 class="pipeline-name">${pipeline.name}</h3>
                    <span class="status-badge status-${pipeline.status}" role="img" aria-label="Status: ${pipeline.status}">
                        ${pipeline.status}
                    </span>
                </div>
                <div class="pipeline-stats">
                    <div class="stat">
                        <span class="stat-label">Last Run</span>
                        <span class="stat-value">${this.formatRelativeTime(pipeline.lastRun)}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Next Run</span>
                        <span class="stat-value">${this.formatRelativeTime(pipeline.nextRun)}</span>
                    </div>
                </div>
                <div class="pipeline-jobs">
                    <span class="job-count">
                        ✓ ${pipeline.completedJobs || 0} completed
                    </span>
                    ${pipeline.failedJobs > 0 ? `
                        <span class="job-count error">
                            ✗ ${pipeline.failedJobs} failed
                        </span>
                    ` : ''}
                </div>
                <div class="card-footer">
                    <span class="click-hint">
                        Click to view details
                        <svg class="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 4l4 4-4 4"/>
                        </svg>
                    </span>
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.pipeline-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const pipelineId = e.currentTarget.dataset.pipelineId;
                this.openDetailsPanel(pipelineId);
            });

            // Keyboard support (Enter/Space)
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const pipelineId = e.currentTarget.dataset.pipelineId;
                    this.openDetailsPanel(pipelineId);
                }
            });
        });
    }

    /**
     * Open details panel for a pipeline
     */
    async openDetailsPanel(pipelineId) {
        this.currentPipelineId = pipelineId;

        // Update card active state
        document.querySelectorAll('.pipeline-card').forEach(card => {
            card.classList.toggle('active', card.dataset.pipelineId === pipelineId);
            card.setAttribute('aria-expanded', card.dataset.pipelineId === pipelineId ? 'true' : 'false');
        });

        // Open panel
        this.detailsPanel.classList.add('open');
        this.detailsPanel.setAttribute('aria-hidden', 'false');

        // Show backdrop on mobile
        const backdrop = document.getElementById('panelBackdrop');
        backdrop?.classList.add('visible');

        // Focus close button
        setTimeout(() => {
            document.getElementById('closePanelBtn')?.focus();
        }, 250); // After animation

        // Load panel content
        await this.loadPanelContent(pipelineId);
    }

    /**
     * Close details panel
     */
    closeDetailsPanel() {
        if (!this.isPanelOpen()) return;

        // Store reference to active card for focus return
        const activeCard = document.querySelector('.pipeline-card.active');

        // Close panel
        this.detailsPanel.classList.remove('open');
        this.detailsPanel.setAttribute('aria-hidden', 'true');

        // Hide backdrop
        const backdrop = document.getElementById('panelBackdrop');
        backdrop?.classList.remove('visible');

        // Remove active state from cards
        document.querySelectorAll('.pipeline-card').forEach(card => {
            card.classList.remove('active');
            card.setAttribute('aria-expanded', 'false');
        });

        // Return focus to card that opened panel
        setTimeout(() => {
            activeCard?.focus();
        }, 250); // After animation

        this.currentPipelineId = null;
    }

    /**
     * Check if panel is open
     */
    isPanelOpen() {
        return this.detailsPanel?.classList.contains('open');
    }

    /**
     * Load panel content from API
     */
    async loadPanelContent(pipelineId) {
        const container = document.getElementById('jobHistoryContainer');
        if (!container) return;

        // Show loading state
        container.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Loading jobs...</p>
            </div>
        `;

        try {
            // Fetch pipeline details
            const response = await fetch(`${this.apiBaseUrl}/api/pipelines/${pipelineId}/jobs?limit=10`);
            if (!response.ok) throw new Error('Failed to fetch jobs');

            const data = await response.json();

            // Update panel header
            this.updatePanelHeader(data);

            // Render job history
            this.renderJobHistory(data.jobs);

        } catch (error) {
            console.error('Failed to load panel content:', error);
            container.innerHTML = `
                <div class="error-state">
                    <p>Failed to load job history</p>
                    <button class="action-button secondary" onclick="location.reload()">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    /**
     * Update panel header with pipeline info
     */
    updatePanelHeader(data) {
        // Implementation depends on data structure
        document.getElementById('detailsPipelineName').textContent = data.pipelineName || 'Pipeline';
        // ... update other header fields
    }

    /**
     * Render job history list
     */
    renderJobHistory(jobs) {
        const container = document.getElementById('jobHistoryContainer');
        if (!container) return;

        if (!jobs || jobs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No jobs found for this pipeline.</p>
                    <button id="manualTriggerEmptyBtn" class="action-button primary">
                        Manual Trigger
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = jobs.map((job, index) => `
            <div class="job-item" data-job-id="${job.id}" style="animation-delay: ${index * 50}ms">
                <div class="job-item-header">
                    <span class="job-id">Job #${job.id}</span>
                    <span class="job-status-badge ${job.status}">${this.formatJobStatus(job.status)}</span>
                </div>
                <div class="job-meta">
                    <span>Started: ${this.formatRelativeTime(job.startTime)}</span>
                    ${job.duration ? `<span>Duration: ${this.formatDuration(job.duration)}</span>` : ''}
                </div>
                ${job.result ? `
                    <div class="job-details">
                        ${this.renderJobDetails(job)}
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Add click handlers for expanding job details
        container.querySelectorAll('.job-item').forEach(item => {
            item.addEventListener('click', () => {
                item.classList.toggle('expanded');
            });
        });
    }

    /**
     * Render detailed job information
     */
    renderJobDetails(job) {
        let html = '';

        if (job.parameters) {
            html += `
                <div class="job-details-section">
                    <h4>Parameters</h4>
                    <ul>
                        ${Object.entries(job.parameters).map(([key, value]) => `
                            <li>• ${key}: ${JSON.stringify(value)}</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        if (job.result?.stats) {
            html += `
                <div class="job-details-section">
                    <h4>Results</h4>
                    <ul>
                        ${Object.entries(job.result.stats).map(([key, value]) => `
                            <li>• ${key}: ${value}</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        if (job.result?.error) {
            html += `
                <div class="job-details-section">
                    <h4>Error</h4>
                    <pre class="error-message">${job.result.error}</pre>
                </div>
            `;
        }

        return html;
    }

    /**
     * Switch between tabs (Recent/Failed/All)
     */
    switchTab(tabName) {
        this.currentTab = tabName;

        // Update tab UI
        document.querySelectorAll('.tab-button').forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Reload jobs with filter
        this.loadPanelContent(this.currentPipelineId);
    }

    /**
     * Trigger manual job for current pipeline
     */
    async triggerManualJob() {
        if (!this.currentPipelineId) return;

        const btn = document.getElementById('manualTriggerBtn');
        btn.disabled = true;
        btn.textContent = 'Triggering...';

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/pipelines/${this.currentPipelineId}/trigger`, {
                method: 'POST',
            });

            if (!response.ok) throw new Error('Failed to trigger job');

            // WebSocket will handle the update
            btn.textContent = 'Triggered!';
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = 'Manual Trigger';
            }, 2000);

        } catch (error) {
            console.error('Failed to trigger job:', error);
            btn.textContent = 'Failed';
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = 'Manual Trigger';
            }, 2000);
        }
    }

    /**
     * Format job status for display
     */
    formatJobStatus(status) {
        const icons = {
            running: '⏳',
            completed: '✓',
            failed: '✗',
            queued: '⋯'
        };
        return `${icons[status] || ''} ${status.charAt(0).toUpperCase() + status.slice(1)}`;
    }

    /**
     * Format duration in milliseconds to human-readable
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Handle WebSocket events for job updates
     */
    handleWebSocketMessage(event) {
        // ... existing code ...

        // Update details panel if open and relevant
        if (this.isPanelOpen() && event.pipelineId === this.currentPipelineId) {
            switch (event.type) {
                case 'job:created':
                case 'job:started':
                case 'job:completed':
                case 'job:failed':
                    // Add new job to history without refetching
                    this.addJobToHistory(event.job);
                    break;
            }
        }
    }

    /**
     * Add new job to history list (real-time update)
     */
    addJobToHistory(job) {
        const container = document.getElementById('jobHistoryContainer');
        if (!container) return;

        // Create job item HTML
        const jobHtml = `
            <div class="job-item" data-job-id="${job.id}" style="animation-delay: 0ms">
                <div class="job-item-header">
                    <span class="job-id">Job #${job.id}</span>
                    <span class="job-status-badge ${job.status}">${this.formatJobStatus(job.status)}</span>
                </div>
                <div class="job-meta">
                    <span>Started: ${this.formatRelativeTime(job.startTime)}</span>
                </div>
            </div>
        `;

        // Insert at top
        container.insertAdjacentHTML('afterbegin', jobHtml);

        // Add click handler
        const newItem = container.querySelector('[data-job-id="' + job.id + '"]');
        newItem?.addEventListener('click', () => {
            newItem.classList.toggle('expanded');
        });
    }
}
```

---

## Accessibility Checklist

### WCAG AA Compliance
- [ ] **Contrast Ratios**: Maintain 6.8:1+ for all text (already achieved)
- [ ] **Keyboard Navigation**:
  - [ ] Tab to navigate between cards
  - [ ] Enter/Space to open details
  - [ ] Escape to close panel
  - [ ] Arrow keys for tab switching (optional)
- [ ] **Screen Reader Support**:
  - [ ] `aria-expanded` on pipeline cards
  - [ ] `aria-controls` linking card to panel
  - [ ] `aria-label` describing card state
  - [ ] `aria-live="polite"` on job history
  - [ ] `role="region"` on main sections
- [ ] **Focus Management**:
  - [ ] Focus moves to close button on panel open
  - [ ] Focus returns to card on panel close
  - [ ] 2px visible focus outlines
  - [ ] Focus trap within panel (optional)
- [ ] **Motion Sensitivity**:
  - [ ] Disable animations with `prefers-reduced-motion`
- [ ] **Color Independence**:
  - [ ] Status indicators use icon + text + color
  - [ ] Not relying solely on color for information

---

## Testing Plan

### Functional Testing
1. **Panel Open/Close**:
   - Click card → panel slides in
   - Click close button → panel slides out
   - Press Escape → panel closes
   - Click outside (mobile) → panel closes

2. **Job History Loading**:
   - Loading spinner shows while fetching
   - Error state displays on fetch failure
   - Empty state shows when no jobs
   - Jobs render with correct status badges

3. **Tab Switching**:
   - Recent tab shows last 10 jobs
   - Failed tab shows only failed jobs
   - All tab shows paginated history

4. **Real-time Updates**:
   - New job appears via WebSocket
   - Job status updates live
   - Panel stays open during updates

5. **Manual Trigger**:
   - Button triggers job via API
   - Loading state displays
   - Success/error feedback shown

### Responsive Testing
- Desktop (1920x1080): 400px panel, grid visible
- Laptop (1366x768): 400px panel, grid visible
- Tablet (768x1024): 350px panel, 2 columns
- Mobile (375x667): 100% panel, 1 column, backdrop visible

### Accessibility Testing
- Keyboard-only navigation
- Screen reader testing (NVDA/JAWS/VoiceOver)
- Tab order verification
- Focus outline visibility
- ARIA attribute validation

### Performance Testing
- Panel open latency: <250ms
- Job fetch time: <500ms
- WebSocket update lag: <100ms
- Memory leak check: No leaks after 100 open/close cycles

### Type Validation Testing
1. **Valid Requests**:
   - All schemas accept valid data
   - Types inferred correctly in IDE
   - No TypeScript compilation errors

2. **Invalid Requests**:
   ```bash
   # Test invalid limit (should return 400 with validation error)
   curl -X GET "http://localhost:8080/api/pipelines/test/jobs?limit=999"

   # Expected response:
   {
     "error": "Bad Request",
     "message": "Request validation failed",
     "timestamp": "2025-11-18T15:00:00.000Z",
     "errors": [{
       "field": "limit",
       "message": "Number must be less than or equal to 100",
       "code": "too_big"
     }]
   }
   ```

3. **Zod Schema Verification**:
   - Run `npm run typecheck` to verify TypeScript types
   - Test all enum values (status: 'invalid' should fail)
   - Test edge cases (limit: 0, offset: -1, etc.)

### Error Tracking Testing
1. **Sentry Integration**:
   - Trigger errors in each endpoint
   - Verify errors appear in Sentry dashboard
   - Check tags include: `component`, `endpoint`, `pipelineId`
   - Check extra context includes query params/body

2. **Error Classification**:
   - 400: Validation errors (Zod failures)
   - 404: Pipeline not found
   - 500: Server errors (database failures, etc.)

3. **Logging Verification**:
   - All errors logged before Sentry capture
   - Log includes: `error`, `pipelineId`, `queryParams`
   - Log level: `error` for failures, `warn` for validation

**Testing Commands:**
```bash
# Valid request
curl -X GET "http://localhost:8080/api/pipelines/duplicate-detection/jobs?limit=5"

# Invalid limit (too high)
curl -X GET "http://localhost:8080/api/pipelines/test/jobs?limit=150"

# Invalid status enum
curl -X GET "http://localhost:8080/api/pipelines/test/jobs?status=invalid"

# Invalid offset (negative)
curl -X GET "http://localhost:8080/api/pipelines/test/jobs?offset=-5"

# Manual trigger with invalid body
curl -X POST "http://localhost:8080/api/pipelines/test/trigger" \
  -H "Content-Type: application/json" \
  -d '{"invalidField": true}'
```

---

## Deployment Strategy

### Phase 0: Type Definitions (Day 1)
- [ ] Create `api/types/pipeline-requests.ts` with all Zod schemas
- [ ] Verify schemas with `npm run typecheck`
- [ ] Export types for use in routes

### Phase 1: Backend (Week 1)
- [ ] Create `api/routes/pipelines.ts` with type-safe endpoints
- [ ] Implement `/api/pipelines/:id/jobs` endpoint with validation
- [ ] Implement `/api/pipelines/:id/trigger` endpoint with validation
- [ ] Register routes in `api/server.js`
- [ ] Add Sentry error tracking to all endpoints
- [ ] Add job data to WebSocket events
- [ ] Test with Postman/curl (validate error responses)

### Phase 2: Frontend Structure (Week 1)
- [ ] Add HTML panel structure
- [ ] Add CSS styles
- [ ] Test responsive breakpoints

### Phase 3: JavaScript Logic (Week 2)
- [ ] Implement open/close interactions
- [ ] Add keyboard support
- [ ] Integrate API calls
- [ ] Add WebSocket listeners

### Phase 4: Polish & Accessibility (Week 2)
- [ ] Add ARIA attributes
- [ ] Test with screen readers
- [ ] Implement focus management
- [ ] Add animations (with reduced-motion support)

### Phase 5: Testing & Launch (Week 3)
- [ ] Comprehensive testing
- [ ] Fix bugs
- [ ] Deploy to production

---

## Future Enhancements (Post-MVP)

1. **Job Filtering**: Search/filter job history
2. **Pagination**: Load more jobs beyond initial 10
3. **Export Logs**: Download job logs as text/JSON
4. **Job Comparison**: Compare parameters/results between jobs
5. **Scheduled Jobs**: View/edit cron schedules
6. **Pipeline Configuration**: Edit pipeline settings in-panel
7. **Job Retry**: Retry failed jobs with same parameters
8. **Performance Graphs**: Visualize job duration trends

---

## Maintenance Notes

### Regular Tasks
- Monitor panel open/close performance
- Check for WebSocket memory leaks
- Validate ARIA attributes remain correct
- Test with new browser versions

### Known Limitations
- Panel only shows last 50 jobs (pagination required for more)
- No job search (add if requested)
- Manual trigger doesn't validate parameters (basic trigger only)

### Type Safety & Error Tracking Maintenance
- **Update Zod schemas** when adding new fields or endpoints
- **Run `npm run typecheck`** after schema changes
- **Monitor Sentry** for unexpected error patterns
- **Review validation errors** in logs to identify API misuse
- **Keep types in sync**: Zod schemas are source of truth

---

## Summary

This implementation plan provides a complete, production-ready approach to adding interactive pipeline details to the AlephAuto dashboard:

**Core Features:**
- ✅ **Slide-out panel** (400px desktop, 100% mobile)
- ✅ **Type-safe API** with Zod validation + TypeScript
- ✅ **Sentry error tracking** on all endpoints
- ✅ **WCAG AA accessible** (6.8:1 contrast, keyboard nav, ARIA)
- ✅ **Real-time updates** via WebSocket
- ✅ **Responsive design** (mobile, tablet, desktop)
- ✅ **250ms animations** with reduced-motion support

**Technology Stack:**
- **Backend**: TypeScript + Express + Zod + Sentry
- **Frontend**: Vanilla JavaScript (no framework)
- **Validation**: Runtime (Zod) + Compile-time (TypeScript)
- **Error Tracking**: Sentry v8 with component tags
- **Real-time**: WebSocket with automatic reconnection

**Files to Create:**
1. `api/types/pipeline-requests.ts` - Type definitions & Zod schemas
2. `api/routes/pipelines.ts` - Type-safe route handlers
3. `public/index.html` - Details panel HTML structure
4. `public/dashboard.css` - Panel styles & animations
5. `public/dashboard.js` - Panel interactions & WebSocket updates

**Timeline:**
- **Phase 0** (Day 1): Type definitions & schemas
- **Phase 1** (Week 1): Backend API with validation & error tracking
- **Phase 2** (Week 1): Frontend structure (HTML/CSS)
- **Phase 3** (Week 2): JavaScript interactions & WebSocket
- **Phase 4** (Week 2): Accessibility polish
- **Phase 5** (Week 3): Testing & deployment

---

**Status**: ✅ Ready for Implementation
**Next Step**: Begin Phase 0 - Create Type Definitions (`api/types/pipeline-requests.ts`)
