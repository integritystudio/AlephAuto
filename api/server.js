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
import { createComponentLogger } from '../sidequest/utils/logger.js';
import { config } from '../sidequest/core/config.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import scanRoutes, { worker } from './routes/scans.js';
import repositoryRoutes from './routes/repositories.js';
import reportRoutes from './routes/reports.js';
import pipelineRoutes from './routes/pipelines.js';
import * as Sentry from '@sentry/node';
import { createServer } from 'http';
import { createWebSocketServer } from './websocket.js';
import { ScanEventBroadcaster } from './event-broadcaster.js';
import { ActivityFeedManager } from './activity-feed.js';
import { DopplerHealthMonitor } from '../sidequest/pipeline-core/doppler-health-monitor.js';
import { setupServerWithPortFallback, setupGracefulShutdown } from './utils/port-manager.js';
import { getAllPipelineStats } from '../sidequest/core/database.js';
import { getPipelineName } from '../sidequest/utils/pipeline-names.js';
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
app.use(cors());

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
    logger.error({ error }, 'Failed to check Doppler health');
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// System status endpoint (includes retry metrics and activity feed)
// FIXED: Now queries database for ALL pipelines instead of single hardcoded worker
app.get('/api/status', (req, res) => {
  try {
    // Get all pipelines from database (persistent, survives restarts)
    const pipelineStats = getAllPipelineStats();

    // Get in-memory queue stats from duplicate-detection worker
    // (Other workers not imported, so we can't check their real-time status)
    const workerStats = worker.getStats();
    const scanMetrics = worker.getScanMetrics();

    // Get activity feed
    const activityFeed = req.app.get('activityFeed');
    const recentActivity = activityFeed ? activityFeed.getRecentActivities(20) : [];

    // Map database stats to API response format
    const pipelines = pipelineStats.map(stats => ({
      id: stats.pipeline_id,
      name: getPipelineName(stats.pipeline_id),
      // Show "running" status accurately only for duplicate-detection (we have worker access)
      // For other pipelines, use database running count as fallback
      status: (stats.pipeline_id === 'duplicate-detection' && workerStats.activeJobs > 0)
        ? 'running'
        : (stats.running > 0 ? 'running' : 'idle'),
      completedJobs: stats.completed || 0,
      failedJobs: stats.failed || 0,
      lastRun: stats.last_run, // ISO timestamp from database
      nextRun: null // Cron schedule not tracked in database
    }));

    // Calculate queue stats (only from duplicate-detection worker)
    const queueStats = {
      active: workerStats.activeJobs || 0,
      queued: workerStats.queuedJobs || 0,
      capacity: workerStats.activeJobs / (workerStats.maxConcurrent || 3) * 100
    };

    res.json({
      timestamp: new Date().toISOString(),
      pipelines,
      queue: queueStats,
      retryMetrics: scanMetrics.retryMetrics || null,
      recentActivity
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get system status');
    Sentry.captureException(error, {
      tags: { component: 'APIServer', endpoint: '/api/status' }
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve system status',
      timestamp: new Date().toISOString()
    });
  }
});

// Pipeline data flow documentation endpoint
app.get('/api/pipeline-data-flow', async (req, res) => {
  try {
    const docPath = path.join(__dirname, '../docs/architecture/pipeline-data-flow.md');
    const markdown = await fs.readFile(docPath, 'utf-8');

    // Convert markdown to HTML with basic formatting
    // For now, wrap in pre tags to preserve formatting
    // TODO: Add proper markdown parser (marked.js) for full rendering
    const html = `
      <div class="markdown-content">
        <pre class="markdown-raw">${markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      </div>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.error({ error }, 'Failed to load pipeline data flow documentation');
    Sentry.captureException(error, {
      tags: { component: 'APIServer', endpoint: '/api/pipeline-data-flow' }
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to load documentation',
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/scans', scanRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/pipelines', pipelineRoutes);
app.use('/api/sidequest/pipeline-runners', pipelineRoutes); // Dashboard compatibility

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
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

// Connect activity feed to worker events
activityFeed.listenToWorker(worker);

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

// Start server with port fallback
const PREFERRED_PORT = config.apiPort; // Now using JOBS_API_PORT from Doppler (default: 8080)

(async () => {
  try {
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
      timeout: 10000,
      onShutdown: async (signal) => {
        logger.info({ signal }, 'Running custom shutdown handlers');

        // Stop Doppler health monitoring
        dopplerMonitor.stopMonitoring();

        // Close WebSocket server
        await new Promise((resolve) => {
          wss.close(() => {
            logger.info('WebSocket server closed');
            resolve();
          });
        });
      }
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to start server');
    Sentry.captureException(error, {
      tags: { component: 'APIServer', phase: 'startup' }
    });
    process.exit(1);
  }
})();

export default app;
export { broadcaster, activityFeed };
