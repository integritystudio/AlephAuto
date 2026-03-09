/**
 * WebSocket Server
 *
 * Real-time scan progress updates via WebSocket connections.
 */

import type { Server as HttpServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { createComponentLogger, logError } from '../sidequest/utils/logger.ts';
import { WEBSOCKET } from '../sidequest/core/constants.ts';
import crypto from 'crypto';

const logger = createComponentLogger('WebSocketServer');

interface WsClient {
  ws: WebSocket;
  subscriptions: Set<string>;
  connectedAt: Date;
}

export interface WsClientInfo {
  client_id: string;
  connected_at: Date;
  subscriptions: string[];
}

export interface ExtendedWebSocketServer extends WebSocketServer {
  broadcast: (message: Record<string, unknown>, filter?: ((client: WsClient, clientId: string) => boolean) | null) => void;
  sendToClient: (clientId: string, message: Record<string, unknown>) => boolean;
  getClientInfo: () => { total_clients: number; clients: WsClientInfo[] };
}

/**
 * Create WebSocket server
 */
/**
 * Create the web socket server.
 *
 * @param {HttpServer} httpServer - The httpServer
 *
 * @returns {ExtendedWebSocketServer} The created web socket server
 */
export function createWebSocketServer(httpServer: HttpServer): ExtendedWebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  }) as ExtendedWebSocketServer;

  const clients = new Map<string, WsClient>();

  wss.on('connection', (ws: WebSocket, req) => {
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

    const clearHeartbeat = () => {
      clearInterval(heartbeat);
    };

    ws.on('pong', () => {
      logger.debug({ clientId }, 'Heartbeat received');
    });

    ws.on('close', clearHeartbeat);
    ws.on('error', clearHeartbeat);
  });

  wss.on('error', (error) => {
    logError(logger, error, 'WebSocket server error');
  });

  // Broadcast function
  wss.broadcast = (message: Record<string, unknown>, filter: ((client: WsClient, clientId: string) => boolean) | null = null) => {
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
  wss.sendToClient = (clientId: string, message: Record<string, unknown>): boolean => {
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
  wss.getClientInfo = (): { total_clients: number; clients: WsClientInfo[] } => {
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
 * Generates a unique client id.
 *
 * @returns {string} Generated client id.
 */
function generateClientId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Handles an incoming message for a connected client.
 *
 * @param {string} clientId - Client id.
 * @param {Record<string, unknown>} message - Parsed message payload.
 * @param {Map<string, WsClient>} clients - Connected clients map.
 */
function handleClientMessage(clientId: string, message: Record<string, unknown>, clients: Map<string, WsClient>): void {
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
 * Handles a subscribe message.
 *
 * @param {string} clientId - Client id.
 * @param {Record<string, unknown>} message - Parsed message payload.
 * @param {WsClient} client - Connected client metadata.
 */
const MAX_SUBSCRIPTIONS_PER_CLIENT = 50;
const MAX_CHANNEL_NAME_LENGTH = 128;
const VALID_CHANNEL_PATTERN = /^[a-zA-Z0-9_:.-]+$/;

function handleSubscribe(clientId: string, message: Record<string, unknown>, client: WsClient): void {
  const rawChannels = message.channels;
  if (!Array.isArray(rawChannels)) {
    logger.warn({ clientId }, 'Subscribe message has invalid channels field');
    return;
  }

  const channels = rawChannels.filter((ch): ch is string => {
    if (typeof ch !== 'string') return false;
    if (ch.length === 0 || ch.length > MAX_CHANNEL_NAME_LENGTH) return false;
    return VALID_CHANNEL_PATTERN.test(ch);
  });

  const available = MAX_SUBSCRIPTIONS_PER_CLIENT - client.subscriptions.size;
  const toAdd = channels.slice(0, available);

  toAdd.forEach((channel: string) => {
    client.subscriptions.add(channel);
  });

  logger.info({
    clientId,
    channels: toAdd,
    totalSubscriptions: client.subscriptions.size
  }, 'Client subscribed to channels');

  client.ws.send(JSON.stringify({
    type: 'subscribed',
    channels: toAdd,
    total_subscriptions: client.subscriptions.size,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Handles an unsubscribe message.
 *
 * @param {string} clientId - Client id.
 * @param {Record<string, unknown>} message - Parsed message payload.
 * @param {WsClient} client - Connected client metadata.
 */
function handleUnsubscribe(clientId: string, message: Record<string, unknown>, client: WsClient): void {
  const rawChannels = message.channels;
  if (!Array.isArray(rawChannels)) {
    logger.warn({ clientId }, 'Unsubscribe message has invalid channels field');
    return;
  }

  const channels = rawChannels.filter((ch): ch is string =>
    typeof ch === 'string' && ch.length > 0 && ch.length <= MAX_CHANNEL_NAME_LENGTH
  );

  channels.forEach((channel: string) => {
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
