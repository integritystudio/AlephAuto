#!/usr/bin/env node

// MUST be first: Increase EventEmitter listener limit before any imports
// Multiple components (Sentry, WebSocket, ActivityFeed, Workers, etc.) add listeners during import
process.setMaxListeners(20);

/**
 * REST API Server for Duplicate Detection
 *
 * Provides programmatic access to duplicate detection scanning and results.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { createComponentLogger, logError } from '../sidequest/utils/logger.js';
import { config } from '../sidequest/core/config.js';
import { CONCURRENCY, PORT } from '../sidequest/core/constants.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import scanRoutes from './routes/scans.js';
import repositoryRoutes from './routes/repositories.js';
import reportRoutes from './routes/reports.js';
import pipelineRoutes from './routes/pipelines.js';
import jobsRoutes from './routes/jobs.js';
import * as Sentry from '@sentry/node';
import { createServer } from 'http';
import { createWebSocketServer } from './websocket.js';
import { ScanEventBroadcaster } from './event-broadcaster.js';
import { ActivityFeedManager } from './activity-feed.js';
import { DopplerHealthMonitor } from '../sidequest/pipeline-core/doppler-health-monitor.js';
import { setupServerWithPortFallback, setupGracefulShutdown } from './utils/port-manager.js';
import { jobRepository } from '../sidequest/core/job-repository.js';
import { getPipelineName } from '../sidequest/utils/pipeline-names.js';
import { workerRegistry } from './utils/worker-registry.js';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createComponentLogger('APIServer');

const app = express();
const httpServer = createServer(app);

// Trust proxy for nginx reverse proxy (required for express-rate-limit and correct IP detection)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());

// CORS configuration - allow GitHub Pages frontend and localhost for development
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://n0ai.app',
      'http://localhost:8080',
      'http://localhost:3000',
      'http://127.0.0.1:8080',
      process.env.CORS_ORIGIN // Allow custom origin via environment variable
    ].filter(Boolean);

    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin }, 'CORS blocked request from unauthorized origin');
      callback(null, true); // Still allow for now, but log it
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// CSP headers to allow iframe embedding from any origin
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  next();
});

// Serve static files from public directory (dashboard)
app.use(express.static(path.join(__dirname, '../public')));

// Logging middleware
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
  }, 'API request received');
  next();
});

// Authentication and rate limiting
app.use(authMiddleware);
app.use(rateLimiter);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Doppler health check endpoint (no auth required)
const dopplerMonitor = new DopplerHealthMonitor();
app.get('/api/health/doppler', async (req, res) => {
  try {
    const health = await dopplerMonitor.checkCacheHealth();

    res.json({
      status: health.healthy ? 'healthy' : 'degraded',
      cacheAgeHours: health.cacheAgeHours,
      cacheAgeMinutes: health.cacheAgeMinutes,
      maxCacheAgeHours: 24,
      warningThresholdHours: 12,
      usingFallback: health.usingFallback,
      severity: health.severity,
      lastModified: health.lastModified,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logError(logger, error, 'Failed to check Doppler health');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'Failed to check Doppler health'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// System status endpoint (includes retry metrics and activity feed)
// FIXED: Now queries database for ALL pipelines instead of single hardcoded worker
app.get('/api/status', (req, res) => {
  try {
    // Get all pipelines from database (persistent, survives restarts)
    const pipelineStats = jobRepository.getAllPipelineStats();

    // Get in-memory queue stats from all initialized workers via registry
    const workerStats = workerRegistry.getAllStats();
    const scanMetrics = workerRegistry.getScanMetrics('duplicate-detection') || {};

    // Get activity feed
    const activityFeed = req.app.get('activityFeed');
    const recentActivity = activityFeed ? activityFeed.getRecentActivities(20) : [];

    // Create a map of database stats by pipeline_id
    const statsMap = new Map(pipelineStats.map(s => [s.pipeline_id, s]));

    // Get all registered workers and merge with database stats
    const allPipelineIds = workerRegistry.getSupportedPipelines();

    // Map all registered pipelines to API response format
    const pipelines = allPipelineIds.map(pipelineId => {
      const dbStats = statsMap.get(pipelineId) || {};
      const pipelineWorkerStats = workerStats.byPipeline[pipelineId] || {};

      // Use worker stats if available, otherwise fall back to database running count
      const activeJobs = pipelineWorkerStats.active || dbStats.running || 0;

      return {
        id: pipelineId,
        name: getPipelineName(pipelineId),
        status: activeJobs > 0 ? 'running' : 'idle',
        completedJobs: dbStats.completed || 0,
        failedJobs: dbStats.failed || 0,
        lastRun: dbStats.last_run || null,
        nextRun: null
      };
    });

    // Calculate aggregated queue stats from all workers
    // Capacity is percentage of max concurrent jobs currently in use
    const queueStats = {
      active: workerStats.active || 0,
      queued: workerStats.queued || 0,
      capacity: workerStats.active > 0
        ? Math.min(100, (workerStats.active / CONCURRENCY.DEFAULT_MAX_JOBS) * 100)
        : 0
    };

    res.json({
      timestamp: new Date().toISOString(),
      pipelines,
      queue: queueStats,
      retryMetrics: scanMetrics.retryMetrics || null,
      recentActivity
    });
  } catch (error) {
    logError(logger, error, 'Failed to get system status');
    Sentry.captureException(error, {
      tags: { component: 'APIServer', endpoint: '/api/status' }
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve system status'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Pipeline data flow documentation endpoint (serves SYSTEM-DATA-FLOW.md)
app.get('/api/pipeline-data-flow', async (req, res) => {
  try {
    const docPath = path.join(__dirname, '../docs/architecture/SYSTEM-DATA-FLOW.md');
    const markdown = await fs.readFile(docPath, 'utf-8');

    // Configure marked for GitHub-flavored markdown with mermaid support
    marked.setOptions({
      gfm: true,
      breaks: true
    });

    // Parse markdown to HTML
    const rawHtml = await marked.parse(markdown);

    // Sanitize HTML to prevent XSS (allow mermaid code blocks)
    const window = new JSDOM('').window;
    const purify = DOMPurify(window);
    const cleanHtml = purify.sanitize(rawHtml, {
      ADD_TAGS: ['pre', 'code'],
      ADD_ATTR: ['class', 'data-lang']
    });

    // Wrap in container with proper CSS classes
    const html = `
      <div class="markdown-content">
        ${cleanHtml}
      </div>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logError(logger, error, 'Failed to load pipeline data flow documentation');
    Sentry.captureException(error, {
      tags: { component: 'APIServer', endpoint: '/api/pipeline-data-flow' }
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to load documentation'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/scans', scanRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/pipelines', pipelineRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/sidequest/pipeline-runners', pipelineRoutes); // Dashboard compatibility

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`
    },
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use(errorHandler);

// Initialize WebSocket server
const wss = createWebSocketServer(httpServer);
const broadcaster = new ScanEventBroadcaster(wss);

// Initialize activity feed
const activityFeed = new ActivityFeedManager(broadcaster, { maxActivities: 50 });

// Connect activity feed to WorkerRegistry for dynamically created workers
// This also connects to all existing registered workers
workerRegistry.setActivityFeed(activityFeed);

// Make broadcaster and activity feed available to routes
app.set('broadcaster', broadcaster);
app.set('activityFeed', activityFeed);

// WebSocket status endpoint (before API routes to avoid conflict)
app.get('/ws/status', (req, res) => {
  const clientInfo = wss.getClientInfo();
  const address = httpServer.address();
  const actualPort = (typeof address === 'string' ? config.apiPort : address?.port) || config.apiPort;
  res.json({
    ...clientInfo,
    websocket_url: `ws://localhost:${actualPort}/ws`,
    timestamp: new Date().toISOString()
  });
});

/**
 * Emergency shutdown handler for startup failures
 * Cleans up partially initialized resources to prevent resource leaks
 * @private
 */
