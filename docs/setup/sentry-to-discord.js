#!/usr/bin/env node

/**
 * Sentry to Discord Webhook Middleware
 *
 * This service receives Sentry webhooks and formats them as beautiful
 * Discord embeds before posting to Discord.
 *
 * Usage:
 *   node sentry-to-discord.js
 *   OR
 *   pm2 start sentry-to-discord.js --name sentry-discord-bridge
 */

import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_SENTRY_WEBHOOK;
const PORT = process.env.WEBHOOK_PORT || 3000;
const HOST = process.env.WEBHOOK_HOST || 'localhost';
const DISCORD_LIMITS = {
  TITLE_LENGTH: 256,
  DESCRIPTION_LENGTH: 4096,
  FIELD_COUNT: 25
};

// Color mapping for different Sentry levels
const COLORS = {
  fatal: 0xFF0000,    // Bright Red
  error: 0xFF4444,    // Light Red
  warning: 0xFFAA00,  // Orange
  info: 0x00AAFF,     // Blue
  debug: 0x888888     // Gray
};

// Emoji mapping for different event types
const EMOJIS = {
  fatal: '💀',
  error: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
  debug: '🔍'
};

/**
 * Format Sentry webhook payload as Discord embed
 */
function resolveEvent(sentryPayload) {
  return sentryPayload.event || sentryPayload.data?.event || sentryPayload;
}

function resolveIssue(sentryPayload) {
  return sentryPayload.issue || sentryPayload.data?.issue || {};
}

function resolveAction(sentryPayload) {
  return sentryPayload.action || 'created';
}

function resolveLevel(event) {
  return event.level || 'error';
}

function buildEmbedTitle(level, event, issue) {
  const emoji = EMOJIS[level] || '🔔';
  const title = event.title || event.message || issue.title || 'Sentry Alert';
  return `${emoji} ${title}`;
}

function buildEmbedDescription(event) {
  const exception = event.exception?.values?.[0];
  if (exception) {
    return `${exception.type}: ${exception.value}`;
  }
  return event.culprit || event.location || '';
}

function buildEmbedFields(sentryPayload, event, issue, level) {
  const fields = [
    {
      name: '📊 Level',
      value: level.toUpperCase(),
      inline: true
    },
    {
      name: '🌍 Environment',
      value: event.environment || event.tags?.environment || 'production',
      inline: true
    }
  ];

  if (event.tags?.component) {
    fields.push({
      name: '🏷️ Component',
      value: event.tags.component,
      inline: true
    });
  }

  const location = event.location || event.culprit;
  if (location) {
    fields.push({
      name: '📍 Location',
      value: location,
      inline: true
    });
  }

  const sentryUrl = sentryPayload.url || issue.permalink || issue.url;
  if (sentryUrl) {
    fields.push({
      name: '🔗 View in Sentry',
      value: `[Open Issue](${sentryUrl})`,
      inline: false
    });
  }

  if (issue.count) {
    fields.push({
      name: '📈 Event Count',
      value: issue.count.toString(),
      inline: true
    });
  }

  return fields.slice(0, DISCORD_LIMITS.FIELD_COUNT);
}

export function formatSentryToDiscord(sentryPayload) {
  const event = resolveEvent(sentryPayload);
  const issue = resolveIssue(sentryPayload);
  const action = resolveAction(sentryPayload);
  const level = resolveLevel(event);
  const title = buildEmbedTitle(level, event, issue);
  const description = buildEmbedDescription(event);
  const color = COLORS[level] || COLORS.error;
  const fields = buildEmbedFields(sentryPayload, event, issue, level);

  return {
    username: 'Sentry Alerts',
    avatar_url: 'https://sentry-brand.storage.googleapis.com/sentry-logo-black.png',
    embeds: [{
      title: title.substring(0, DISCORD_LIMITS.TITLE_LENGTH),
      description: description.substring(0, DISCORD_LIMITS.DESCRIPTION_LENGTH),
      color: color,
      fields: fields,
      timestamp: event.timestamp || new Date().toISOString(),
      footer: {
        text: `Sentry Alert • ${action}`
      }
    }]
  };
}

