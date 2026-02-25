#!/usr/bin/env node
/**
 * Test Sentry Connection
 * Sends a test message to verify Sentry is configured correctly
 */

import Sentry from '@sentry/node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSentryConnection() {
  console.log('🧪 Testing Sentry Connection...\n');

  // Check if DSN is configured
  if (!process.env.SENTRY_DSN || process.env.SENTRY_DSN === 'your_sentry_dsn_here') {
    console.error('❌ SENTRY_DSN not configured in .env file');
    console.error('   Please run: npm run setup:sentry');
    process.exit(1);
  }

  console.log('✅ SENTRY_DSN found in environment');
  console.log(`   DSN: ${process.env.SENTRY_DSN.substring(0, 50)}...\n`);

  // Initialize Sentry
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: 'test',
    tracesSampleRate: 1.0,
  });

  console.log('✅ Sentry initialized\n');

  // Send test message
  console.log('📤 Sending test message to Sentry...');

  const eventId = Sentry.captureMessage(
    'Sentry connection test successful! 🎉',
    'info'
  );

  console.log(`✅ Test message sent!`);
  console.log(`   Event ID: ${eventId}\n`);

  // Send test error
  console.log('📤 Sending test error to Sentry...');

  const errorId = Sentry.captureException(
    new Error('Test error - This is a test error to verify Sentry error tracking')
  );

  console.log(`✅ Test error sent!`);
  console.log(`   Error ID: ${errorId}\n`);

  // Flush events to Sentry
  console.log('⏳ Flushing events to Sentry...');
  await Sentry.flush(2000);

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

testSentryConnection().catch((error) => {
  console.error('\n❌ Fatal error during test:', error);
  process.exit(1);
});
