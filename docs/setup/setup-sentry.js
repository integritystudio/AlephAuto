#!/usr/bin/env node
/**
 * Sentry Setup Helper
 * Guides you through configuring Sentry for the job management system
 */

import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function checkSentryAccount(rl) {
  console.log('Step 1: Sentry Account');
  console.log('─────────────────────');
  const hasAccount = await question(rl, 'Do you have a Sentry account? (y/n): ');

  if (hasAccount.toLowerCase() === 'y') return;

  console.log('\n📝 To create a free Sentry account:');
  console.log('   1. Visit: https://sentry.io/signup/');
  console.log('   2. Sign up with your email or GitHub');
  console.log('   3. Create a new project (select Node.js)');
  console.log('   4. Copy your DSN from the project settings');
  console.log();

  const created = await question(rl, 'Have you created an account? (y/n): ');
  if (created.toLowerCase() !== 'y') {
    console.log('\n⏸️  Setup paused. Run this script again when you have your Sentry account.');
    return false;
  }
}

async function promptAndValidateDsn(rl) {
  console.log('\nStep 2: Get Your DSN');
  console.log('────────────────────');
  console.log('Your Sentry DSN looks like:');
  console.log('https://abc123def456@o123456.ingest.sentry.io/7890123');
  console.log();
  console.log('📍 To find your DSN:');
  console.log('   1. Go to https://sentry.io/');
  console.log('   2. Select your project');
  console.log('   3. Go to Settings → Projects → [Your Project] → Client Keys (DSN)');
  console.log('   4. Copy the DSN');
  console.log();

  const dsn = await question(rl, 'Enter your Sentry DSN: ');
  if (!dsn || dsn.trim() === '' || !dsn.includes('sentry.io')) {
    console.log('\n❌ Invalid DSN format. Please run the script again with a valid DSN.');
    return null;
  }
  return dsn.trim();
}

async function updateEnvFile(dsn) {
  console.log('\nStep 3: Updating Configuration');
  console.log('──────────────────────────────');

  const envPath = path.join(process.cwd(), '.env');
  let envContent = await fs.readFile(envPath, 'utf-8');
  envContent = envContent.replace(/SENTRY_DSN=.*/, `SENTRY_DSN=${dsn}`);
  await fs.writeFile(envPath, envContent);
  console.log('✅ .env file updated successfully!');
  console.log();
}

async function testSentryConnection(rl, dsn) {
  console.log('Step 4: Testing Connection');
  console.log('──────────────────────────');

  const test = await question(rl, 'Would you like to test the Sentry connection? (y/n): ');
  if (test.toLowerCase() !== 'y') return;

  console.log('\n🧪 Testing Sentry connection...');
  console.log('   (This will send a test error to Sentry)');
  console.log();

  const Sentry = await import('@sentry/node');
  Sentry.init({ dsn, environment: 'setup-test', tracesSampleRate: 1.0 });
  const eventId = Sentry.captureMessage('Sentry setup test - Configuration successful!', 'info');
  await Sentry.flush(2000);

  console.log('✅ Test message sent!');
  console.log(`   Event ID: ${eventId}`);
  console.log();
  console.log('📊 Check your Sentry dashboard:');
  console.log(`   https://sentry.io/organizations/`);
  console.log();
  console.log('   You should see a message: "Sentry setup test - Configuration successful!"');
}

function printCompletion() {
  console.log();
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    Setup Complete! 🎉                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('✅ Sentry is now configured!');
  console.log();
  console.log('Next steps:');
  console.log('  1. All job errors will automatically be logged to Sentry');
  console.log('  2. Performance metrics will be tracked');
  console.log('  3. Set up alerts in Sentry dashboard (recommended)');
  console.log();
  console.log('Useful Sentry features:');
  console.log('  • Real-time error notifications');
  console.log('  • Error grouping and tracking');
  console.log('  • Performance monitoring');
  console.log('  • Release tracking');
  console.log('  • User feedback');
  console.log();
}

async function setupSentry() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Sentry Error Monitoring Setup                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const accountOk = await checkSentryAccount(rl);
    if (accountOk === false) return;

    const dsn = await promptAndValidateDsn(rl);
    if (!dsn) return;

    await updateEnvFile(dsn);
    await testSentryConnection(rl, dsn);
    printCompletion();
  } catch (error) {
    console.error('\n❌ Error updating .env file:', error.message);
    console.error('   Please manually update SENTRY_DSN in .env file');
  } finally {
    rl.close();
  }
}

setupSentry().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
