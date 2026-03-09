#!/usr/bin/env node
/**
 * Test Sentry Connection
 * Sends a test message to verify Sentry is configured correctly
 */

import Sentry from '@sentry/node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

function checkSentryDsn() {
  if (!process.env.SENTRY_DSN || process.env.SENTRY_DSN === 'your_sentry_dsn_here') {
    console.error('❌ SENTRY_DSN not configured in .env file');
    console.error('   Please run: npm run setup:sentry');
    process.exit(1);
  }
  console.log('✅ SENTRY_DSN found in environment');
  console.log(`   DSN: ${process.env.SENTRY_DSN.substring(0, 50)}...\n`);
}

async function sendTestEvents() {
  const eventId = Sentry.captureMessage('Sentry connection test successful! 🎉', 'info');
  console.log(`✅ Test message sent!\n   Event ID: ${eventId}\n`);

  const errorId = Sentry.captureException(
    new Error('Test error - This is a test error to verify Sentry error tracking')
  );
  console.log(`✅ Test error sent!\n   Error ID: ${errorId}\n`);

  console.log('⏳ Flushing events to Sentry...');
  await Sentry.flush(2000);
}

function printSentryResults() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              Sentry Connection Test Complete! ✅              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log('📊 Check your Sentry dashboard to see the test messages:');
  console.log('   https://sentry.io/\n');
  console.log('You should see:');
  console.log('   1. Info message: "Sentry connection test successful! 🎉"');
  console.log('   2. Error: "Test error - This is a test error..."\n');
  console.log('Next steps:');
  console.log('   • Set up alerts in Sentry dashboard');
  console.log('   • Configure Slack/email notifications');
  console.log('   • Run your jobs - errors will be automatically tracked!\n');
}

/**
 * testSentryConnection.
 */
async function testSentryConnection() {
  console.log('🧪 Testing Sentry Connection...\n');

  checkSentryDsn();

  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: 'test', tracesSampleRate: 1.0 });
  console.log('✅ Sentry initialized\n');

  console.log('📤 Sending test message to Sentry...');
  await sendTestEvents();

  printSentryResults();
}

testSentryConnection().catch((error) => {
  console.error('\n❌ Fatal error during test:', error);
  process.exit(1);
});
