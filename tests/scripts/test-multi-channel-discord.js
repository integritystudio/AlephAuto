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

// Channel configuration with test data
const CHANNEL_CONFIG = {
  critical: {
    envVar: 'DISCORD_WEBHOOK_CRITICAL',
    displayName: '#alerts-critical',
    color: 0xFF0000, // Red
    testEmbed: {
      title: 'CRITICAL: Database Connection Failed',
      titleEmoji: '\uD83D\uDEA8',
      description: 'Unable to connect to primary database. All services affected.',
      severity: 'CRITICAL',
      component: 'database-pool',
      location: 'database.js:127',
      footerPrefix: 'CRITICAL'
    }
  },
  high: {
    envVar: 'DISCORD_WEBHOOK_HIGH',
    displayName: '#alerts-high',
    color: 0xFF4444, // Light Red
    testEmbed: {
      title: 'ERROR: Payment Processing Failed',
      titleEmoji: '\u26A0\uFE0F',
      description: "TypeError: Cannot read property 'map' of undefined",
      severity: 'ERROR',
      component: 'payment-worker',
      location: 'payment.js:342',
      userImpact: '3 users affected',
      footerPrefix: 'HIGH'
    }
  },
  medium: {
    envVar: 'DISCORD_WEBHOOK_MEDIUM',
    displayName: '#alerts-medium',
    color: 0xFFAA00, // Orange
    testEmbed: {
      title: 'WARNING: High Error Rate Detected',
      titleEmoji: '\u2139\uFE0F',
      description: 'Error rate exceeded 100 errors/hour threshold',
      severity: 'WARNING',
      component: null,
      threshold: '100 errors/hour',
      currentRate: '157 errors/hour',
      started: '5 minutes ago',
      footerPrefix: 'MEDIUM'
    }
  }
};

/**
 * Get webhook URLs from environment
 */
function getWebhooks() {
  return {
    critical: process.env.DISCORD_WEBHOOK_CRITICAL,
    high: process.env.DISCORD_WEBHOOK_HIGH,
    medium: process.env.DISCORD_WEBHOOK_MEDIUM
  };
}

/**
 * Check webhook configuration and log status
 * @returns {{ configured: string[], missing: string[] }}
 */
function checkWebhookConfiguration(webhooks) {
  const configured = [];
  const missing = [];

  Object.entries(webhooks).forEach(([channel, url]) => {
    if (url) {
      configured.push(channel);
      console.log(`\u2705 ${channel.toUpperCase()}: Webhook configured`);
    } else {
      missing.push(channel);
      console.log(`\u274C ${channel.toUpperCase()}: Webhook NOT configured`);
    }
  });

  return { configured, missing };
}

/**
 * Log missing webhook help message
 */
function logMissingWebhookHelp(missingChannels) {
  if (missingChannels.length === 0) return;

  console.log('\n\u26A0\uFE0F  Missing webhooks detected!\n');
  console.log('To configure missing webhooks:');
  missingChannels.forEach(channel => {
    console.log(`   doppler secrets set DISCORD_WEBHOOK_${channel.toUpperCase()}="your-webhook-url"`);
  });
  console.log('');
}

/**
 * Create test embed for a channel
 */
