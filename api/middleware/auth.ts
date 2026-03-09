/**
 * Authentication Middleware
 *
 * API key-based authentication for REST API endpoints.
 */

import type { Request, Response, NextFunction } from 'express';
import { createComponentLogger } from '#sidequest/utils/logger.ts';
import { config } from '#sidequest/core/config.ts';
import crypto from 'crypto';
import { HttpStatus } from '../../shared/constants/http-status.ts';

const logger = createComponentLogger('AuthMiddleware');

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/health',
  '/api/health/doppler', // Dashboard Doppler health indicator
  '/api/docs',
  '/api/status',  // Dashboard needs access to system status
  '/api/pipeline-data-flow', // Dashboard documentation tab
  '/api/scans',    // Dashboard scan operations and statistics
  '/api/pipelines', // Dashboard pipeline details panel
  '/api/sidequest/pipeline-runners', // Dashboard pipeline jobs API
  '/api/reports',  // Dashboard needs access to scan reports
  '/api/jobs',     // Dashboard job queue display
  '/favicon.ico' // Static asset
];

/**
 * Returns true only for explicit development environments.
 */
function isDevelopmentEnvironment(): boolean {
  return config.nodeEnv.toLowerCase() === 'development';
}

/**
 * Returns the configured API key when present.
 */
function getConfiguredApiKey(): string | null {
  return config.apiKey;
}

/**
 * Validates an API key using constant-time comparison against configured key.
 *
 * @param apiKey API key from request headers.
 * @param configuredApiKey API key from configuration.
 * @returns `true` when the key is valid.
 */
function validateApiKey(apiKey: string, configuredApiKey: string): boolean {
  if (!apiKey) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks including length oracle
  const expectedBuffer = Buffer.from(configuredApiKey);
  const actualBuffer = Buffer.from(apiKey);
  const maxLen = Math.max(expectedBuffer.length, actualBuffer.length);
  const paddedExpected = Buffer.alloc(maxLen, 0);
  const paddedActual = Buffer.alloc(maxLen, 0);
  expectedBuffer.copy(paddedExpected);
  actualBuffer.copy(paddedActual);
  const equal = crypto.timingSafeEqual(paddedExpected, paddedActual);
  const sameLength = expectedBuffer.length === actualBuffer.length;
  return (equal && sameLength);
}

/**
 * Enforces API key authentication for protected routes.
 *
 * @param req Express request.
 * @param res Express response.
 * @param next Express next callback.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip authentication for public paths (prefix match)
  if (PUBLIC_PATHS.some(publicPath => req.path === publicPath || req.path.startsWith(publicPath + '/'))) {
    next();
    return;
  }

  const configuredApiKey = getConfiguredApiKey();
  if (!configuredApiKey) {
    if (isDevelopmentEnvironment()) {
      logger.warn('No API key configured; allowing protected API access in development mode');
      next();
      return;
    }

    logger.error({
      path: req.path,
      nodeEnv: config.nodeEnv
    }, 'API_KEY is not configured; denying protected API request');
    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      error: 'Service Unavailable',
      message: 'API authentication is not configured',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Extract API key from header
  const apiKey = (req.headers['x-api-key'] as string | undefined) || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    logger.warn({ path: req.path, ip: req.ip }, 'API request without API key');
    res.status(HttpStatus.UNAUTHORIZED).json({
      error: 'Unauthorized',
      message: 'API key required. Provide via X-API-Key header or Authorization: Bearer token',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Validate API key
  if (!validateApiKey(apiKey, configuredApiKey)) {
    logger.warn({
      path: req.path,
      ip: req.ip,
      apiKeyPrefix: apiKey.substring(0, 8) + '...'
    }, 'Invalid API key');

    res.status(HttpStatus.FORBIDDEN).json({
      error: 'Forbidden',
      message: 'Invalid API key',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // API key valid - proceed
  logger.debug({ path: req.path }, 'API request authenticated');
  next();
}
