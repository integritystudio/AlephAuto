/**
 * Rate Limiting Middleware
 *
 * Prevents API abuse by limiting request rates.
 */

import rateLimit from 'express-rate-limit';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import { RATE_LIMIT } from '../../sidequest/core/constants.ts';

const logger = createComponentLogger('RateLimiter');

/**
 * Standard rate limiter: 500 requests per 15 minutes
 * Higher limit for dashboard UI that makes multiple parallel requests
 */
export const rateLimiter = rateLimit({
  windowMs: RATE_LIMIT.STANDARD_WINDOW_MS,
  max: 500, // Limit each IP to 500 requests per window (increased for dashboard)
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  // Skip rate limiting for dashboard read endpoints
  skip: (req) => {
    const dashboardReadPaths = [
      '/api/status',
      '/api/pipelines',
      '/api/sidequest/pipeline-runners',
      '/api/reports'
    ];
    return dashboardReadPaths.some(path => req.path.startsWith(path) && req.method === 'GET');
  },
  handler: (req, res) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
      limit: 500
    }, 'Rate limit exceeded');

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again in 15 minutes.',
      retryAfter: 900, // seconds
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Strict rate limiter for expensive operations: 10 requests per hour (production)
 * or 100 requests per hour (development/test)
 */
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const strictLimitMax = isDevelopment ? 100 : 10;
const strictLimitWindow = RATE_LIMIT.STRICT_WINDOW_MS;

export const strictRateLimiter = rateLimit({
  windowMs: strictLimitWindow,
  max: strictLimitMax,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded for scan operations. Please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req, res) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
      limit: strictLimitMax,
      mode: isDevelopment ? 'development' : 'production'
    }, 'Strict rate limit exceeded');

    res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded for scan operations. Please try again in 1 hour.${isDevelopment ? ' (Development mode: 100/hour)' : ''}`,
      retryAfter: 3600,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Bulk import rate limiter: 5 requests per hour
 * Prevents DoS via expensive bulk database operations
 */
export const bulkImportRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.STRICT_WINDOW_MS,
  max: isDevelopment ? 50 : 5, // 5 in production, 50 in dev/test
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded for bulk import operations. Please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req, res) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
      limit: isDevelopment ? 50 : 5,
      mode: isDevelopment ? 'development' : 'production'
    }, 'Bulk import rate limit exceeded');

    res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded for bulk import operations. Please try again in 1 hour.`,
      retryAfter: 3600,
      timestamp: new Date().toISOString()
    });
  }
});
