/**
 * Preload script for PM2 - runs before server.js
 * Sets EventEmitter max listeners to prevent memory leak warnings
 */
import { PROCESS } from '../sidequest/core/constants.ts';

// Increase max listeners before any other code runs
process.setMaxListeners(PROCESS.MAX_LISTENERS);

process.stdout.write(`[Preload] EventEmitter max listeners set to ${PROCESS.MAX_LISTENERS}\n`);
