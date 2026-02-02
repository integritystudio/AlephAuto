import pino from 'pino';

/**
 * @typedef {Object} LoggerConfig
 * @property {string} [level='info'] - Log level (trace, debug, info, warn, error, fatal)
 * @property {string} [nodeEnv='development'] - Environment (production, development, test)
 */

/**
 * Create a structured logger instance using Pino
 *
 * Logs are JSON-formatted for easy parsing and analysis.
 * Uses pino-pretty in development for human-readable output.
 *
 * IMPORTANT: Logs are sent to stderr (not stdout) for MCP server compatibility.
 * MCP servers use stdout for JSON-RPC protocol communication, so logs must
 * go to stderr to avoid mixing with protocol messages.
 *
 * @param {LoggerConfig} config - Logger configuration
 * @returns {pino.Logger} Configured logger instance
 *
 * @example
 * const logger = createLogger({ level: 'debug', nodeEnv: 'development' });
 * logger.info('Simple message');
 * logger.info({ jobId: 'job-123', path: '/foo' }, 'Job started');
 * logger.error({ err }, 'Operation failed');
 */
export function createLogger(config = {}) {
  const level = config.level ?? 'info';
  const nodeEnv = config.nodeEnv ?? 'development';
  const isProduction = nodeEnv === 'production';

  return pino({
    level,

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
    // Note: transport with destination sends to stderr
    transport: !isProduction ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
        messageFormat: '{levelLabel} - {msg}',
        destination: 2, // stderr (fd 2) for MCP compatibility
      }
    } : undefined,
  }, isProduction ? pino.destination(2) : undefined);
}

/**
 * Create a child logger with additional context
 *
 * @param {pino.Logger} logger - Parent logger instance
 * @param {Object} bindings - Context to add to all logs from this child
 * @returns {pino.Logger} Child logger instance
 *
 * @example
 * const jobLogger = createChildLogger(logger, { jobId: 'job-123' });
 * jobLogger.info('Job started'); // Automatically includes jobId in log
 */
export function createChildLogger(logger, bindings) {
  return logger.child(bindings);
}

/**
 * Create a logger for a specific component
 *
 * @param {pino.Logger} logger - Parent logger instance
 * @param {string} component - Component name (e.g., 'RepomixWorker', 'DirectoryScanner')
 * @returns {pino.Logger} Component logger instance
 *
 * @example
 * const workerLogger = createComponentLogger(logger, 'RepomixWorker');
 * workerLogger.info('Worker initialized');
 */
export function createComponentLogger(logger, component) {
  return logger.child({ component });
}
