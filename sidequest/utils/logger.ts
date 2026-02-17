import type { Logger } from 'pino';
import { createLogger as createBaseLogger, createChildLogger as createBaseChildLogger, createComponentLogger as createBaseComponentLogger } from '@shared/logging';
import { config } from '../core/config.ts';

/**
 * Main logger instance configured for this application
 *
 * Logs are JSON-formatted for easy parsing and analysis.
 * Use pino-pretty in development for human-readable output.
 *
 * IMPORTANT: Logs are sent to stderr (not stdout) for MCP server compatibility.
 */
export const logger: Logger = createBaseLogger({
  level: config.logLevel,
  nodeEnv: config.nodeEnv,
});

/**
 * Create a child logger with additional context
 */
export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return createBaseChildLogger(logger, bindings);
}

/**
 * Create a logger for a specific component
 */
export function createComponentLogger(component: string): Logger {
  return createBaseComponentLogger(logger, component);
}

/**
 * Log operation start
 */
export function logStart(log: Logger, operation: string, context: Record<string, unknown> = {}): void {
  log.info(context, `Starting ${operation}`);
}

/**
 * Log operation completion with duration
 */
export function logComplete(log: Logger, operation: string, startTime: number, context: Record<string, unknown> = {}): void {
  log.info({ ...context, duration: Date.now() - startTime }, `${operation} completed`);
}

/**
 * Log error with standardized format
 */
export function logError(log: Logger, error: Error | unknown, message: string, context: Record<string, unknown> = {}): void {
  log.error({ err: error, ...context }, message);
}

/**
 * Log warning with optional error
 */
export function logWarn(log: Logger, error: Error | null, message: string, context: Record<string, unknown> = {}): void {
  if (error) {
    log.warn({ err: error, ...context }, message);
  } else {
    log.warn(context, message);
  }
}

/**
 * Log skip reason (debug level)
 */
export function logSkip(log: Logger, what: string, reason: string, context: Record<string, unknown> = {}): void {
  log.debug(context, `Skipping ${what}: ${reason}`);
}

/**
 * Log pipeline stage transition
 */
export function logStage(log: Logger, stage: string, context: Record<string, unknown> = {}): void {
  log.info(context, `Stage: ${stage}`);
}

/**
 * Log metrics/stats for an operation
 */
export function logMetrics(log: Logger, operation: string, metrics: Record<string, unknown> = {}): void {
  log.info({ metrics }, `${operation} metrics`);
}

/**
 * Log retry attempt
 */
export function logRetry(log: Logger, operation: string, attempt: number, maxAttempts: number, context: Record<string, unknown> = {}): void {
  log.warn(context, `Retry ${attempt}/${maxAttempts}: ${operation}`);
}

export default logger;
