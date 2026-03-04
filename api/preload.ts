/**
 * Preload script for PM2 - runs before server.js
 * Sets EventEmitter max listeners to prevent memory leak warnings
 */

// Increase max listeners before any other code runs
process.setMaxListeners(20);

process.stdout.write('[Preload] EventEmitter max listeners set to 20\n');
