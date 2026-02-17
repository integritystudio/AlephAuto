import pino from 'pino';
import type { Logger } from 'pino';

export interface LoggerConfig {
  /** Log level (trace, debug, info, warn, error, fatal). Defaults to 'info'. */
  level?: string;
  /** Environment (production, development, test). Defaults to 'development'. */
  nodeEnv?: string;
}

/**
 * Create a structured logger instance using Pino
 *
 * Logs are JSON-formatted for easy parsing and analysis.
 * Uses pino-pretty in development for human-readable output.
 *
 * IMPORTANT: Logs are sent to stderr (not stdout) for MCP server compatibility.
 */
export function createLogger(config: LoggerConfig = {}): Logger {
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
 */
export function createChildLogger(logger: Logger, bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

/**
 * Create a logger for a specific component
 */
export function createComponentLogger(logger: Logger, component: string): Logger {
  return logger.child({ component });
}
