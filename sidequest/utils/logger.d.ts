/**
 * Type definitions for sidequest/logger.js
 */

import type { Logger } from 'pino';

/**
 * Main logger instance
 */
export const logger: Logger;

/**
 * Create a child logger with additional context
 */
export function createChildLogger(bindings: Record<string, unknown>): Logger;

/**
 * Create a logger for a specific component
 */
export function createComponentLogger(component: string): Logger;

/**
 * Log operation start
 */
export function logStart(log: Logger, operation: string, context?: Record<string, unknown>): void;

/**
 * Log operation completion with duration
 */
export function logComplete(log: Logger, operation: string, startTime: number, context?: Record<string, unknown>): void;

/**
 * Log error with standardized format
 */
export function logError(log: Logger, error: Error, message: string, context?: Record<string, unknown>): void;

/**
 * Log warning with optional error
 */
export function logWarn(log: Logger, error: Error | null, message: string, context?: Record<string, unknown>): void;

/**
 * Log skip reason (debug level)
 */
export function logSkip(log: Logger, what: string, reason: string, context?: Record<string, unknown>): void;

export default logger;
