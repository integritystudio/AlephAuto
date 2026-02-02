/**
 * Type definitions for @shared/logging
 */

import type { Logger } from 'pino';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Log level (trace, debug, info, warn, error, fatal). Defaults to 'info'. */
  level?: string;
  /** Environment (production, development, test). Defaults to 'development'. */
  nodeEnv?: string;
}

/**
 * Create a structured logger instance using Pino
 *
 * @param config - Logger configuration
 * @returns Configured logger instance
 */
export function createLogger(config?: LoggerConfig): Logger;

/**
 * Create a child logger with additional context
 *
 * @param logger - Parent logger instance
 * @param bindings - Context to add to all logs from this child
 * @returns Child logger instance
 */
export function createChildLogger(logger: Logger, bindings: Record<string, unknown>): Logger;

/**
 * Create a logger for a specific component
 *
 * @param logger - Parent logger instance
 * @param component - Component name
 * @returns Component logger instance
 */
export function createComponentLogger(logger: Logger, component: string): Logger;
