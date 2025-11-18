# AlephAuto Dashboard

Real-time pipeline monitoring and job queue management dashboard for the AlephAuto automation framework.

## Features

- **Real-time Updates**: WebSocket connection provides live status updates for all pipelines and jobs
- **Pipeline Status**: Monitor all active pipelines with status indicators, last run times, and job statistics
- **Job Queue**: Track active and queued jobs with capacity monitoring
- **Activity Feed**: Recent events, completions, and errors in chronological order
- **Documentation**: Built-in documentation for pipelines, API, and architecture
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices

## Quick Start

### Start the Dashboard

```bash
# Using npm script (recommended)
npm run dashboard

# Or manually with doppler
doppler run -- node api/server.js

# For production deployment with PM2
doppler run -- pm2 start api/server.js --name aleph-dashboard
```

The dashboard will be available at:
- **Dashboard UI**: http://localhost:8080/
- **API Health**: http://localhost:8080/health
- **WebSocket**: ws://localhost:8080/ws

## Dashboard Sections

### 1. Pipeline Status
Monitor all automation pipelines at a glance:
- **Duplicate Detection**: Code duplicate scanning with AST-grep
- **Documentation Enhancement**: Schema.org structured data injection
- **Git Activity Reporter**: Weekly/monthly git statistics
- **Plugin Manager**: Claude Code plugin auditing

Each pipeline card shows:
- Current status (idle, running, error, completed)
- Last run timestamp
- Next scheduled run
- Completed and failed job counts

### 2. Job Queue
Real-time job queue monitoring:
- **Active Jobs**: Currently executing jobs
- **Queued Jobs**: Jobs waiting to execute
- **Capacity**: Queue utilization percentage

### 3. Activity Feed
Chronological feed of recent events:
- Job creation, starts, completions, and failures
- System status changes
- WebSocket connection events
- Color-coded by event type (success, error, info)

### 4. Documentation
Built-in documentation with tabs:
- **Getting Started**: Overview and quick actions
- **Pipelines**: Detailed pipeline descriptions and schedules
- **API Reference**: REST endpoints and WebSocket events
- **Architecture**: System architecture diagrams

## WebSocket Events

The dashboard subscribes to these real-time events:

```javascript
// Job lifecycle events
'job:created'    // New job added to queue
'job:started'    // Job execution started
'job:completed'  // Job finished successfully
'job:failed'     // Job execution failed

// System events
'pipeline:status'  // Pipeline status update
'queue:update'     // Queue statistics update
```

## API Integration

The dashboard integrates with the AlephAuto REST API:

### Health Check
```bash
GET /health
# Returns: { status: 'healthy', timestamp: '...', version: '1.0.0' }
```

### System Status
```bash
GET /api/status
# Returns pipeline states, queue info, and recent activity
```

### Trigger Scan
```bash
POST /api/scans
Content-Type: application/json

{
  "repositoryPath": "/path/to/repo"
}
```

### WebSocket Status
```bash
GET /ws/status
# Returns: { connected_clients: 1, websocket_url: '...', timestamp: '...' }
```

## Architecture

The dashboard is built with vanilla JavaScript for simplicity and performance:

```
public/
├── index.html      # Dashboard structure with semantic HTML
├── dashboard.css   # Modern CSS with CSS variables and grid layout
├── dashboard.js    # WebSocket client and API integration
└── README.md       # This file
```

### Key Technologies
- **Frontend**: Vanilla JavaScript (no build step required)
- **Styling**: Modern CSS with CSS Grid and Flexbox
- **Real-time**: WebSocket with automatic reconnection
- **API Client**: Native fetch API
- **Server**: Express.js with static file serving

### Design Philosophy
- **Signal over noise**: Every element serves a functional purpose
- **Real-time visibility**: WebSocket updates without page refresh
- **No cognitive overhead**: Clear visual hierarchy and status indicators
- **Responsive**: Mobile-first design that scales to desktop
- **Accessible**: WCAG AA compliant with keyboard navigation

## Features in Detail

