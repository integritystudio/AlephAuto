/**
 * Authentication Middleware
 *
 * API key-based authentication for REST API endpoints.
 */

import type { Request, Response, NextFunction } from 'express';
import { createComponentLogger } from '#sidequest/utils/logger.ts';
import { config } from '#sidequest/core/config.ts';
import crypto from 'crypto';

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
 * Validate API key
 */
/**
 * Validate api key.
 *
 * @param {string} apiKey - The apiKey
 *
 * @returns {boolean} True if successful, False otherwise
 */
function validateApiKey(apiKey: string): boolean {
  if (!apiKey) {
    return false;
  }

  // Get configured API key from environment
  const validApiKey = (config as Record<string, unknown>).apiKey as string | undefined || process.env.API_KEY;

  if (!validApiKey) {
    logger.warn('No API key configured, authentication disabled');
    return true; // Allow if no key configured (development mode)
  }

  // Constant-time comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(validApiKey);
  const actualBuffer = Buffer.from(apiKey);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Authentication middleware
 */
/**
 * Auth middleware.
 *
 * @param {Request} req - The request
 * @param {Response} res - The response
 * @param {NextFunction} next - The next
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip authentication for public paths (prefix match)
  if (PUBLIC_PATHS.some(publicPath => req.path === publicPath || req.path.startsWith(publicPath + '/'))) {
    next();
    return;
  }

  // Extract API key from header
  const apiKey = (req.headers['x-api-key'] as string | undefined) || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    logger.warn({ path: req.path, ip: req.ip }, 'API request without API key');
    res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required. Provide via X-API-Key header or Authorization: Bearer token',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Validate API key
  if (!validateApiKey(apiKey)) {
    logger.warn({
      path: req.path,
      ip: req.ip,
      apiKeyPrefix: apiKey.substring(0, 8) + '...'
    }, 'Invalid API key');

    res.status(403).json({
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