async function _emergencyShutdown() {
  logger.info('Starting emergency shutdown...');

  try {
    // Stop Doppler health monitoring if started
    dopplerMonitor.stopMonitoring();
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to stop Doppler monitor during emergency shutdown');
  }

  try {
    // Shutdown all workers if registry initialized
    await workerRegistry.shutdown();
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to shutdown worker registry during emergency shutdown');
  }

  try {
    // Close WebSocket server if created
    if (wss?.clients) {
      await new Promise((resolve) => {
        wss.close(() => {
          logger.info('WebSocket server closed during emergency shutdown');
          resolve();
        });
      });
    }
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to close WebSocket server during emergency shutdown');
  }

  try {
    // Close job repository if initialized
    jobRepository.close();
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to close job repository during emergency shutdown');
  }

  logger.info('Emergency shutdown complete');
}

// Start server with port fallback
const PREFERRED_PORT = config.apiPort; // Now using JOBS_API_PORT from Doppler (default: 8080)

(async () => {
  try {
    // Initialize job repository (sql.js requires async init)
    await jobRepository.initialize();
    logger.info('Job repository initialized');

    // Setup server with automatic port fallback
    const actualPort = await setupServerWithPortFallback(httpServer, {
      preferredPort: PREFERRED_PORT,
      maxPort: PREFERRED_PORT + 10,
      host: '0.0.0.0',
      killExisting: false // Set to true in development if needed
    });

    logger.info({ port: actualPort }, 'API server started');
    console.log(`\n🚀 AlephAuto API Server & Dashboard running on port ${actualPort}`);
    if (actualPort !== PREFERRED_PORT) {
      console.log(`   ⚠️  Using fallback port ${actualPort} (preferred ${PREFERRED_PORT} was in use)`);
    }
    console.log(`   📊 Dashboard: http://localhost:${actualPort}/`);
    console.log(`   ❤️  Health check: http://localhost:${actualPort}/health`);
    console.log(`   🩺 Doppler health: http://localhost:${actualPort}/api/health/doppler`);
    console.log(`   🔌 WebSocket: ws://localhost:${actualPort}/ws`);
    console.log(`   📡 API: http://localhost:${actualPort}/api/\n`);

    // Start Doppler health monitoring (check every 15 minutes)
    await dopplerMonitor.startMonitoring(15);

    // Setup graceful shutdown handlers
    setupGracefulShutdown(httpServer, {
      timeout: PORT.DEFAULT_SHUTDOWN_TIMEOUT_MS,
      onShutdown: async (signal) => {
        logger.info({ signal }, 'Running custom shutdown handlers');

        // Stop Doppler health monitoring
        dopplerMonitor.stopMonitoring();

        // Shutdown all workers
        await workerRegistry.shutdown();

        // Close WebSocket server
        await new Promise((resolve) => {
          wss.close(() => {
            logger.info('WebSocket server closed');
            resolve();
          });
        });

        // Close job repository
        jobRepository.close();
      }
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to start server');
    Sentry.captureException(error, {
      tags: { component: 'APIServer', phase: 'startup' }
    });

    // Emergency shutdown: cleanup partially initialized resources
    await _emergencyShutdown();

    process.exit(1);
  }
})();

export default app;
export { broadcaster, activityFeed };
