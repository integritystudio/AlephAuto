# AlephAuto Dashboard Frontend

Real-time monitoring dashboard for the AlephAuto job queue framework.

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Zustand** - State management
- **Socket.IO Client** - Real-time WebSocket communication
- **Axios** - HTTP client for REST API
- **Recharts** - Data visualization
- **Lucide React** - Icon library

## Project Structure

```
frontend/
├── src/
│   ├── components/     # React components
│   ├── hooks/          # Custom React hooks
│   ├── services/       # API and WebSocket services
│   ├── store/          # Zustand state management
│   ├── types/          # TypeScript type definitions
│   ├── App.tsx         # Root component
│   ├── main.tsx        # Entry point
│   └── index.css       # Global styles (Tailwind)
├── public/             # Static assets
├── index.html          # HTML entry point
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript configuration
├── tailwind.config.js  # Tailwind CSS configuration
└── package.json        # Dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Installation

```bash
cd frontend
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`

The Vite dev server is configured to proxy API requests:
- `/api/*` → `http://localhost:8080`
- `/ws` (WebSocket) → `ws://localhost:8080`

### Build

Create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

### Type Checking

Run TypeScript type checking without emitting files:

```bash
npm run typecheck
```

## Environment Variables

Create a `.env.local` file for local development (optional):

```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
```

## Implementation Status

### ✅ Completed

- [x] Project setup and configuration
- [x] Dependencies installation
- [x] TypeScript configuration
- [x] Tailwind CSS configuration
- [x] Vite build configuration
- [x] Type definitions (Pipeline, Job, Activity, SystemStatus)
- [x] Basic project structure

### 🔄 In Progress

- [ ] Zustand store implementation
- [ ] WebSocket service
- [ ] API service layer
- [ ] Core components (Header, Pipeline, JobQueue, Activity)
- [ ] Real-time data flow

### 📋 Planned

- [ ] Documentation viewer component
- [ ] Responsive design testing
- [ ] Accessibility audit (WCAG AA)
- [ ] Performance optimization
- [ ] Production deployment

## Next Steps

Following the implementation guide in `docs/DASHBOARD_IMPLEMENTATION_GUIDE.md`:

1. **Implement Zustand Store** (`src/store/dashboard.ts`)
   - Pipeline state management
   - Job queue state
   - Activity feed state
   - System status state

2. **Create WebSocket Service** (`src/services/websocket.ts`)
   - Connection management with reconnection logic
   - Event handlers for job lifecycle
   - System status updates

3. **Build API Service** (`src/services/api.ts`)
   - REST endpoints for pipelines, jobs, scans
   - Error handling and retries
   - Type-safe responses

4. **Create Core Components**
   - Layout component (grid structure)
   - Header (system status, settings)
   - PipelineStatus (pipeline cards with progress)
   - JobQueue (active and queued jobs)
   - RecentActivity (activity feed)

5. **Connect Real-Time Updates**
   - WebSocket integration hook
   - Polling fallback for connection issues
   - State synchronization

## Documentation

Full design and implementation documentation available in:
- `docs/DASHBOARD_SUMMARY.md` - Executive overview
- `docs/DASHBOARD_UI_DESIGN.md` - Complete UI specification
- `docs/DASHBOARD_IMPLEMENTATION_GUIDE.md` - Technical implementation guide
- `docs/DASHBOARD_VISUAL_MOCKUPS.md` - Design tokens and mockups
- `docs/DASHBOARD_QUICK_REFERENCE.md` - Developer cheat sheet

## API Integration

The dashboard connects to the AlephAuto backend API running on port 8080:

**Health Check**
- `GET /health` - System health status

**Pipelines**
- `GET /api/pipelines` - List all pipelines
- `GET /api/pipelines/:id` - Get pipeline details

**Jobs**
- `GET /api/jobs?status=running` - Get active jobs
- `GET /api/jobs?status=queued` - Get queued jobs
- `GET /api/jobs/:id` - Get job details
- `GET /api/jobs/:id/logs` - Get job logs
- `POST /api/jobs/:id/cancel` - Cancel a job
- `POST /api/jobs/:id/retry` - Retry a failed job

**Scans**
- `POST /api/scan` - Trigger a new scan
- `GET /api/scan/:id` - Get scan results

## Contributing

When adding new features:
1. Follow the existing project structure
2. Add TypeScript types in `src/types/`
3. Use Zustand for state management
4. Follow Tailwind CSS utility patterns
5. Run `npm run typecheck` before committing

## License

ISC
