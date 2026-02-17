/**
 * Preload script for PM2 - runs before server.js
 * Sets EventEmitter max listeners to prevent memory leak warnings
 */

// Increase max listeners before any other code runs
process.setMaxListeners(20);

console.log('[Preload] EventEmitter max listeners set to 20');
