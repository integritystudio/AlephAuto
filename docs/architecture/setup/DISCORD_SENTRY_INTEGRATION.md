# Discord + Sentry Integration Guide

**Purpose**: Configure Discord to receive Sentry error alerts via webhooks
**Last Updated**: 2025-11-12

## Overview

This guide walks through setting up Discord webhooks to receive real-time Sentry error notifications in a Discord channel.

## Architecture

```
Sentry Error Event → Sentry Webhook → Discord Webhook URL → Discord Channel
```

**Benefits**:
- Real-time error notifications in Discord
- Team visibility and collaboration
- Rich formatting with embeds
- No additional cost (built into Sentry)

## Step 1: Create Discord Webhook

### Option A: In Discord Desktop/Web App

1. **Open Discord** and navigate to your server

2. **Select/Create Channel**:
   - Recommended: Create dedicated channel `#sentry-alerts`
   - Or use existing channel like `#dev-alerts`

3. **Access Channel Settings**:
   - Right-click on channel name
   - Select "Edit Channel"

4. **Create Webhook**:
   - Go to "Integrations" tab
   - Click "Create Webhook" or "View Webhooks"
   - Click "New Webhook"

5. **Configure Webhook**:
   - **Name**: `Sentry Alerts` (or your preferred name)
   - **Channel**: Select your alerts channel
   - **Avatar**: Optional - upload Sentry logo

6. **Copy Webhook URL**:
   - Click "Copy Webhook URL"
   - Format: `https://discord.com/api/webhooks/{webhook-id}/{webhook-token}`
   - **Keep this URL secret!**

7. **Save Settings**

### Option B: Via Discord Developer Portal

1. Visit: https://discord.com/developers/applications
2. Select your application
3. Navigate to "Bot" → "Webhooks"
4. Follow similar steps as Option A

## Step 2: Store Discord Webhook in Doppler

**Security Best Practice**: Never hardcode webhook URLs.

```bash
# Add Discord webhook to Doppler
doppler secrets set DISCORD_SENTRY_WEBHOOK="https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"

# Verify it's stored
doppler secrets get DISCORD_SENTRY_WEBHOOK --plain
```

## Step 3: Configure Sentry Integration

### Method 1: Sentry UI (Recommended for First Setup)

1. **Navigate to Integrations**:
   ```
   https://sentry.io/settings/integrity-studio/integrations/
   ```

2. **Add Discord Integration**:
   - Search for "Discord" or "Webhook"
   - Sentry doesn't have native Discord integration
   - We'll use **Custom Webhooks** instead

3. **Set Up Custom Webhook**:
   - Go to: https://sentry.io/settings/integrity-studio/integrations/webhook/
   - Click "Add to Project"
   - Select project: `node`
   - Enter webhook URL from Doppler
   - Click "Save"

### Method 2: Sentry API (Automated)

```bash
# Get credentials
export SENTRY_TOKEN=$(doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain)
export DISCORD_WEBHOOK=$(doppler secrets get DISCORD_SENTRY_WEBHOOK --plain)

# Create webhook integration via API
curl -X POST \
  "https://sentry.io/api/0/projects/integrity-studio/node/plugins/webhooks/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"urls\": [\"$DISCORD_WEBHOOK\"]
  }"
```

## Step 4: Update Alert Rules to Use Discord

We need to update our existing alert rules to include Discord notifications.

### Update via Sentry API

```bash
export SENTRY_TOKEN=$(doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain)

# Get list of existing alert rule IDs
curl -s "https://sentry.io/api/0/projects/integrity-studio/node/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | jq '.[].id'

# Update each alert rule to add Discord webhook action
# Example for High Error Rate alert (ID: 16444721)
curl -X PUT \
  "https://sentry.io/api/0/projects/integrity-studio/node/rules/16444721/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actions": [
      {
        "id": "sentry.mail.actions.NotifyEmailAction",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      },
      {
        "id": "sentry.rules.actions.notify_event_service.NotifyEventServiceAction",
        "service": "webhooks"
      }
    ]
  }'
```

## Step 5: Format Discord Messages

### Option A: Direct Sentry Webhook (Basic)

Sentry sends JSON payload directly to Discord webhook.

**Limitation**: Discord expects specific format, Sentry format may not render well.

### Option B: Middleware Webhook (Advanced - Recommended)

Create a middleware service that:
1. Receives Sentry webhook
2. Formats as Discord embed
3. Posts to Discord

**Create middleware script**: `../setup/sentry-to-discord.js`