/**
 * Send formatted message to Discord
 */
export function sendToDiscord(message) {
  return new Promise((resolve, reject) => {
    const webhookUrl = process.env.DISCORD_SENTRY_WEBHOOK || DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      reject(new Error('DISCORD_SENTRY_WEBHOOK not configured'));
      return;
    }

    const url = new URL(webhookUrl);
    const data = JSON.stringify(message);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const transport = url.protocol === 'http:' ? http : https;
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, statusCode: res.statusCode });
        } else {
          reject(new Error(`Discord API error: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Respond with JSON body.
 */
export function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * Respond with plain text body.
 */
export function writeText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
  res.end(text);
}

/**
 * Read incoming request body.
 */
export function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Handle health check endpoint.
 */
export function handleHealthCheck(req, res) {
  if (req.method !== 'GET' || req.url !== '/health') {
    return false;
  }

  writeJson(res, 200, {
    status: 'healthy',
    service: 'sentry-discord-bridge',
    timestamp: new Date().toISOString()
  });

  return true;
}

/**
 * Determine if request is for sentry webhook endpoint.
 */
export function isSentryWebhookRequest(req) {
  return req.method === 'POST' && req.url === '/sentry-webhook';
}

/**
 * Log high-level webhook metadata.
 */
export function logSentryWebhook(sentryPayload) {
  console.log(`[${new Date().toISOString()}] Received Sentry webhook`);
  console.log(`  Action: ${sentryPayload.action || 'N/A'}`);
  console.log(`  Event: ${sentryPayload.event?.title || sentryPayload.data?.event?.title || 'N/A'}`);
}

/**
 * Handle webhook delivery and forwarding.
 */
export async function handleSentryWebhook(req, res, dispatchToDiscord = sendToDiscord) {
  try {
    const body = await collectRequestBody(req);
    const sentryPayload = JSON.parse(body);
    logSentryWebhook(sentryPayload);

    const discordMessage = formatSentryToDiscord(sentryPayload);
    await dispatchToDiscord(discordMessage);

    writeJson(res, 200, { success: true });
    console.log('  ✅ Forwarded to Discord');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('  ❌ Error processing webhook:', message);
    writeJson(res, 500, { error: message });
  }
}

/**
 * Route incoming HTTP request.
 */
export async function routeRequest(req, res, dispatchToDiscord = sendToDiscord) {
  if (handleHealthCheck(req, res)) {
    return;
  }

  if (isSentryWebhookRequest(req)) {
    await handleSentryWebhook(req, res, dispatchToDiscord);
    return;
  }

  writeText(res, 404, 'Not found');
}

/**
 * Create HTTP server to receive Sentry webhooks.
 */
export function createWebhookServer(options = {}) {
  const { dispatchToDiscord = sendToDiscord } = options;

  return http.createServer((req, res) => {
    routeRequest(req, res, dispatchToDiscord).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('  ❌ Unexpected request handler error:', message);
      if (!res.headersSent) {
        writeJson(res, 500, { error: 'Internal server error' });
      }
    });
  });
}

function setupSignalHandlers(server) {
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

export function startServer() {
  const server = createWebhookServer();
  const webhookConfigured = Boolean(process.env.DISCORD_SENTRY_WEBHOOK || DISCORD_WEBHOOK_URL);

  server.listen(PORT, HOST, () => {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║        Sentry → Discord Webhook Bridge Started! 🎣            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`📡 Listening on: http://${HOST}:${PORT}`);
    console.log(`🎯 Webhook endpoint: http://${HOST}:${PORT}/sentry-webhook`);
    console.log(`❤️  Health check: http://${HOST}:${PORT}/health\n`);
    console.log(`🔗 Discord webhook: ${webhookConfigured ? '✅ Configured' : '❌ Not set'}\n`);
    console.log('Ready to receive Sentry webhooks!\n');
  });

  setupSignalHandlers(server);
  return server;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  startServer();
}
