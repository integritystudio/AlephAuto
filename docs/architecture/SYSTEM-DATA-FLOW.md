# AlephAuto System Data Flow Documentation

**Last Updated:** 2025-12-02
**Version:** 1.0
**Author:** Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Complete System Architecture](#complete-system-architecture)
3. [Data Flow Diagrams](#data-flow-diagrams)
   - [High-Level System Flow](#high-level-system-flow)
   - [API Request Flow](#api-request-flow)
   - [Job Queue Flow](#job-queue-flow)
   - [WebSocket Real-Time Flow](#websocket-real-time-flow)
   - [Database Flow](#database-flow)
   - [Error Handling Flow](#error-handling-flow)
4. [Component Interactions](#component-interactions)
5. [Inter-Process Communication](#inter-process-communication)
6. [Configuration Flow](#configuration-flow)
7. [Deployment Architecture](#deployment-architecture)

---

## System Overview

AlephAuto is a **job queue framework** with real-time dashboard for automation pipelines. The system processes 9 different pipeline types across JavaScript and Python, with real-time monitoring via WebSocket and comprehensive error tracking via Sentry.

### System Characteristics

| Characteristic | Value |
|---------------|-------|
| **Architecture** | Event-driven microservices |
| **Primary Language** | JavaScript/TypeScript + Python |
| **Database** | SQLite (WAL mode) |
| **Real-time** | WebSocket (ws library) |
| **Error Tracking** | Sentry v8 |
| **Config Management** | Doppler |
| **Process Manager** | PM2 |
| **Concurrency** | Configurable (default: 3 jobs) |

### Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │   Dashboard UI   │  │   REST API      │  │   WebSocket     │      │
│  │   (React/Vite)   │  │   (Express 5)   │  │   (ws library)  │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │  Route Handlers  │  │   Middleware    │  │  Event Manager  │      │
│  │  (api/routes/)   │  │   (validation)  │  │  (broadcasts)   │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BUSINESS LOGIC LAYER                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    SidequestServer (Base)                    │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │    │
│  │  │Duplicate │ │ Schema   │ │   Git    │ │  Repo    │  ...   │    │
│  │  │Detection │ │Enhance   │ │ Activity │ │ Cleanup  │        │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA ACCESS LAYER                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │   SQLite DB     │  │   File System   │  │   External      │      │
│  │   (jobs.db)     │  │   (reports)     │  │   Services      │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Complete System Architecture

### Full System Diagram

```mermaid
graph TB
    subgraph External["External Systems"]
        User["User Browser"]
        Git[Git Repositories]
        Sentry[Sentry Error Tracking]
        Doppler[Doppler Secrets]
    end

    subgraph Frontend["Frontend Layer"]
        Dashboard["Dashboard UI"]
        Store["Zustand Store"]
        WSClient["WebSocket Client"]
    end

    subgraph API["API Layer - Express 5"]
        Server["Express Server"]
        Routes["Route Handlers"]
        Middleware["Validation Middleware"]
        WSServer["WebSocket Server"]
    end

    subgraph JobQueue["Job Queue Framework"]
        BaseServer["SidequestServer"]
        Queue["Job Queue"]
        EventEmitter["Event Emitter"]
    end

    subgraph Workers["Worker Layer"]
        DD["Duplicate Detection"]
        SE["Schema Enhancement"]
        GA["Git Activity"]
        RC["Repo Cleanup"]
        Others["Other Workers"]
    end

    subgraph Pipeline["Pipeline Processing"]
        Orchestrator["Scan Orchestrator"]
        JSStages["JS Stages 1-2"]
        PyStages["Python Stages 3-7"]
    end

    subgraph Data["Data Layer"]
        SQLite[("SQLite DB")]
        FileSystem[("File System")]
        Config["Config"]
    end

    subgraph Monitoring["Monitoring"]
        ActivityFeed["Activity Feed"]
        Broadcaster["Broadcaster"]
        ErrorClassifier["Error Classifier"]
    end

    %% User interactions
    User -->|"HTTP and WS"| Dashboard
    Dashboard --> Store
    Store <-->|WebSocket| WSClient
    WSClient <-->|WS Connection| WSServer

    %% API flow
    Dashboard -->|REST API| Server
    Server --> Middleware
    Middleware --> Routes
    Routes --> BaseServer

    %% Job queue flow
    BaseServer --> Queue
    Queue --> EventEmitter
    EventEmitter --> DD & SE & GA & RC & Others

    %% Worker to pipeline
    DD --> Orchestrator
    Orchestrator --> JSStages
    JSStages -->|"JSON stdin-stdout"| PyStages
    PyStages --> FileSystem

    %% Data persistence
    BaseServer --> SQLite
    Routes --> SQLite
    Config --> Doppler

    %% Monitoring flow
    EventEmitter --> ActivityFeed
    ActivityFeed --> Broadcaster
    Broadcaster --> WSServer
    ErrorClassifier --> Sentry

    %% Git operations
    DD -->|Clone/Scan| Git
    SE -->|PR Creation| Git

    style BaseServer fill:#bbf,stroke:#333,stroke-width:2px
    style Orchestrator fill:#bfb,stroke:#333,stroke-width:2px
    style SQLite fill:#f9f,stroke:#333,stroke-width:2px
    style WSServer fill:#ff9,stroke:#333,stroke-width:2px
```

---

## Data Flow Diagrams

### High-Level System Flow

This diagram shows the complete request-to-response flow through the entire system:

```mermaid
sequenceDiagram
    participant U as User
    participant D as Dashboard
    participant A as API Server
    participant Q as Job Queue
    participant W as Worker
    participant P as Pipeline
    participant DB as SQLite
    participant WS as WebSocket

    U->>D: Click "Start Scan"
    D->>A: POST /api/scans/start
    A->>A: Validate request (Zod)
    A->>Q: createJob(data)
    Q->>DB: INSERT job (status: queued)
    Q-->>A: Job ID
    A-->>D: { scanId, status: queued }

    Note over Q,W: Job Processing (Async)

    Q->>W: Dequeue job
    W->>DB: UPDATE status: running
    W->>WS: Broadcast job:started
    WS-->>D: Real-time update

    W->>P: Execute pipeline
    P->>P: Stage 1-7 processing
    P-->>W: Result

    alt Success
        W->>DB: UPDATE status: completed
        W->>WS: Broadcast job:completed
        WS-->>D: Real-time update
    else Failure
        W->>W: Classify error
        W->>DB: UPDATE status: failed
        W->>WS: Broadcast job:failed
        WS-->>D: Real-time update
    end

    U->>D: View results
    D->>A: GET /api/scans/:id/results
    A->>DB: SELECT job
    A-->>D: Job result
```

### API Request Flow

Detailed flow of HTTP requests through the API layer:

```mermaid
flowchart TB
    subgraph Request["Incoming Request"]
        HTTP[HTTP Request]
        Method[Method + Path]
        Body[Request Body]
        Headers[Headers]
    end

    subgraph Middleware["Middleware Stack"]
        CORS["CORS Middleware"]
        JSON["JSON Parser"]
        RateLimit["Rate Limiter"]
        Auth["Auth Middleware"]
        Validation["Zod Validation"]
    end

    subgraph Routing["Route Handling"]
        Router[Express Router]
        HealthRoutes["health endpoints"]
        ScanRoutes["scan endpoints"]
        JobRoutes["job endpoints"]
        PipelineRoutes["pipeline endpoints"]
    end

    subgraph Response["Response Generation"]
        Handler[Route Handler]
        Transform[Response Transform]
        ErrorHandler[Error Handler]
        Send[HTTP Response]
    end

    HTTP --> CORS
    CORS --> JSON
    JSON --> RateLimit
    RateLimit --> Auth
    Auth --> Validation
    Validation --> Router

    Router --> HealthRoutes
    Router --> ScanRoutes
    Router --> JobRoutes
    Router --> PipelineRoutes

    HealthRoutes --> Handler
    ScanRoutes --> Handler
    JobRoutes --> Handler
    PipelineRoutes --> Handler

    Handler --> Transform
    Handler -->|Error| ErrorHandler
    Transform --> Send
    ErrorHandler --> Send

    style Validation fill:#bbf,stroke:#333
    style Handler fill:#bfb,stroke:#333
    style ErrorHandler fill:#f99,stroke:#333
```

### Job Queue Flow

Complete job lifecycle from creation to completion:

```mermaid
stateDiagram-v2
    [*] --> Created: createJob()

    Created --> Queued: Add to queue
    Queued --> Running: Dequeue (concurrency check)

    Running --> Completed: Success
    Running --> RetryPending: Retryable error

    RetryPending --> Running: Backoff elapsed
    RetryPending --> Failed: Max retries exceeded

    Running --> Failed: Non-retryable error

    Completed --> [*]
    Failed --> [*]

    note right of Created
        Events: job:created
        DB: INSERT job
    end note

    note right of Running
        Events: job:started
        DB: UPDATE running
    end note

    note right of Completed
        Events: job:completed
        DB: UPDATE completed
        Broadcast: WebSocket
    end note

    note right of Failed
        Events: job:failed
        DB: UPDATE failed
        Sentry: captureException
    end note
```

### WebSocket Real-Time Flow

Real-time communication between server and dashboard:

```mermaid
sequenceDiagram
    participant D as Dashboard
    participant WS as WebSocket Server
    participant AF as Activity Feed
    participant W as Worker

    D->>WS: Connect (ws://localhost:8080/ws)
    WS-->>D: Connection established

    Note over WS: Heartbeat Loop
    loop Every 30s
        WS->>D: ping
        D->>WS: pong
    end

    Note over W,AF: Job Events
    W->>W: Job created
    W->>AF: emit('job:created')
    AF->>WS: broadcast('job:created', data)
    WS->>D: { event: 'job:created', data }

    W->>W: Job started
    W->>AF: emit('job:started')
    AF->>WS: broadcast('job:started', data)
    WS->>D: { event: 'job:started', data }

    W->>W: Job completed
    W->>AF: emit('job:completed')
    AF->>WS: broadcast('job:completed', data)
    WS->>D: { event: 'job:completed', data }

    D->>D: Update Zustand store
    D->>D: Re-render components
```

### Database Flow

SQLite database operations and schema:

```mermaid
erDiagram
    JOBS {
        TEXT id PK "UUID"
        TEXT pipeline_id "e.g., duplicate-detection"
        TEXT status "queued|running|completed|failed"
        TEXT created_at "ISO timestamp"
        TEXT started_at "ISO timestamp"
        TEXT completed_at "ISO timestamp"
        TEXT data "JSON: job input"
        TEXT result "JSON: job output"
        TEXT error "JSON: error details"
        TEXT git "JSON: git workflow metadata"
    }

    JOBS ||--o{ JOB_HISTORY : "has"

    JOB_HISTORY {
        INTEGER id PK
        TEXT job_id FK
        TEXT status
        TEXT timestamp
        TEXT details
    }
```

```mermaid
flowchart LR
    subgraph Operations["Database Operations"]
        direction TB
        Init["initDatabase"]
        Save["saveJob"]
        Get["getJobs"]
        Stats["getAllPipelineStats"]
    end

    subgraph Indexes["Indexes"]
        I1[idx_jobs_pipeline_id]
        I2[idx_jobs_status]
        I3[idx_jobs_created_at DESC]
    end

    subgraph WAL["WAL Mode"]
        Write[Write Operations]
        Read[Read Operations]
        Checkpoint[Auto Checkpoint]
    end

    Init --> Save
    Save --> I1 & I2 & I3
    Get --> I1 & I2 & I3
    Stats --> I1 & I2

    Write --> WAL
    Read --> WAL
    WAL --> Checkpoint

    style Init fill:#bbf,stroke:#333
    style WAL fill:#bfb,stroke:#333
```

### Error Handling Flow

Complete error classification and handling:

```mermaid
flowchart TB
    Error[Error Occurs] --> Classify[Error Classifier]

    Classify --> Network{Network Error?}
    Classify --> FileSystem{File System Error?}
    Classify --> Validation{Validation Error?}

    Network -->|ETIMEDOUT, ECONNRESET| Retryable[Retryable: true]
    FileSystem -->|ENOENT, EACCES| NonRetryable[Retryable: false]
    Validation -->|Zod Error| NonRetryable

    Retryable --> RetryCheck{Retries < Max?}
    RetryCheck -->|Yes| Backoff[Exponential Backoff]
    RetryCheck -->|No| FailJob[Fail Job]

    Backoff --> Retry[Retry Job]
    Retry --> Success{Success?}
    Success -->|Yes| Complete[Complete Job]
    Success -->|No| RetryCheck

    NonRetryable --> FailJob

    FailJob --> Sentry[Capture to Sentry]
    FailJob --> DB[Update DB: failed]
    FailJob --> Broadcast[Broadcast job:failed]

    Complete --> DBSuccess[Update DB: completed]
    Complete --> BroadcastSuccess[Broadcast job:completed]

    style Retryable fill:#ff9,stroke:#333
    style NonRetryable fill:#f99,stroke:#333
    style Complete fill:#9f9,stroke:#333
    style FailJob fill:#f66,stroke:#333
```

---

## Component Interactions

### Worker Registry Pattern

```mermaid
flowchart TB
    subgraph Registry["Worker Registry"]
        Register["registerWorker"]
        Get["getWorker"]
        All["getAllWorkers"]
        Health["healthCheck"]
    end

    subgraph Workers["Registered Workers"]
        DD["duplicate-detection"]
        SE["schema-enhancement"]
        GA["git-activity-report"]
        GI["gitignore-update"]
        RC["repo-cleanup"]
        CH["claude-health-check"]
        TR["test-refactor"]
        PM["plugin-audit"]
        RM["repomix-scan"]
    end

    subgraph API["API Routes"]
        Start["POST scans start"]
        List["GET pipelines"]
        Status["GET jobs by id"]
    end

    Register --> DD & SE & GA & GI & RC & CH & TR & PM & RM

    Start --> Get
    Get --> DD

    List --> All
    All --> DD & SE & GA & GI & RC & CH & TR & PM & RM

    Status --> Get

    style Registry fill:#bbf,stroke:#333
```

### Event Broadcasting Architecture

```mermaid
flowchart TB
    subgraph Workers["Workers (EventEmitter)"]
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker 3]
    end

    subgraph Events["Event Types"]
        Created[job:created]
        Started[job:started]
        Completed[job:completed]
        Failed[job:failed]
    end

    subgraph Listeners["Event Listeners"]
        AF[Activity Feed Manager]
        SEB[Scan Event Broadcaster]
        Logger[Pino Logger]
    end

    subgraph Output["Output Channels"]
        WS[WebSocket Clients]
        Memory["In-Memory Feed"]
        Logs[Log Files]
    end

    W1 & W2 & W3 --> Created & Started & Completed & Failed

    Created & Started & Completed & Failed --> AF
    Created & Started & Completed & Failed --> SEB
    Created & Started & Completed & Failed --> Logger

    AF --> Memory
    SEB --> WS
    Logger --> Logs

    style AF fill:#bbf,stroke:#333
    style SEB fill:#bfb,stroke:#333
    style WS fill:#ff9,stroke:#333
```

---

## Inter-Process Communication

### JavaScript ↔ Python Bridge

The duplicate detection pipeline bridges JavaScript and Python via JSON over stdin/stdout:

```mermaid
sequenceDiagram
    participant JS as JavaScript
    participant Spawn as Node spawn
    participant PY as Python

    Note over JS: Stages 1-2 Complete

    JS->>JS: Prepare PythonPipelineInput
    JS->>Spawn: spawn('python3', ['extract_blocks.py'])

    Spawn->>PY: Start process

    JS->>Spawn: stdin.write(JSON.stringify(input))
    Spawn->>PY: JSON via stdin

    PY->>PY: Stage 3: Extract blocks
    PY->>PY: Stage 4: Annotate
    PY->>PY: Stage 5: Group duplicates
    PY->>PY: Stage 6: Generate suggestions
    PY->>PY: Stage 7: Build report

    PY->>Spawn: json.dump(result, stdout)
    Spawn->>JS: stdout data event

    JS->>JS: JSON.parse(stdout)
    JS->>JS: Process result

    Note over JS: Pipeline Complete
```

### Data Format Specifications

**JavaScript → Python (Input)**:

```typescript
interface PythonPipelineInput {
  repository_info: {
    path: string;
    name: string;
    git_remote?: string;
    branch?: string;
    languages: string[];
    file_count: number;
    total_lines: number;
  };
  pattern_matches: Array<{
    pattern_id: string;
    file_path: string;
    line_start: number;
    line_end: number;
    source_code: string;
    metadata?: Record<string, unknown>;
  }>;
  scan_config: {
    similarity_threshold: number;
    min_tokens: number;
    enable_semantic: boolean;
  };
}
```

**Python → JavaScript (Output)**:

```typescript
interface PythonPipelineOutput {
  code_blocks: Array<{
    block_id: string;
    pattern_id: string;
    location: {
      file_path: string;
      line_start: number;
      line_end: number;
    };
    source_code: string;
    category: string;
    tags: string[];
  }>;
  duplicate_groups: Array<{
    group_id: string;
    member_block_ids: string[];
    similarity_score: number;
    similarity_method: string;
    occurrence_count: number;
    affected_files: string[];
  }>;
  suggestions: Array<{
    suggestion_id: string;
    strategy: string;
    impact_score: number;
    roi_score: number;
    estimated_effort_hours: number;
    migration_steps: Array<{
      step_number: number;
      description: string;
      automated: boolean;
      estimated_time: string;
    }>;
  }>;
  metrics: {
    total_blocks: number;
    unique_blocks: number;
    duplicate_groups: number;
    total_duplicates: number;
    scan_duration_ms: number;
  };
}
```

---

## Configuration Flow

### Configuration Loading Hierarchy

```mermaid
flowchart TB
    subgraph Sources["Configuration Sources"]
        Doppler["Doppler Secrets"]
        EnvFile[".env File"]
        Defaults["Code Defaults"]
    end

    subgraph Loading["Loading Process"]
        DotEnv["dotenv.config"]
        ProcessEnv["process.env"]
        ConfigModule["config.js"]
    end

    subgraph Config["Exported Config"]
        C1[jobsApiPort: 8080]
        C2[sentryDsn: string]
        C3[enableGitWorkflow: boolean]
        C4[maxConcurrent: 3]
        C5[doppler.failureThreshold: 3]
    end

    subgraph Consumers["Config Consumers"]
        Server[API Server]
        Workers[All Workers]
        Middleware[Middleware]
        Database[Database]
    end

    Doppler -->|Priority 1| ProcessEnv
    EnvFile -->|Priority 2| DotEnv
    DotEnv --> ProcessEnv
    Defaults -->|Priority 3| ConfigModule
    ProcessEnv --> ConfigModule

    ConfigModule --> C1 & C2 & C3 & C4 & C5

    C1 & C2 & C3 & C4 & C5 --> Server
    C1 & C2 & C3 & C4 & C5 --> Workers
    C1 & C2 & C3 & C4 & C5 --> Middleware
    C1 & C2 & C3 & C4 & C5 --> Database

    style Doppler fill:#bbf,stroke:#333
    style ConfigModule fill:#bfb,stroke:#333
```

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `JOBS_API_PORT` | 8080 | API server port |
| `SENTRY_DSN` | - | Sentry error tracking endpoint |
| `NODE_ENV` | development | Environment mode |
| `ENABLE_GIT_WORKFLOW` | false | Enable branch/PR creation |
| `ENABLE_PR_CREATION` | false | Auto-create PRs |
| `RUN_ON_STARTUP` | false | Run pipelines immediately |
| `MAX_CONCURRENT` | 3 | Max concurrent jobs |
| `REDIS_HOST` | localhost | Redis host (optional) |
| `REDIS_PORT` | 6379 | Redis port (optional) |

---

## Deployment Architecture

### Production Deployment Flow

```mermaid
flowchart TB
    subgraph Development["Development"]
        Code[Code Changes]
        Test[npm test]
        TypeCheck[npm run typecheck]
    end

    subgraph CI["CI/CD"]
        Push[git push]
        Actions[GitHub Actions]
        Build[Build Check]
    end

    subgraph Deploy["Deployment"]
        Script[deploy-traditional-server.sh]
        PM2[PM2 Process Manager]
        Nginx[Nginx Reverse Proxy]
    end

    subgraph Runtime["Runtime"]
        Express["Express Server Port 8080"]
        WebSocket["WebSocket Port 8080"]
        SQLite[SQLite Database]
        Logs[Log Files]
    end

    subgraph External["External Services"]
        Doppler[Doppler Secrets]
        Sentry[Sentry Monitoring]
        GitHub[GitHub API]
    end

    Code --> Test --> TypeCheck --> Push
    Push --> Actions --> Build

    Build -->|Success| Script
    Script --> PM2

    PM2 --> Express & WebSocket
    Express --> Nginx
    WebSocket --> Nginx

    Express --> SQLite & Logs
    Express --> Doppler & Sentry & GitHub

    style PM2 fill:#bbf,stroke:#333
    style Nginx fill:#bfb,stroke:#333
    style Doppler fill:#ff9,stroke:#333
```

### PM2 Process Configuration

```javascript
// config/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'alephauto-api',
      script: 'api/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '500M',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log'
    }
  ]
};
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name alephauto.example.com;

    # API routes
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Static files (dashboard)
    location / {
        proxy_pass http://localhost:8080;
    }
}
```

---

## Quick Reference

### API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Basic health check |
| `GET` | `/api/health/doppler` | Doppler cache health |
| `GET` | `/api/status` | Full system status |
| `POST` | `/api/scans/start` | Start intra-project scan |
| `POST` | `/api/scans/start-multi` | Start inter-project scan |
| `GET` | `/api/scans/:id/status` | Get scan status |
| `GET` | `/api/scans/:id/results` | Get scan results |
| `GET` | `/api/jobs` | List all jobs |
| `GET` | `/api/jobs/:id` | Get job details |
| `POST` | `/api/jobs/:id/cancel` | Cancel job |
| `POST` | `/api/jobs/:id/retry` | Retry failed job |
| `GET` | `/api/pipelines` | List pipelines |
| `GET` | `/api/pipelines/:id` | Pipeline details |

### Key File Locations

| Component | Path |
|-----------|------|
| API Server | `api/server.js` |
| Route Handlers | `api/routes/*.ts` |
| WebSocket | `api/websocket.js` |
| Base Queue | `sidequest/core/server.js` |
| Database | `sidequest/core/database.js` |
| Config | `sidequest/config.js` |
| Workers | `sidequest/workers/*.js` |
| Pipelines | `sidequest/pipeline-runners/*.js` |
| Orchestrator | `sidequest/pipeline-core/scan-orchestrator.ts` |

---

## Related Documentation

- **[Pipeline Data Flow](https://github.com/aledlie/AlephAuto/blob/main/docs/architecture/pipeline-data-flow.md)** - Individual pipeline details
- **[Similarity Algorithm](https://github.com/aledlie/AlephAuto/blob/main/docs/architecture/similarity-algorithm.md)** - Duplicate detection algorithm
- **[Error Handling](https://github.com/aledlie/AlephAuto/blob/main/docs/architecture/ERROR_HANDLING.md)** - Error classification and retry
- **[Type System](https://github.com/aledlie/AlephAuto/blob/main/docs/architecture/TYPE_SYSTEM.md)** - Zod schemas and TypeScript
- **[API Reference](https://github.com/aledlie/AlephAuto/blob/main/docs/API_REFERENCE.md)** - Complete API documentation
- **[Cheat Sheet](https://github.com/aledlie/AlephAuto/blob/main/docs/architecture/CHEAT-SHEET.md)** - Quick reference

---

**Document Version:** 1.0
**Last Updated:** 2025-12-02
**Maintainer:** Architecture Team