function createTestEmbed(channelKey, config) {
  const { color, testEmbed } = config;
  const fields = [
    { name: '\uD83D\uDCCA Severity', value: testEmbed.severity, inline: true },
    { name: '\uD83C\uDF0D Environment', value: 'production', inline: true }
  ];

  // Add component field if present
  if (testEmbed.component) {
    fields.push({ name: '\uD83C\uDFF7\uFE0F Component', value: testEmbed.component, inline: true });
  }

  // Add location field if present
  if (testEmbed.location) {
    fields.push({ name: '\uD83D\uDCCD Location', value: testEmbed.location, inline: true });
  }

  // Add optional fields based on channel type
  if (testEmbed.userImpact) {
    fields.push({ name: '\uD83D\uDC64 User Impact', value: testEmbed.userImpact, inline: true });
  }
  if (testEmbed.threshold) {
    fields.push({ name: '\uD83D\uDCC8 Threshold', value: testEmbed.threshold, inline: true });
  }
  if (testEmbed.currentRate) {
    fields.push({ name: '\uD83D\uDCC8 Current Rate', value: testEmbed.currentRate, inline: true });
  }
  if (testEmbed.started) {
    fields.push({ name: '\u23F0 Started', value: testEmbed.started, inline: true });
  }

  // Add time field
  fields.push({ name: '\u23F0 Time', value: new Date().toLocaleString(), inline: false });

  // Add link field
  const linkLabel = channelKey === 'medium' ? '\uD83D\uDD17 View Dashboard' : '\uD83D\uDD17 View Details';
  fields.push({ name: linkLabel, value: '[Open in Sentry](https://sentry.io/)', inline: false });

  return {
    title: `${testEmbed.titleEmoji} ${testEmbed.title}`,
    description: testEmbed.description,
    color,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: `Sentry Alert \u2022 ${testEmbed.footerPrefix} Priority` }
  };
}

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
          console.log(`   \u2705 Message sent to ${channelName}!`);
          resolve({ success: true, channel: channelName });
        } else {
          console.error(`   \u274C Discord API error for ${channelName}:`, res.statusCode, body);
          reject(new Error(`Discord API error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`   \u274C Request error for ${channelName}:`, error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Test a single channel
 * @returns {Promise<{ success: boolean, channel: string, error?: string }>}
 */
async function testSingleChannel(channelKey, webhookUrl, testNumber) {
  const config = CHANNEL_CONFIG[channelKey];
  console.log(`\n\uD83D\uDCE4 Test ${testNumber}: ${channelKey.toUpperCase()} channel (${config.displayName})`);

  try {
    const embed = createTestEmbed(channelKey, config);
    await sendDiscordMessage(webhookUrl, embed, config.displayName);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit delay
    return { success: true, channel: channelKey };
  } catch (error) {
    return { success: false, channel: channelKey, error: error.message };
  }
}

/**
 * Print test header
 */
function printHeader() {
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551    Testing Multi-Channel Discord Integration for Sentry       \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n');
}

/**
 * Print test results summary
 */
function printResults(results, webhooks) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551              Multi-Channel Test Complete!                     \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n');

  console.log('\uD83D\uDCCA Test Results:');
  console.log(`   \u2705 Successful: ${successful.length} channel(s)`);
  console.log(`   \u274C Failed: ${failed.length} channel(s)\n`);

  if (successful.length > 0) {
    console.log('\u2705 Successful channels:');
    successful.forEach(r => console.log(`   \u2022 ${r.channel.toUpperCase()}`));
    console.log('');
  }

  if (failed.length > 0) {
    console.log('\u274C Failed channels:');
    failed.forEach(r => console.log(`   \u2022 ${r.channel.toUpperCase()}: ${r.error}`));
    console.log('');
  }

  console.log('\uD83D\uDCF1 Check your Discord server for test messages in:');
  if (webhooks.critical) console.log('   \u2022 #alerts-critical (red message)');
  if (webhooks.high) console.log('   \u2022 #alerts-high (light red message)');
  if (webhooks.medium) console.log('   \u2022 #alerts-medium (orange message)');
  console.log('');

  console.log('Next steps:');
  console.log('   1. Verify messages appeared in correct Discord channels');
  console.log('   2. Configure Sentry to route alerts by severity');
  console.log('   3. Run: node setup-files/configure-discord-alerts.js');
  console.log('   4. Monitor for real Sentry alerts\n');

  return failed.length;
}

/**
 * Test all Discord channels
 */
async function testAllChannels() {
  printHeader();

  const webhooks = getWebhooks();
  const { configured, missing } = checkWebhookConfiguration(webhooks);

  logMissingWebhookHelp(missing);

  if (configured.length === 0) {
    console.error('\u274C No webhooks configured. Exiting.\n');
    process.exit(1);
  }

  console.log(`\n\uD83D\uDCE4 Testing ${configured.length} configured channel(s)...`);

  // Test each configured channel
  const results = [];
  let testNumber = 1;

  for (const channelKey of configured) {
    const result = await testSingleChannel(channelKey, webhooks[channelKey], testNumber);
    results.push(result);
    testNumber++;
  }

  const failedCount = printResults(results, webhooks);

  if (failedCount > 0) {
    process.exit(1);
  }
}

// Run tests
testAllChannels().catch(error => {
  console.error('\n\u274C Test suite failed:', error.message);
  process.exit(1);
});
