const https = require('https');
require('dotenv').config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_SENTRY_WEBHOOK;

function sendDiscordMessage(embed) {
  return new Promise((resolve, reject) => {
    if (!DISCORD_WEBHOOK_URL) {
      reject(new Error('DISCORD_SENTRY_WEBHOOK not set in environment'));
      return;
    }

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
    console.error('');
    console.error('To set it up:');
    console.error('1. Create webhook in Discord channel settings → Integrations');
    console.error('2. Copy webhook URL');
    console.error('3. Add to Doppler: doppler secrets set DISCORD_SENTRY_WEBHOOK="webhook-url"');
    console.error('');
    process.exit(1);
  }

  console.log('✅ Discord webhook URL found');
  console.log(`   Webhook: ${DISCORD_WEBHOOK_URL.substring(0, 50)}...\n`);

  try {
    // Test 1: Info message
    console.log('📤 Test 1: Sending info message...');
    await sendDiscordMessage({
      title: '🧪 Sentry + Discord Integration Test',
      description: 'This is a test info message to verify Discord integration is working correctly.',
      color: 0x00AAFF, // Blue
      fields: [
        { name: '📊 Level', value: 'info', inline: true },
        { name: '🌍 Environment', value: 'test', inline: true },
        { name: '⏰ Time', value: new Date().toLocaleString(), inline: true }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Sentry Alert Test' }
    });

    // Wait between messages to avoid rate limiting
    console.log('⏳ Waiting 1 second to avoid rate limiting...\n');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Error message
    console.log('📤 Test 2: Sending error message...');
    await sendDiscordMessage({
      title: '🚨 Test Error Alert',
      description: 'TypeError: Cannot read property \'map\' of undefined',
      color: 0xFF4444, // Red
      fields: [
        { name: '📊 Level', value: 'error', inline: true },
        { name: '🌍 Environment', value: 'production', inline: true },
        { name: '🏷️ Component', value: 'test-worker', inline: true },
        { name: '📍 Location', value: 'test-script.js:42', inline: true },
        { name: '🔗 View Details', value: '[Open in Sentry](https://sentry.io/)', inline: false }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Sentry Alert • High Priority' }
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Warning message
    console.log('\n📤 Test 3: Sending warning message...');
    await sendDiscordMessage({
      title: '⚠️ High Error Rate Detected',
      description: 'Error rate exceeded 100 errors/hour threshold',
      color: 0xFFAA00, // Orange
      fields: [
        { name: '📊 Threshold', value: '100 errors/hour', inline: true },
        { name: '📈 Current Rate', value: '157 errors/hour', inline: true },
        { name: '🌍 Environment', value: 'production', inline: true },
        { name: '⏰ Started', value: '5 minutes ago', inline: true }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Sentry Alert • Critical' }
    });

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          Discord Integration Test Complete! ✅                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('📱 Check your Discord channel for 3 test messages:');
    console.log('   1. 🧪 Info message (blue)');
    console.log('   2. 🚨 Error alert (red)');
    console.log('   3. ⚠️  Warning alert (orange)\n');
    console.log('Next steps:');
    console.log('   • Configure Sentry to use Discord webhook');
    console.log('   • Run: node setup-files/configure-discord-alerts.js');
    console.log('   • Monitor for real Sentry alerts in Discord\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify webhook URL is correct');
    console.error('2. Check webhook is active in Discord channel settings');
    console.error('3. Ensure network connectivity to Discord API');
    process.exit(1);
  }
}

testDiscordIntegration().catch(console.error);