```javascript
const https = require('https');
const http = require('http');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_SENTRY_WEBHOOK;
const PORT = process.env.WEBHOOK_PORT || 3000;

function formatSentryToDiscord(sentryPayload) {
  const event = sentryPayload.event || sentryPayload;
  const issue = sentryPayload.issue || {};

  return {
    embeds: [{
      title: `🚨 ${event.title || event.message || 'Sentry Error'}`,
      description: event.culprit || event.location || 'No description',
      color: getColorBySeverity(event.level),
      fields: [
        {
          name: 'Level',
          value: event.level || 'error',
          inline: true
        },
        {
          name: 'Environment',
          value: event.environment || 'production',
          inline: true
        },
        {
          name: 'Issue',
          value: `[View in Sentry](${sentryPayload.url || issue.url || 'N/A'})`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Sentry Alert'
      }
    }]
  };
}

function getColorBySeverity(level) {
  const colors = {
    fatal: 0xFF0000,    // Red
    error: 0xFF4444,    // Light Red
    warning: 0xFFAA00,  // Orange
    info: 0x00AAFF,     // Blue
    debug: 0x888888     // Gray
  };
  return colors[level] || colors.error;
}

function sendToDiscord(message) {
  return new Promise((resolve, reject) => {
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
          resolve({ success: true, body });
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

// Create HTTP server to receive Sentry webhooks
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/sentry-webhook') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const sentryPayload = JSON.parse(body);
        const discordMessage = formatSentryToDiscord(sentryPayload);

        await sendToDiscord(discordMessage);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));

        console.log('✅ Sentry event forwarded to Discord');
      } catch (error) {
        console.error('❌ Error processing webhook:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`🎣 Sentry → Discord webhook server listening on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/sentry-webhook`);
});
```

### Option C: Use Zapier/Make.com (No-Code Solution)

1. Create account on Zapier or Make.com
2. Set up workflow:
   - **Trigger**: Webhook (receives Sentry data)
   - **Action**: Discord → Send Message
3. Use formatted Discord embeds
4. Configure Sentry to send to Zapier webhook URL

## Step 6: Test Discord Integration

### Test Script

Create `test/test-discord-webhook.js`:

