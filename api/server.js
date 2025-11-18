#!/usr/bin/env node
/**
 * REST API Server for Duplicate Detection
 *
 * Provides programmatic access to duplicate detection scanning and results.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createComponentLogger } from '../sidequest/logger.js';
import { config } from '../sidequest/config.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import scanRoutes, { worker } from './routes/scans.js';
import repositoryRoutes from './routes/repositories.js';
import reportRoutes from './routes/reports.js';
import * as Sentry from '@sentry/node';
import { createServer } from 'http';
import { createWebSocketServer } from './websocket.js';
import { ScanEventBroadcaster } from './event-broadcaster.js';
import { ActivityFeedManager } from './activity-feed.js';
import { DopplerHealthMonitor } from '../lib/doppler-health-monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createComponentLogger('APIServer');

const app = express();
const httpServer = createServer(app);

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
app.get('/api/status', (req, res) => {
  try {
    const scanMetrics = worker.getScanMetrics();
    const queueStats = worker.getStats();

    // Get activity feed
    const activityFeed = req.app.get('activityFeed');
    const recentActivity = activityFeed ? activityFeed.getRecentActivities(20) : [];

    res.json({
      timestamp: new Date().toISOString(),
      pipelines: [
        {
          id: 'duplicate-detection',
          name: 'Duplicate Detection',
          status: queueStats.activeJobs > 0 ? 'running' : 'idle',
          completedJobs: scanMetrics.totalScanned || 0,
          failedJobs: scanMetrics.failedScans || 0,
          lastRun: scanMetrics.lastScanTime ? new Date(scanMetrics.lastScanTime).toISOString() : null,
          nextRun: null // Cron schedule not exposed here
        }
      ],
      queue: {
        active: queueStats.activeJobs || 0,
        queued: queueStats.queuedJobs || 0,
        capacity: queueStats.activeJobs / (queueStats.maxConcurrent || 3) * 100
      },
      retryMetrics: scanMetrics.retryMetrics || null,
      recentActivity: recentActivity
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

// API routes
app.use('/api/scans', scanRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/reports', reportRoutes);

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
  res.json({
    ...clientInfo,
    websocket_url: `ws://localhost:${PORT}/ws`,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = config.apiPort; // Now using JOBS_API_PORT from Doppler (default: 8080)

httpServer.listen(PORT, async () => {
  logger.info({ port: PORT }, 'API server started');
  console.log(`\n🚀 AlephAuto API Server & Dashboard running on port ${PORT}`);
  console.log(`   📊 Dashboard: http://localhost:${PORT}/`);
  console.log(`   ❤️  Health check: http://localhost:${PORT}/health`);
  console.log(`   🩺 Doppler health: http://localhost:${PORT}/api/health/doppler`);
  console.log(`   🔌 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   📡 API: http://localhost:${PORT}/api/\n`);

  // Start Doppler health monitoring (check every 15 minutes)
  await dopplerMonitor.startMonitoring(15);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');

  // Stop Doppler health monitoring
  dopplerMonitor.stopMonitoring();

  // Close WebSocket server
  wss.close(() => {
    logger.info('WebSocket server closed');

    // Close HTTP server
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });
});

export default app;
export { broadcaster, activityFeed };
