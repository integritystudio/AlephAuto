import { createLogger as createBaseLogger, createChildLogger as createBaseChildLogger, createComponentLogger as createBaseComponentLogger } from '@shared/logging';
import { config } from '../core/config.js';

/**
 * Main logger instance configured for this application
 *
 * Logs are JSON-formatted for easy parsing and analysis.
 * Use pino-pretty in development for human-readable output.
 *
 * IMPORTANT: Logs are sent to stderr (not stdout) for MCP server compatibility.
 * MCP servers use stdout for JSON-RPC protocol communication, so logs must
 * go to stderr to avoid mixing with protocol messages.
 *
 * Usage:
 *   logger.info('Simple message');
 *   logger.info({ jobId: 'job-123', path: '/foo' }, 'Job started');
 *   logger.error({ err }, 'Operation failed');
 */
export const logger = createBaseLogger({
  level: config.logLevel,
  nodeEnv: config.nodeEnv,
});

/**
 * Create a child logger with additional context
 *
 * @param {Object} bindings - Context to add to all logs from this child
 * @returns {pino.Logger} Child logger instance
 *
 * @example
 * const jobLogger = createChildLogger({ jobId: 'job-123' });
 * jobLogger.info('Job started'); // Automatically includes jobId in log
 */
export function createChildLogger(bindings) {
  return createBaseChildLogger(logger, bindings);
}

/**
 * Create a logger for a specific component
 *
 * @param {string} component - Component name (e.g., 'RepomixWorker', 'DirectoryScanner')
 * @returns {pino.Logger} Component logger instance
 *
 * @example
 * const workerLogger = createComponentLogger('RepomixWorker');
 * workerLogger.info('Worker initialized');
 */
export function createComponentLogger(component) {
  return createBaseComponentLogger(logger, component);
}

/**
 * Log operation start
 * @param {pino.Logger} log - Logger instance
 * @param {string} operation - Operation name
 * @param {Object} context - Additional context
 */
export function logStart(log, operation, context = {}) {
  log.info(context, `Starting ${operation}`);
}

/**
 * Log operation completion with duration
 * @param {pino.Logger} log - Logger instance
 * @param {string} operation - Operation name
 * @param {number} startTime - Start timestamp from Date.now()
 * @param {Object} context - Additional context
 */
export function logComplete(log, operation, startTime, context = {}) {
  log.info({ ...context, duration: Date.now() - startTime }, `${operation} completed`);
}

/**
 * Log error with standardized format
 * @param {pino.Logger} log - Logger instance
 * @param {Error | unknown} error - Error object (accepts any error-like object)
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 */
export function logError(log, error, message, context = {}) {
  log.error({ err: error, ...context }, message);
}

/**
 * Log warning with optional error
 * @param {pino.Logger} log - Logger instance
 * @param {Error|null} error - Error object (or null if no error)
 * @param {string} message - Warning message
 * @param {Object} context - Additional context
 */
export function logWarn(log, error, message, context = {}) {
  if (error) {
    log.warn({ err: error, ...context }, message);
  } else {
    log.warn(context, message);
  }
}

/**
 * Log skip reason (debug level)
 * @param {pino.Logger} log - Logger instance
 * @param {string} what - What is being skipped
 * @param {string} reason - Why it's being skipped
 * @param {Object} context - Additional context
 */
export function logSkip(log, what, reason, context = {}) {
  log.debug(context, `Skipping ${what}: ${reason}`);
}

/**
 * Log pipeline stage transition
 * @param {pino.Logger} log - Logger instance
 * @param {string} stage - Stage name (e.g., 'extraction', 'similarity')
 * @param {Object} context - Additional context
 */
export function logStage(log, stage, context = {}) {
  log.info(context, `Stage: ${stage}`);
}

/**
 * Log metrics/stats for an operation
 * @param {pino.Logger} log - Logger instance
 * @param {string} operation - Operation name
 * @param {Object} metrics - Metrics object (counts, durations, etc.)
 */
export function logMetrics(log, operation, metrics = {}) {
  log.info({ metrics }, `${operation} metrics`);
}

/**
 * Log retry attempt
 * @param {pino.Logger} log - Logger instance
 * @param {string} operation - Operation being retried
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} maxAttempts - Maximum attempts allowed
 * @param {Object} context - Additional context (error, delay, etc.)
 */
export function logRetry(log, operation, attempt, maxAttempts, context = {}) {
  log.warn(context, `Retry ${attempt}/${maxAttempts}: ${operation}`);
}

export default logger;
