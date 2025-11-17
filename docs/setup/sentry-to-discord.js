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

const https = require('https');
const http = require('http');
require('dotenv').config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_SENTRY_WEBHOOK;
const PORT = process.env.WEBHOOK_PORT || 3000;
const HOST = process.env.WEBHOOK_HOST || 'localhost';

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
function formatSentryToDiscord(sentryPayload) {
  const event = sentryPayload.event || sentryPayload.data?.event || sentryPayload;
  const action = sentryPayload.action || 'created';
  const issue = sentryPayload.issue || sentryPayload.data?.issue || {};

  const level = event.level || 'error';
  const emoji = EMOJIS[level] || '🔔';
  const color = COLORS[level] || COLORS.error;

  // Build title
  const title = `${emoji} ${event.title || event.message || issue.title || 'Sentry Alert'}`;

  // Build description
  let description = event.culprit || event.location || '';
  if (event.exception && event.exception.values && event.exception.values[0]) {
    const exc = event.exception.values[0];
    description = `${exc.type}: ${exc.value}`;
  }

  // Build fields
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

  // Add component if available
  if (event.tags?.component) {
    fields.push({
      name: '🏷️ Component',
      value: event.tags.component,
      inline: true
    });
  }

  // Add location if available
  if (event.location || event.culprit) {
    fields.push({
      name: '📍 Location',
      value: event.location || event.culprit,
      inline: true
    });
  }

  // Add link to Sentry
  const sentryUrl = sentryPayload.url || issue.permalink || issue.url;
  if (sentryUrl) {
    fields.push({
      name: '🔗 View in Sentry',
      value: `[Open Issue](${sentryUrl})`,
      inline: false
    });
  }

  // Add event count if this is an issue alert
  if (issue.count) {
    fields.push({
      name: '📈 Event Count',
      value: issue.count.toString(),
      inline: true
    });
  }

  return {
    username: 'Sentry Alerts',
    avatar_url: 'https://sentry-brand.storage.googleapis.com/sentry-logo-black.png',
    embeds: [{
      title: title.substring(0, 256), // Discord limit
      description: description.substring(0, 4096), // Discord limit
      color: color,
      fields: fields.slice(0, 25), // Discord limit: max 25 fields
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
function sendToDiscord(message) {
  return new Promise((resolve, reject) => {
    if (!DISCORD_WEBHOOK_URL) {
      reject(new Error('DISCORD_SENTRY_WEBHOOK not configured'));
      return;
    }

    const url = new URL(DISCORD_WEBHOOK_URL);
    const data = JSON.stringify(message);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
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
 * Create HTTP server to receive Sentry webhooks
 */
const server = http.createServer(async (req, res) => {
  // Health check endpoint
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'sentry-discord-bridge',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Sentry webhook endpoint
  if (req.method === 'POST' && req.url === '/sentry-webhook') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const sentryPayload = JSON.parse(body);

        console.log(`[${new Date().toISOString()}] Received Sentry webhook`);
        console.log(`  Action: ${sentryPayload.action || 'N/A'}`);
        console.log(`  Event: ${sentryPayload.event?.title || sentryPayload.data?.event?.title || 'N/A'}`);

        const discordMessage = formatSentryToDiscord(sentryPayload);
        await sendToDiscord(discordMessage);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));

        console.log(`  ✅ Forwarded to Discord`);
      } catch (error) {
        console.error(`  ❌ Error processing webhook:`, error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });

    return;
  }

  // 404 for all other routes
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// Start server
server.listen(PORT, HOST, () => {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Sentry → Discord Webhook Bridge Started! 🎣            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`📡 Listening on: http://${HOST}:${PORT}`);
  console.log(`🎯 Webhook endpoint: http://${HOST}:${PORT}/sentry-webhook`);
  console.log(`❤️  Health check: http://${HOST}:${PORT}/health\n`);
  console.log(`🔗 Discord webhook: ${DISCORD_WEBHOOK_URL ? '✅ Configured' : '❌ Not set'}\n`);
  console.log('Ready to receive Sentry webhooks!\n');
});

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
