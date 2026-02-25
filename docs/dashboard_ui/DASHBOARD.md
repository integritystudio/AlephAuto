# AlephAuto Dashboard

**Version**: 1.3.0 | **Status**: Production Ready | **Updated**: 2026-02-25

Real-time monitoring and management dashboard for the AlephAuto job queue framework.

## Architecture

```
Browser (Client)
  Dashboard UI (React + TypeScript + Vite)
    Pipeline status cards, Job queue, Activity feed, Docs tabs
        |
        | WebSocket + REST API
        v
Express Server (api/server.js)
  WebSocket Server (ws) - Event broadcasting, auto-reconnect
  REST API - /health, /api/status, /api/jobs, /api/pipelines, /api/scans
  Static File Serving - public/
        |
        | Event Emitters
        v
AlephAuto Framework (sidequest/)
  SidequestServer - Job queue, concurrency, retry, circuit breaker
  Workers - Repomix, SchemaEnhancement, GitActivity, Gitignore, PluginManager, etc.
```

### Data Flow

1. Worker emits event -> `server.emit('job:created', data)`
2. Server broadcasts to WebSocket -> All connected clients receive event
3. Dashboard updates UI -> Real-time status change without refresh
4. Activity logged -> Event added to chronological feed

### Event Types

**Job Lifecycle**: `job:created`, `job:started`, `job:completed`, `job:failed`
**System**: `pipeline:status`, `queue:update`

---

## Quick Start

### Development

```bash
npm run dashboard                        # Dashboard UI -> http://localhost:8080
# Or manually:
doppler run -- node api/server.js
```

### Production

```bash
doppler run -c prd -- pm2 start config/ecosystem.config.cjs
pm2 logs aleph-dashboard
pm2 monit
```

---

## Features

| Feature | Status |
|---------|--------|
| Dev server startup | Port 8080 |
| Dashboard rendering | All sections with mock/real data |
| WebSocket connection | Auto-reconnect with exponential backoff |
| Real-time updates | Events update UI immediately (500ms batching) |
| Responsive layout | Mobile / tablet / desktop breakpoints |
| Pipeline status cards | All pipelines displayed |
| Job queue monitoring | Active/queued jobs with capacity gauge |
| Activity feed | Chronological event log, filterable |
| Documentation tabs | 4 tabs with content |
| WCAG AA compliance | Contrast ratios 6.8:1+ |

### Performance (Lighthouse)

- Performance: 97/100, Accessibility: 100/100, Best Practices: 100/100
- CLS: 0.303, First Load: ~42 KB

---

## Mock Data vs Real Data

**Mock Mode** (activated when API returns no data, WS fails, or server starting):
- Sample pipeline statuses, simulated job queue, example events

**Real Mode** (activated when WS connected, API responding, pipelines running):
- Live pipeline statuses, actual queue state, real-time worker events

Auto-transitions from mock to real when WebSocket connects and receives first event.

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

### Custom Events

Edit `handleWebSocketMessage()` in `public/dashboard.js`:

```javascript
case 'custom:event':
  this.addActivity('info', event.message);
  break;
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

## Worker Integration

Workers emit events the dashboard listens for:

```javascript
async processJob(job) {
  this.emit('job:started', { id: job.id, type: 'repomix', timestamp: new Date().toISOString() });
  try {
    const result = await this.runRepomix(job.data);
    this.emit('job:completed', { id: job.id, result, timestamp: new Date().toISOString() });
  } catch (error) {
    this.emit('job:failed', { id: job.id, error: error.message, timestamp: new Date().toISOString() });
  }
}
```

**Flow**: Worker `this.emit()` -> SidequestServer relays -> Express broadcasts -> WebSocket -> Dashboard UI

---

## Troubleshooting

### Dashboard Not Loading

1. Check server: `curl http://localhost:8080/health` -> `{"status":"healthy",...}`
2. Verify files: `ls public/` -> index.html, dashboard.css, dashboard.js
3. Check browser console (F12) for errors

### WebSocket Not Connecting

1. Check status: `curl http://localhost:8080/ws/status`
2. Look for "WebSocket connection established" in activity feed
3. Ensure port 8080 allows WebSocket connections

### No Real Data

1. Check pipelines: `pm2 status`
2. Trigger a job: `curl -X POST http://localhost:8080/api/scans -H "Content-Type: application/json" -d '{"repositoryPath":"/path/to/repo"}'`
3. Check API: `curl http://localhost:8080/api/status`

### Debugging Checklist

- [ ] WebSocket connected? Check header status indicator
- [ ] API responding? Check Network tab in DevTools
- [ ] Props correct? Check React DevTools
- [ ] Store updating? Add console.log in store action
- [ ] Tailwind applying? Check element in browser DevTools

---

## Deployment

### PM2 (Recommended)

```bash
doppler run -- pm2 start config/ecosystem.config.cjs
pm2 save
pm2 startup
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
ExecStart=/usr/bin/doppler run -- node api/server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## Monitoring

```bash
curl http://localhost:8080/health           # Server health
curl http://localhost:8080/ws/status         # WebSocket status
curl http://localhost:8080/api/status        # System status
pm2 logs aleph-dashboard --lines 100        # PM2 logs
pm2 logs aleph-dashboard --err              # Error logs only
```

Sentry integration captures unhandled errors with context: request URL, user agent, WebSocket client count, environment.

---

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome/Edge | 90+ | Fully supported |
| Firefox | 88+ | Fully supported |
| Safari | 14+ | Fully supported |
| iOS Safari / Chrome Mobile | 14+ / 90+ | Mobile optimized |

---

## Related Documentation

- [Dashboard Design System](./DASHBOARD_DESIGN.md) - UI/UX spec, design tokens, mockups
- [System Data Flow](./DATAFLOW_DIAGRAMS.md) - Architecture diagrams
- [Error Handling](../architecture/ERROR_HANDLING.md) - Retry logic, circuit breaker
- [Deployment Guide](../deployment/TRADITIONAL_SERVER_DEPLOYMENT.md) - PM2 setup
