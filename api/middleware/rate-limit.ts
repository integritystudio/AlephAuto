/**
 * Rate Limiting Middleware
 *
 * Prevents API abuse by limiting request rates.
 */

import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createComponentLogger } from '#sidequest/utils/logger.ts';
import { RATE_LIMIT } from '#sidequest/core/constants.ts';
import { HttpStatus } from '../../shared/constants/http-status.ts';

const logger = createComponentLogger('RateLimiter');
const TOO_MANY_REQUESTS_ERROR = 'Too Many Requests';
const FIFTEEN_MINUTES_LABEL = RATE_LIMIT.STANDARD_RETRY_AFTER_LABEL;
const ONE_HOUR_LABEL = RATE_LIMIT.STRICT_RETRY_AFTER_LABEL;
const dashboardReadPaths = [
  '/api/status',
  '/api/pipelines',
  '/api/sidequest/pipeline-runners',
  '/api/reports'
] as const;

/**
 * Standard rate limiter: 500 requests per 15 minutes
 * Higher limit for dashboard UI that makes multiple parallel requests
 */
export const rateLimiter = rateLimit({
  windowMs: RATE_LIMIT.STANDARD_WINDOW_MS,
  max: RATE_LIMIT.STANDARD_MAX_REQUESTS, // Limit each IP to 500 requests per window (increased for dashboard)
  message: {
    error: TOO_MANY_REQUESTS_ERROR,
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: FIFTEEN_MINUTES_LABEL
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  // Skip rate limiting for dashboard read endpoints
  skip: (req: Request) => {
    return dashboardReadPaths.some(p => req.path.startsWith(p) && req.method === 'GET');
  },
  handler: (req: Request, res: Response) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
      limit: RATE_LIMIT.STANDARD_MAX_REQUESTS
    }, 'Rate limit exceeded');

    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      error: TOO_MANY_REQUESTS_ERROR,
      message: `Rate limit exceeded. Please try again in ${FIFTEEN_MINUTES_LABEL}.`,
      retryAfter: RATE_LIMIT.STANDARD_RETRY_AFTER_SECONDS,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Strict rate limiter for expensive operations: 10 requests per hour (production)
 * or 100 requests per hour (development/test)
 */
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const strictLimitMax = isDevelopment
  ? RATE_LIMIT.STRICT_MAX_REQUESTS_DEVELOPMENT
  : RATE_LIMIT.STRICT_MAX_REQUESTS_PRODUCTION;
const strictLimitWindow = RATE_LIMIT.STRICT_WINDOW_MS;
const bulkImportLimitMax = isDevelopment
  ? RATE_LIMIT.BULK_IMPORT_MAX_REQUESTS_DEVELOPMENT
  : RATE_LIMIT.BULK_IMPORT_MAX_REQUESTS_PRODUCTION;

export const strictRateLimiter = rateLimit({
  windowMs: strictLimitWindow,
  max: strictLimitMax,
  message: {
    error: TOO_MANY_REQUESTS_ERROR,
    message: 'Rate limit exceeded for scan operations. Please try again later.',
    retryAfter: ONE_HOUR_LABEL
  },
  handler: (req: Request, res: Response) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
      limit: strictLimitMax,
      mode: isDevelopment ? 'development' : 'production'
    }, 'Strict rate limit exceeded');

    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      error: TOO_MANY_REQUESTS_ERROR,
      message: `Rate limit exceeded for scan operations. Please try again in ${ONE_HOUR_LABEL}.${isDevelopment ? ` (Development mode: ${RATE_LIMIT.STRICT_MAX_REQUESTS_DEVELOPMENT}/hour)` : ''}`,
      retryAfter: RATE_LIMIT.STRICT_RETRY_AFTER_SECONDS,
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
  max: bulkImportLimitMax, // 5 in production, 50 in dev/test
  message: {
    error: TOO_MANY_REQUESTS_ERROR,
    message: 'Rate limit exceeded for bulk import operations. Please try again later.',
    retryAfter: ONE_HOUR_LABEL
  },
  handler: (req: Request, res: Response) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
      limit: bulkImportLimitMax,
      mode: isDevelopment ? 'development' : 'production'
    }, 'Bulk import rate limit exceeded');

    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      error: TOO_MANY_REQUESTS_ERROR,
      message: `Rate limit exceeded for bulk import operations. Please try again in ${ONE_HOUR_LABEL}.`,
      retryAfter: RATE_LIMIT.STRICT_RETRY_AFTER_SECONDS,
      timestamp: new Date().toISOString()
    });
  }
});
