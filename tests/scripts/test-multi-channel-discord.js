#!/usr/bin/env node

/**
 * Test Multi-Channel Discord Integration
 *
 * Tests all three Discord webhook channels:
 * - DISCORD_WEBHOOK_CRITICAL (#alerts-critical)
 * - DISCORD_WEBHOOK_HIGH (#alerts-high)
 * - DISCORD_WEBHOOK_MEDIUM (#alerts-medium)
 *
 * Usage:
 *   doppler run -- node tests/scripts/test-multi-channel-discord.js
 */

const https = require('https');
require('dotenv').config();

// Get webhook URLs from environment
const WEBHOOKS = {
  critical: process.env.DISCORD_WEBHOOK_CRITICAL,
  high: process.env.DISCORD_WEBHOOK_HIGH,
  medium: process.env.DISCORD_WEBHOOK_MEDIUM
};

/**
 * Send Discord message with embed
 */
function sendDiscordMessage(webhookUrl, embed, channelName) {
  return new Promise((resolve, reject) => {
    if (!webhookUrl) {
      reject(new Error(`Webhook URL not set for ${channelName}`));
      return;
    }

    const url = new URL(webhookUrl);
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
          console.log(`   ✅ Message sent to ${channelName}!`);
          resolve({ success: true, channel: channelName });
        } else {
          console.error(`   ❌ Discord API error for ${channelName}:`, res.statusCode, body);
          reject(new Error(`Discord API error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`   ❌ Request error for ${channelName}:`, error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Test all Discord channels
 */
async function testAllChannels() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║    Testing Multi-Channel Discord Integration for Sentry       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check which webhooks are configured
  const configuredChannels = [];
  const missingChannels = [];

  Object.entries(WEBHOOKS).forEach(([channel, url]) => {
    if (url) {
      configuredChannels.push(channel);
      console.log(`✅ ${channel.toUpperCase()}: Webhook configured`);
    } else {
      missingChannels.push(channel);
      console.log(`❌ ${channel.toUpperCase()}: Webhook NOT configured`);
    }
  });

  if (missingChannels.length > 0) {
    console.log('\n⚠️  Missing webhooks detected!\n');
    console.log('To configure missing webhooks:');
    missingChannels.forEach(channel => {
      console.log(`   doppler secrets set DISCORD_WEBHOOK_${channel.toUpperCase()}="your-webhook-url"`);
    });
    console.log('');
  }

  if (configuredChannels.length === 0) {
    console.error('❌ No webhooks configured. Exiting.\n');
    process.exit(1);
  }

  console.log(`\n📤 Testing ${configuredChannels.length} configured channel(s)...\n`);

  const results = {
    success: [],
    failed: []
  };

  // Test Critical Channel
  if (WEBHOOKS.critical) {
    console.log('📤 Test 1: CRITICAL channel (#alerts-critical)');
    try {
      await sendDiscordMessage(WEBHOOKS.critical, {
        title: '🚨 CRITICAL: Database Connection Failed',
        description: 'Unable to connect to primary database. All services affected.',
        color: 0xFF0000, // Red
        fields: [
          { name: '📊 Severity', value: 'CRITICAL', inline: true },
          { name: '🌍 Environment', value: 'production', inline: true },
          { name: '🏷️ Component', value: 'database-pool', inline: true },
          { name: '📍 Location', value: 'database.js:127', inline: true },
          { name: '⏰ Time', value: new Date().toLocaleString(), inline: false },
          { name: '🔗 View Details', value: '[Open in Sentry](https://sentry.io/)', inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Sentry Alert • CRITICAL Priority' }
      }, '#alerts-critical');
      results.success.push('critical');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      results.failed.push({ channel: 'critical', error: error.message });
    }
  }

  // Test High Priority Channel
  if (WEBHOOKS.high) {
    console.log('\n📤 Test 2: HIGH priority channel (#alerts-high)');
    try {
      await sendDiscordMessage(WEBHOOKS.high, {
        title: '⚠️ ERROR: Payment Processing Failed',
        description: 'TypeError: Cannot read property \'map\' of undefined',
        color: 0xFF4444, // Light Red
        fields: [
          { name: '📊 Severity', value: 'ERROR', inline: true },
          { name: '🌍 Environment', value: 'production', inline: true },
          { name: '🏷️ Component', value: 'payment-worker', inline: true },
          { name: '📍 Location', value: 'payment.js:342', inline: true },
          { name: '👤 User Impact', value: '3 users affected', inline: true },
          { name: '⏰ Time', value: new Date().toLocaleString(), inline: false },
          { name: '🔗 View Details', value: '[Open in Sentry](https://sentry.io/)', inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Sentry Alert • HIGH Priority' }
      }, '#alerts-high');
      results.success.push('high');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      results.failed.push({ channel: 'high', error: error.message });
    }
  }

  // Test Medium Priority Channel
  if (WEBHOOKS.medium) {
    console.log('\n📤 Test 3: MEDIUM priority channel (#alerts-medium)');
    try {
      await sendDiscordMessage(WEBHOOKS.medium, {
        title: 'ℹ️ WARNING: High Error Rate Detected',
        description: 'Error rate exceeded 100 errors/hour threshold',
        color: 0xFFAA00, // Orange
        fields: [
          { name: '📊 Severity', value: 'WARNING', inline: true },
          { name: '🌍 Environment', value: 'production', inline: true },
          { name: '📈 Threshold', value: '100 errors/hour', inline: true },
          { name: '📈 Current Rate', value: '157 errors/hour', inline: true },
          { name: '⏰ Started', value: '5 minutes ago', inline: true },
          { name: '🔗 View Dashboard', value: '[Open in Sentry](https://sentry.io/)', inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Sentry Alert • MEDIUM Priority' }
      }, '#alerts-medium');
      results.success.push('medium');
    } catch (error) {
      results.failed.push({ channel: 'medium', error: error.message });
    }
  }

  // Print results
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              Multi-Channel Test Complete!                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Test Results:');
  console.log(`   ✅ Successful: ${results.success.length} channel(s)`);
  console.log(`   ❌ Failed: ${results.failed.length} channel(s)\n`);

  if (results.success.length > 0) {
    console.log('✅ Successful channels:');
    results.success.forEach(channel => {
      console.log(`   • ${channel.toUpperCase()}`);
    });
    console.log('');
  }

  if (results.failed.length > 0) {
    console.log('❌ Failed channels:');
    results.failed.forEach(({ channel, error }) => {
      console.log(`   • ${channel.toUpperCase()}: ${error}`);
    });
    console.log('');
  }

  console.log('📱 Check your Discord server for test messages in:');
  if (WEBHOOKS.critical) console.log('   • #alerts-critical (red message)');
  if (WEBHOOKS.high) console.log('   • #alerts-high (light red message)');
  if (WEBHOOKS.medium) console.log('   • #alerts-medium (orange message)');
  console.log('');

  console.log('Next steps:');
  console.log('   1. Verify messages appeared in correct Discord channels');
  console.log('   2. Configure Sentry to route alerts by severity');
  console.log('   3. Run: node setup-files/configure-discord-alerts.js');
  console.log('   4. Monitor for real Sentry alerts\n');

  if (results.failed.length > 0) {
    process.exit(1);
  }
}

// Run tests
testAllChannels().catch(error => {
  console.error('\n❌ Test suite failed:', error.message);
  process.exit(1);
});
