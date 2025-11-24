import pino from 'pino';
import { config } from '../core/config.js';

/**
 * Create a structured logger instance using Pino
 *
 * Logs are JSON-formatted for easy parsing and analysis.
 * Use pino-pretty in development for human-readable output.
 *
 * Usage:
 *   logger.info('Simple message');
 *   logger.info({ jobId: 'job-123', path: '/foo' }, 'Job started');
 *   logger.error({ err }, 'Operation failed');
 */
export const logger = pino({
  level: config.logLevel,

  // Base fields included in every log
  base: {
    pid: process.pid,
    hostname: undefined, // Exclude hostname for cleaner logs
  },

  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,

  // Error serialization
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },

  // Pretty printing for development (disabled in production for performance)
  transport: config.nodeEnv !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      singleLine: false,
      messageFormat: '{levelLabel} - {msg}',
    }
  } : undefined,
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
  return logger.child(bindings);
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
  return logger.child({ component });
}

export default logger;