```javascript
const https = require('https');
require('dotenv').config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_SENTRY_WEBHOOK;

function sendDiscordMessage(embed) {
  return new Promise((resolve, reject) => {
    const url = new URL(DISCORD_WEBHOOK_URL);
    const data = JSON.stringify({
      username: 'Sentry Alerts',
      avatar_url: 'https://sentry-brand.storage.googleapis.com/sentry-logo-black.png',
      embeds: [embed]
    });

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
          console.log('✅ Message sent to Discord!');
          resolve({ success: true });
        } else {
          console.error('❌ Discord API error:', res.statusCode, body);
          reject(new Error(`Discord API error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function testDiscordIntegration() {
  console.log('🧪 Testing Discord Integration...\n');

  if (!DISCORD_WEBHOOK_URL) {
    console.error('❌ DISCORD_SENTRY_WEBHOOK not found in environment');
    process.exit(1);
  }

  console.log('✅ Discord webhook URL found\n');

  // Test 1: Simple message
  console.log('📤 Sending test message 1 (Info)...');
  await sendDiscordMessage({
    title: '🧪 Sentry + Discord Test - Info Message',
    description: 'This is a test info message from Sentry',
    color: 0x00AAFF, // Blue
    fields: [
      { name: 'Level', value: 'info', inline: true },
      { name: 'Environment', value: 'test', inline: true }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Sentry Alert Test' }
  });

  // Wait a bit between messages
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: Error message
  console.log('📤 Sending test message 2 (Error)...');
  await sendDiscordMessage({
    title: '🚨 Sentry + Discord Test - Error Message',
    description: 'This is a test error message from Sentry',
    color: 0xFF4444, // Red
    fields: [
      { name: 'Level', value: 'error', inline: true },
      { name: 'Environment', value: 'test', inline: true },
      { name: 'Error Type', value: 'TestError', inline: true }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Sentry Alert Test' }
  });

  console.log('\n✅ Discord integration test complete!');
  console.log('📱 Check your Discord channel for test messages');
}

testDiscordIntegration().catch(console.error);
```

### Run Test

```bash
# Ensure webhook URL is in environment
doppler run -- node test/test-discord-webhook.js
```

## Step 7: Production Deployment

### Option 1: Direct Webhook (Simple)

Configure Sentry to POST directly to Discord webhook URL.

**Pros**: Simple, no infrastructure
**Cons**: Basic formatting, limited customization

### Option 2: Middleware Service (Recommended)

Deploy middleware service to format messages beautifully.

**Using PM2**:

```bash
# Start middleware service
pm2 start ../setup/sentry-to-discord.js --name sentry-discord-bridge

# Save configuration
pm2 save

# Set up to start on boot
pm2 startup
```

**Update Sentry to use middleware**:

```bash
# Point Sentry webhook to your middleware
# Instead of Discord URL, use: http://your-server:3000/sentry-webhook
```

## Discord Message Formatting Examples

### Error Alert Format

```json
{
  "username": "Sentry Alerts",
  "avatar_url": "https://sentry-brand.storage.googleapis.com/sentry-logo-black.png",
  "embeds": [{
    "title": "🚨 High Error Rate Detected",
    "description": "Error rate exceeded 100 errors/hour",
    "color": 16724004,
    "fields": [
      {
        "name": "📊 Threshold",
        "value": "100 errors/hour",
        "inline": true
      },
      {
        "name": "📈 Current Rate",
        "value": "157 errors/hour",
        "inline": true
      },
      {
        "name": "🌍 Environment",
        "value": "production",
        "inline": true
      },
      {
        "name": "🔗 View Details",
        "value": "[Open in Sentry](https://sentry.io/...)",
        "inline": false
      }
    ],
    "timestamp": "2025-11-12T00:00:00.000Z",
    "footer": {
      "text": "Sentry Alert • High Priority"
    }
  }]
}
```

### New Error Format

```json
{
  "embeds": [{
    "title": "🆕 New Error Pattern Detected",
    "description": "TypeError: Cannot read property 'map' of undefined",
    "color": 16776960,
    "fields": [
      {
        "name": "📍 Location",
        "value": "repomix-worker.js:245",
        "inline": true
      },
      {
        "name": "🏷️ Component",
        "value": "repomix-worker",
        "inline": true
      },
      {
        "name": "🔗 View Issue",
        "value": "[Open in Sentry](https://sentry.io/...)",
        "inline": false
      }
    ]
  }]
}
```

## Troubleshooting

### Messages Not Appearing in Discord

1. **Check webhook URL is correct**:
   ```bash
   doppler secrets get DISCORD_SENTRY_WEBHOOK --plain
   ```

2. **Verify webhook in Discord**:
   - Go to channel settings → Integrations
   - Confirm webhook exists and is active

3. **Test webhook directly**:
   ```bash
   curl -X POST "YOUR_DISCORD_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d '{"content": "Test message"}'
   ```

4. **Check Sentry webhook logs**:
   - Visit: https://sentry.io/settings/integrity-studio/integrations/webhook/
   - View delivery attempts and errors

### Discord Rate Limiting

Discord rate limits webhooks:
- **5 messages per 2 seconds** per webhook
- **Burst**: Up to 5 messages instantly, then rate limited

**Solution**: Implement rate limiting in middleware service.

### Formatting Issues

If embeds don't render:
- Check color is valid integer (not hex string)
- Ensure all fields have name and value
- Timestamp must be ISO 8601 format
- Max 25 fields per embed
- Max 6000 characters total

## Security Best Practices

1. **Never commit webhook URLs to git**
2. **Store in Doppler or environment variables**
3. **Use HTTPS for middleware endpoints**
4. **Rotate webhooks periodically**
5. **Monitor for unauthorized access**

## Next Steps

1. ✅ Create Discord webhook
2. ✅ Store in Doppler
3. ✅ Test with test script
4. ✅ Configure Sentry integration
5. ✅ Update alert rules
6. ✅ Monitor first alerts in Discord
7. ⏳ Adjust formatting as needed

## Quick Reference

### Commands

```bash
# Test Discord webhook
doppler run -- node test/test-discord-webhook.js

# Start middleware service
pm2 start ../setup/sentry-to-discord.js --name sentry-discord-bridge

# View Sentry webhooks
curl -s "https://sentry.io/api/0/projects/integrity-studio/node/plugins/webhooks/" \
  -H "Authorization: Bearer $(doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain)"

# Send test message to Discord
curl -X POST "$(doppler secrets get DISCORD_SENTRY_WEBHOOK --plain)" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test from command line"}'
```

### Links

- **Discord Webhook Guide**: https://discord.com/developers/docs/resources/webhook
- **Sentry Webhooks**: https://docs.sentry.io/product/integrations/integration-platform/webhooks/
- **Discord Embeds**: https://discord.com/developers/docs/resources/message#embed-object

## Summary

This guide provides three approaches to Discord integration:

1. **Direct** (Simple): Sentry → Discord webhook
2. **Middleware** (Recommended): Sentry → Formatting service → Discord
3. **No-Code** (Easy): Sentry → Zapier/Make → Discord

Choose based on your needs:
- Quick setup → Direct
- Beautiful formatting → Middleware
- No infrastructure → No-Code

Once configured, all Sentry alerts will appear in your Discord channel with real-time notifications for your team! 🎉
