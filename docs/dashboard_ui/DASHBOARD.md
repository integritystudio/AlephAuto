# AlephAuto Dashboard

**Version**: 1.5.0 | **Status**: Production Ready | **Updated**: 2026-03-14

Real-time monitoring and management dashboard for the AlephAuto job queue framework.

## Architecture

```
Browser (React + TypeScript + Vite)
  Pipeline status cards, Job queue, Activity feed, Pipeline detail panel, Job logs modal
      |  WebSocket + REST API
      v
Express Server (api/server.ts)
  WebSocket (ws) - Event broadcasting, auto-reconnect
  REST API - /health, /api/status, /api/jobs, /api/pipelines, /api/scans
      |  Event Emitters
      v
AlephAuto Framework (sidequest/)
  SidequestServer - Job queue, concurrency, retry, circuit breaker
  Workers - Repomix, SchemaEnhancement, GitActivity, Gitignore, PluginManager, etc.
```

### Data Flow

1. Worker `this.emit()` -> SidequestServer relays -> Express broadcasts -> WebSocket -> Dashboard UI
2. Initial load: `/api/status` returns `activeJobs`/`queuedJobs` so the dashboard renders immediately
3. Auto-transitions from mock to real data when WebSocket connects and receives first event

### Event Types

**Job Lifecycle**: `job:created`, `job:started`, `job:completed`, `job:failed`
**System**: `pipeline:status`, `queue:update`

---

## Quick Start

```bash
# Development
npm run dashboard                        # Dashboard UI -> http://localhost:8080

# Production
doppler run -c prd -- pm2 start config/ecosystem.config.cjs
```

---

## Features

| Feature | Details |
|---------|---------|
| WebSocket | Auto-reconnect with exponential backoff |
| Real-time updates | 500ms batched event updates |
| Responsive layout | Mobile / tablet / desktop breakpoints |
| Pipeline status cards | All pipelines with View Details drawer |
| Job queue | Active/queued jobs with capacity gauge |
| Activity feed | Chronological, filterable event log |
| Job logs modal | Synthesized lifecycle logs |
| WCAG AA | Contrast ratios 6.8:1+ |
| Lighthouse | Perf 97, A11y 100, BP 100; ~42 KB first load |

---

## Configuration

### Environment Variables (via Doppler)

```bash
JOBS_API_PORT=8080
NODE_ENV=production
SENTRY_DSN=https://...
```

### CSS Customization

Edit CSS variables in `public/dashboard.css`:

```css
:root {
  --color-success: #10b981;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  --color-warning: #f59e0b;
  --color-inactive: #6b7280;
}
```

---

## API Endpoints

```
GET  /health                        System health
GET  /api/status                    System status (active, queued, etc)
GET  /api/pipelines                 List all pipelines
GET  /api/pipelines/:id             Get pipeline details
GET  /api/jobs?status=running       Get active jobs
GET  /api/jobs?status=queued        Get queued jobs
GET  /api/jobs/:id                  Get job details
GET  /api/jobs/:id/logs             Get job logs
POST /api/jobs/:id/cancel           Cancel a job
POST /api/jobs/:id/retry            Retry a job
POST /api/scan                      Trigger new scan
GET  /api/scan/:scanId              Get scan results
```

## WebSocket Events

```javascript
// Server -> Client
socket.on('job:created', (job) => {});
socket.on('job:started', (job) => {});
socket.on('job:completed', (job) => {});
socket.on('job:failed', (job) => {});
socket.on('job:progress', (data) => {});
socket.on('pipeline:status', (pipeline) => {});

// Client -> Server
socket.emit('job:retry', { jobId });
socket.emit('job:cancel', { jobId });
socket.emit('job:logs:request', { jobId });
```

---

## Troubleshooting

```bash
curl http://localhost:8080/health       # Server health
curl http://localhost:8080/ws/status    # WebSocket status
curl http://localhost:8080/api/status   # System status
pm2 logs aleph-dashboard --lines 100   # PM2 logs
```

**Checklist**: WebSocket connected (header indicator)? API responding (Network tab)? Props correct (React DevTools)? Sentry captures unhandled errors with request URL, user agent, WS client count.

---

## Deployment

### PM2 (Recommended)

```bash
doppler run -- pm2 start config/ecosystem.config.cjs
pm2 save && pm2 startup
```

### systemd (Linux)

```ini
[Unit]
Description=AlephAuto Dashboard
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/jobs
ExecStart=/usr/bin/doppler run -- node --strip-types api/server.ts
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## Browser Support

Chrome/Edge 90+, Firefox 88+, Safari 14+, iOS Safari/Chrome Mobile 14+/90+

---

## Changelog

### 2026-03-12–2026-03-14 — WebSocket type safety
- Replace `any` types and `as any` casts with `PipelineStatus` enum, discriminated unions, runtime type guards
- Fix WebSocket union types to match server payload shapes
- Fix capacity bar, activity feed, Vite proxy port derivation

### 2026-03-08–2026-03-09 — View Details/Logs, structured logging
- Implement View Details drawer, View Logs modal, seed activity feed
- Replace `console.log/error` with structured logger
- Replace magic numbers/strings with named constants
- Resolve 11 TypeScript errors, extract activity-feed and status helpers

### 2026-02-26 — Complexity reduction
- Extract helpers from `useWebSocketConnection` (complexity compliance)
- Fix 3 correctness bugs, `activity-feed.ts` listenToWorker 330->15 lines

### 2026-02-09–2026-02-15 — React dashboard launch
- React + Vite frontend with WebSocket auto-reconnect
- Populate job queue from DB on initial load
- Fix favicon 401, platform deps, `VITE_WS_HOST` type

### 2025-11-24–2025-12-24 — Initial dashboard
- Job/pipeline controls, loading/error states, error message component
- Fix 4 critical production errors

---

## Related Documentation

- [Dashboard Design System](./DASHBOARD_DESIGN.md) - UI/UX spec, design tokens, mockups
- [System Data Flow](./DATAFLOW_DIAGRAMS.md) - Architecture diagrams
- [Error Handling](../architecture/ERROR_HANDLING.md) - Retry logic, circuit breaker
- [Deployment Guide](../deployment/TRADITIONAL_SERVER_DEPLOYMENT.md) - PM2 setup
