/**
 * Port Manager Utility
 *
 * Provides port availability checking, dynamic port allocation, and graceful shutdown handling.
 * Prevents EADDRINUSE errors by detecting occupied ports and trying fallback ports.
 */

import type { Server as HttpServer } from 'http';
import net from 'net';
import { createComponentLogger } from '#sidequest/utils/logger.ts';
import { PORT } from '#sidequest/core/constants.ts';

const logger = createComponentLogger('PortManager');

interface PortFallbackOptions {
  preferredPort: number;
  maxPort?: number;
  host?: string;
  killExisting?: boolean;
}

interface GracefulShutdownOptions {
  onShutdown?: (signal: string) => void | Promise<void>;
  timeout?: number;
}

/**
 * Check if a port is available for binding
 */
/**
 * Check if port available.
 *
 * @param {number} port - The port number
 * @param {string} [host='0.0.0.0'] - The host address
 *
 * @returns {Promise<boolean>} True if port available, False otherwise
 * @async
 */
export async function isPortAvailable(port: number, host: string = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    // Enable SO_REUSEADDR to allow quick restarts
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.debug({ port, host }, 'Port is already in use');
        resolve(false);
      } else {
        logger.warn({ port, host, error: err.message }, 'Error checking port availability');
        resolve(false);
      }
    });

    server.on('listening', () => {
      server.close(() => {
        logger.debug({ port, host }, 'Port is available');
        resolve(true);
      });
    });

    server.listen(port, host);
  });
}

/**
 * Find an available port within a range
 */
/**
 * Find the available port.
 *
 * @param {number} startPort - The startPort
 * @param {number} endPort - The endPort
 * @param {string} [host='0.0.0.0'] - The host address
 *
 * @returns {Promise<number | null>} The available port
 * @async
 */
export async function findAvailablePort(startPort: number, endPort: number, host: string = '0.0.0.0'): Promise<number | null> {
  logger.info({ startPort, endPort, host }, 'Searching for available port');

  for (let port = startPort; port <= endPort; port++) {
    const available = await isPortAvailable(port, host);
    if (available) {
      logger.info({ port, host }, 'Found available port');
      return port;
    }
  }

  logger.error({ startPort, endPort, host }, 'No available ports found in range');
  return null;
}

/**
 * Kill processes using a specific port (macOS/Linux)
 */
/**
 * Kill process on port.
 *
 * @param {number} port - The port number
 *
 * @returns {Promise<boolean>} True if successful, False otherwise
 * @async
 */
export async function killProcessOnPort(port: number): Promise<boolean> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Find process using the port
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pids = stdout.trim().split('\n').filter(Boolean);

    if (pids.length === 0) {
      logger.info({ port }, 'No processes found on port');
      return true;
    }

    logger.info({ port, pids }, 'Killing processes on port');

    // Kill all processes
    for (const pid of pids) {
      await execAsync(`kill -9 ${pid}`);
      logger.info({ port, pid }, 'Killed process');
    }

    // Wait for port to be released
    await new Promise(resolve => setTimeout(resolve, PORT.RELEASE_DELAY_MS));

    return true;
  } catch (error) {
    logger.error({ port, error: (error as Error).message }, 'Failed to kill process on port');
    return false;
  }
}

/**
 * Setup graceful shutdown handlers for a server
 */
/**
 * Set up graceful shutdown.
 *
 * @param {HttpServer} httpServer - The httpServer
 * @param {GracefulShutdownOptions} [options={}] - Options dictionary
 */
export function setupGracefulShutdown(httpServer: HttpServer, options: GracefulShutdownOptions = {}): void {
  const {
    onShutdown = () => {},
    timeout = PORT.DEFAULT_SHUTDOWN_TIMEOUT_MS
  } = options;

  let isShuttingDown = false;

  /**
   * Shutdown.
   *
   * @param {string} signal - The signal
   * @async
   */
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress');
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated');

    // Set shutdown timeout
    const shutdownTimeout = setTimeout(() => {
      logger.error({ timeout }, 'Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, timeout);

    try {
      // Run custom shutdown handler
      await onShutdown(signal);

      // Close HTTP server
      httpServer.close((err) => {
        clearTimeout(shutdownTimeout);

        if (err) {
          logger.error({ error: err.message }, 'Error during HTTP server shutdown');
          process.exit(1);
        } else {
          logger.info('HTTP server closed successfully');
          process.exit(0);
        }
      });

      // Stop accepting new connections immediately
      httpServer.closeAllConnections?.();
    } catch (error) {
      clearTimeout(shutdownTimeout);
      logger.error({ error: (error as Error).message }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });

  logger.info('Graceful shutdown handlers registered');
}

/**
 * Setup server with automatic port fallback
 */
/**
 * Set up server with port fallback.
 *
 * @param {HttpServer} httpServer - The httpServer
 * @param {PortFallbackOptions} options - Options dictionary
 *
 * @returns {Promise<number>} The Promise<number>
 * @async
 */
export async function setupServerWithPortFallback(httpServer: HttpServer, options: PortFallbackOptions): Promise<number> {
  const {
    preferredPort,
    maxPort = preferredPort + 10,
    host = '0.0.0.0',
    killExisting = false
  } = options;

  if (!preferredPort) {
    throw new Error('preferredPort is required');
  }

  logger.info({ preferredPort, maxPort, host, killExisting }, 'Setting up server with port fallback');

  // Check if preferred port is available
  const preferredAvailable = await isPortAvailable(preferredPort, host);

  if (preferredAvailable) {
    return new Promise((resolve, reject) => {
      httpServer.listen(preferredPort, host, () => {
        logger.info({ port: preferredPort, host }, 'Server listening on preferred port');
        resolve(preferredPort);
      });

      httpServer.on('error', reject);
    });
  }

  // Preferred port not available
  logger.warn({ port: preferredPort }, 'Preferred port is not available');

  if (killExisting) {
    logger.info({ port: preferredPort }, 'Attempting to kill existing process');
    const killed = await killProcessOnPort(preferredPort);

    if (killed) {
      const nowAvailable = await isPortAvailable(preferredPort, host);
      if (nowAvailable) {
        return new Promise((resolve, reject) => {
          httpServer.listen(preferredPort, host, () => {
            logger.info({ port: preferredPort, host }, 'Server listening on preferred port after cleanup');
            resolve(preferredPort);
          });

          httpServer.on('error', reject);
        });
      }
    }
  }

  // Find fallback port
  const fallbackPort = await findAvailablePort(preferredPort + 1, maxPort, host);

  if (!fallbackPort) {
    throw new Error(`No available ports found between ${preferredPort} and ${maxPort}`);
  }

  logger.warn({ preferredPort, fallbackPort }, 'Using fallback port');

  return new Promise((resolve, reject) => {
    httpServer.listen(fallbackPort, host, () => {
      logger.info({ port: fallbackPort, host }, 'Server listening on fallback port');
      resolve(fallbackPort);
    });

    httpServer.on('error', reject);
  });
}
