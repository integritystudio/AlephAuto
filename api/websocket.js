/**
 * WebSocket Server
 *
 * Real-time scan progress updates via WebSocket connections.
 */

// @ts-check
/** @typedef {import('http').Server} HttpServer */

import { WebSocketServer } from 'ws';
import { createComponentLogger, logError } from '../sidequest/utils/logger.ts';
import { WEBSOCKET } from '../sidequest/core/constants.ts';
import crypto from 'crypto';

const logger = createComponentLogger('WebSocketServer');

/**
 * Create WebSocket server
 * @param {HttpServer} httpServer - HTTP server instance
 * @returns {WebSocketServer} - WebSocket server
 */
export function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  const clients = new Map(); // clientId -> { ws, subscriptions }

  wss.on('connection', (ws, req) => {
    const clientId = generateClientId();

    clients.set(clientId, {
      ws,
      subscriptions: new Set(),
      connectedAt: new Date()
    });

    logger.info({
      clientId,
      ip: req.socket.remoteAddress,
      totalClients: clients.size
    }, 'WebSocket client connected');

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      client_id: clientId,
      message: 'Connected to Duplicate Detection WebSocket server',
      timestamp: new Date().toISOString()
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(clientId, message, clients);
      } catch (error) {
        logError(logger, error, 'Failed to parse client message', { clientId });
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
          timestamp: new Date().toISOString()
        }));
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      clients.delete(clientId);
      logger.info({
        clientId,
        totalClients: clients.size
      }, 'WebSocket client disconnected');
    });

    // Handle errors
    ws.on('error', (error) => {
      logError(logger, error, 'WebSocket error', { clientId });
    });

    // Set up heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeat);
      }
    }, WEBSOCKET.HEARTBEAT_INTERVAL_MS);

    ws.on('pong', () => {
      logger.debug({ clientId }, 'Heartbeat received');
    });
  });

  wss.on('error', (error) => {
    logError(logger, error, 'WebSocket server error');
  });

  // Broadcast function
  wss.broadcast = (message, filter = null) => {
    const data = JSON.stringify(message);
    let sentCount = 0;

    clients.forEach((client, clientId) => {
      // Apply filter if provided
      if (filter && !filter(client, clientId)) {
        return;
      }

      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(data);
        sentCount++;
      }
    });

    logger.debug({
      messageType: message.type,
      sentCount,
      totalClients: clients.size
    }, 'Broadcast message sent');
  };

  // Targeted send function
  wss.sendToClient = (clientId, message) => {
    const client = clients.get(clientId);

    if (!client) {
      logger.warn({ clientId }, 'Client not found for targeted send');
      return false;
    }

    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(JSON.stringify(message));
      return true;
    }

    return false;
  };

  // Get client info
  wss.getClientInfo = () => {
    return {
      total_clients: clients.size,
      clients: Array.from(clients.entries()).map(([id, client]) => ({
        client_id: id,
        connected_at: client.connectedAt,
        subscriptions: Array.from(client.subscriptions)
      }))
    };
  };

  logger.info('WebSocket server initialized');

  return wss;
}

/**
 * Generate unique client ID
 * @returns {string} - Client ID
 */
function generateClientId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Handle client message
 * @param {string} clientId - Client ID
 * @param {Object} message - Message from client
 * @param {Map} clients - Clients map
 */
function handleClientMessage(clientId, message, clients) {
  const client = clients.get(clientId);

  if (!client) {
    return;
  }

  logger.debug({ clientId, messageType: message.type }, 'Received client message');

  switch (message.type) {
    case 'subscribe':
      handleSubscribe(clientId, message, client);
      break;

    case 'unsubscribe':
      handleUnsubscribe(clientId, message, client);
      break;

    case 'ping':
      client.ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      break;

    case 'get_subscriptions':
      client.ws.send(JSON.stringify({
        type: 'subscriptions',
        subscriptions: Array.from(client.subscriptions),
        timestamp: new Date().toISOString()
      }));
      break;

    default:
      logger.warn({ clientId, messageType: message.type }, 'Unknown message type');
      client.ws.send(JSON.stringify({
        type: 'error',
        error: `Unknown message type: ${message.type}`,
        timestamp: new Date().toISOString()
      }));
  }
}

/**
 * Handle subscribe message
 */
function handleSubscribe(clientId, message, client) {
  const { channels = [] } = message;

  channels.forEach(channel => {
    client.subscriptions.add(channel);
  });

  logger.info({
    clientId,
    channels,
    totalSubscriptions: client.subscriptions.size
  }, 'Client subscribed to channels');

  client.ws.send(JSON.stringify({
    type: 'subscribed',
    channels,
    total_subscriptions: client.subscriptions.size,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Handle unsubscribe message
 */
function handleUnsubscribe(clientId, message, client) {
  const { channels = [] } = message;

  channels.forEach(channel => {
    client.subscriptions.delete(channel);
  });

  logger.info({
    clientId,
    channels,
    totalSubscriptions: client.subscriptions.size
  }, 'Client unsubscribed from channels');

  client.ws.send(JSON.stringify({
    type: 'unsubscribed',
    channels,
    total_subscriptions: client.subscriptions.size,
    timestamp: new Date().toISOString()
  }));
}
