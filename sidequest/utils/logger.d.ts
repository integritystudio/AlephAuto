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
export function createChildLogger(bindings: Record<string, any>): Logger;

/**
 * Create a logger for a specific component
 */
export function createComponentLogger(component: string): Logger;

export default logger;
