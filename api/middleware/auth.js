/**
 * Authentication Middleware
 *
 * API key-based authentication for REST API endpoints.
 */

import { createComponentLogger } from '../../sidequest/utils/logger.js';
import { config } from '../../sidequest/core/config.js';
import crypto from 'crypto';

const logger = createComponentLogger('AuthMiddleware');

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/health',
  '/api/health/doppler', // Dashboard Doppler health indicator
  '/api/docs',
  '/api/status',  // Dashboard needs access to system status
  '/api/scans',    // Phase 4 testing (TODO: Re-enable auth after testing)
  '/api/pipelines', // Pipeline details panel testing (TODO: Re-enable auth after testing)
  '/api/sidequest/pipeline-runners', // Dashboard pipeline jobs API
  '/favicon.ico' // Static asset
];

/**
 * Validate API key
 * @param {string} apiKey - API key to validate
 * @returns {boolean} - True if valid
 */
function validateApiKey(apiKey) {
  if (!apiKey) {
    return false;
  }

  // Get configured API key from environment
  const validApiKey = config.apiKey || process.env.API_KEY;

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
export function authMiddleware(req, res, next) {
  // Skip authentication for public paths (prefix match)
  if (PUBLIC_PATHS.some(publicPath => req.path === publicPath || req.path.startsWith(publicPath + '/'))) {
    return next();
  }

  // Extract API key from header
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    logger.warn({ path: req.path, ip: req.ip }, 'API request without API key');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required. Provide via X-API-Key header or Authorization: Bearer token',
      timestamp: new Date().toISOString()
    });
  }

  // Validate API key
  if (!validateApiKey(apiKey)) {
    logger.warn({
      path: req.path,
      ip: req.ip,
      apiKeyPrefix: apiKey.substring(0, 8) + '...'
    }, 'Invalid API key');

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key',
      timestamp: new Date().toISOString()
    });
  }

  // API key valid - proceed
  logger.debug({ path: req.path }, 'API request authenticated');
  next();
}