### Automatic Reconnection
The dashboard automatically reconnects to the WebSocket server with exponential backoff:
- Initial delay: 1 second
- Max delay: 30 seconds
- Max attempts: 10
- Visual indicator shows connection status

### Event Batching
WebSocket events are batched for 500ms to prevent UI flicker when multiple events arrive in quick succession.

### Relative Timestamps
All timestamps are displayed as relative times ("2 minutes ago", "1 hour ago") and update automatically.

### Status Indicators
Color-coded status badges:
- 🟢 **Green**: Success, healthy, completed
- 🔴 **Red**: Error, failed
- 🔵 **Blue**: Running, active
- 🟡 **Amber**: Queued, pending
- ⚫ **Gray**: Idle, inactive

### Documentation Tabs
In-app documentation with four sections:
1. **Getting Started**: Quick overview and actions
2. **Pipelines**: All pipeline details with schedules
3. **API Reference**: Complete API documentation
4. **Architecture**: System diagrams and components

## Responsive Breakpoints

The dashboard adapts to different screen sizes:

- **Desktop (1200px+)**: 3-column layout with all sections visible
- **Tablet (768px-1199px)**: 2-column layout, activity section spans full width
- **Mobile (<768px)**: Single column, stacked sections

## Development

### File Structure
```
public/
├── index.html          # HTML structure (12 KB)
├── dashboard.css       # Styles with CSS variables (13 KB)
├── dashboard.js        # WebSocket client and API integration (17 KB)
└── README.md           # Documentation (this file)
```

### Customization

**Change default port:**
```bash
JOBS_API_PORT=9000 npm run dashboard
```

**Modify colors:**
Edit CSS variables in `dashboard.css`:
```css
:root {
  --color-success: #10b981;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  /* ... */
}
```

**Add custom WebSocket events:**
Edit `handleWebSocketMessage()` in `dashboard.js`:
```javascript
case 'custom:event':
  this.addActivity('info', event.message);
  break;
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- **First Load**: ~42 KB (HTML + CSS + JS)
- **WebSocket**: Minimal bandwidth, event-driven updates
- **Memory**: <10 MB typical usage
- **Animations**: Respects `prefers-reduced-motion`

## Accessibility

- Semantic HTML5 structure
- ARIA labels on interactive elements
- Keyboard navigation support (Tab, Enter, Escape)
- 2px focus outlines for visibility
- 4.5:1 minimum contrast ratio (WCAG AA)
- Screen reader friendly

## Troubleshooting

### Dashboard not loading
1. Check the server is running: `curl http://localhost:8080/health`
2. Verify `public/` directory exists with all files
3. Check browser console for errors

### WebSocket not connecting
1. Verify WebSocket server is enabled in `api/server.js`
2. Check firewall settings allow WebSocket connections
3. Look for "WebSocket connection established" in activity feed

### No data showing
1. The dashboard shows mock data by default if API is not available
2. To see real data, ensure pipelines are running
3. Check API endpoints: `curl http://localhost:8080/api/status`

### Styles not loading
1. Clear browser cache
2. Check `dashboard.css` exists in `public/`
3. Verify static file serving is enabled in `api/server.js`

## Production Deployment

### With PM2
```bash
# Start dashboard with PM2
doppler run -- pm2 start api/server.js --name aleph-dashboard

# View logs
pm2 logs aleph-dashboard

# Monitor
pm2 monit

# Restart
pm2 restart aleph-dashboard
```

### Environment Variables
```bash
JOBS_API_PORT=8080      # Server port
NODE_ENV=production     # Environment mode
```

## Related Documentation

- [AlephAuto Framework](../docs/DATAFLOW_DIAGRAMS.md)
- [API Documentation](../docs/components/)
- [Pipeline Configuration](../config/scan-repositories.json)
- [UI/UX Design Specs](../docs/DASHBOARD_UI_DESIGN.md)

## License

MIT License - Part of the AlephAuto automation framework

---

**Built with Claude Code** | [Report Issues](https://github.com/anthropics/claude-code/issues)
