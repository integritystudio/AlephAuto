#!/usr/bin/env node
/**
 * Doppler + Sentry Setup Helper
 * Adds Sentry DSN to Doppler and updates local .env
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';
import fs from 'fs/promises';

const execAsync = promisify(exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupDopplerSentry() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Doppler + Sentry Integration Setup                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();

  try {
    // Check if Doppler is installed
    await execAsync('doppler --version');
    console.log('✅ Doppler CLI detected\n');
  } catch (error) {
    console.error('❌ Doppler CLI not found. Please install it first:');
    console.error('   brew install dopplerhq/cli/doppler');
    console.error('   or visit: https://docs.doppler.com/docs/install-cli');
    process.exit(1);
  }

  // Check if logged in to Doppler
  try {
    await execAsync('doppler configure get token.current');
    console.log('✅ Doppler authenticated\n');
  } catch (error) {
    console.error('❌ Not logged in to Doppler. Please run:');
    console.error('   doppler login');
    process.exit(1);
  }

  console.log('Step 1: Get Your Sentry DSN');
  console.log('═══════════════════════════');
  console.log('Your Sentry DSN should look like:');
  console.log('https://abc123def456@o123456.ingest.sentry.io/7890123');
  console.log();
  console.log('To get your DSN:');
  console.log('1. Go to https://sentry.io/');
  console.log('2. Select your project (or create one: Node.js)');
  console.log('3. Settings → Client Keys (DSN)');
  console.log('4. Copy the DSN');
  console.log();

  const dsn = await question('Enter your Sentry DSN: ');

  if (!dsn || !dsn.includes('sentry.io')) {
    console.error('\n❌ Invalid DSN format');
    rl.close();
    process.exit(1);
  }

  console.log('\nStep 2: Add to Doppler');
  console.log('══════════════════════');

  const project = 'integrity-studio';
  const config = 'dev';

  console.log(`Adding SENTRY_DSN to Doppler...`);
  console.log(`Project: ${project}`);
  console.log(`Config: ${config}`);
  console.log();

  try {
    await execAsync(
      `doppler secrets set SENTRY_DSN="${dsn}" --project ${project} --config ${config}`
    );
    console.log('✅ SENTRY_DSN added to Doppler successfully!\n');
  } catch (error) {
    console.error('❌ Failed to add to Doppler:', error.message);
    console.error('\nYou can add it manually:');
    console.error(`doppler secrets set SENTRY_DSN="${dsn}" --project ${project} --config ${config}`);
    rl.close();
    process.exit(1);
  }

  console.log('Step 3: Update Local .env');
  console.log('═════════════════════════');

  const updateLocal = await question('Update local .env file with this DSN? (y/n): ');

  if (updateLocal.toLowerCase() === 'y') {
    try {
      let envContent = await fs.readFile('.env', 'utf-8');
      envContent = envContent.replace(
        /SENTRY_DSN=.*/,
        `SENTRY_DSN=${dsn}`
      );
      await fs.writeFile('.env', envContent);
      console.log('✅ Local .env file updated!\n');
    } catch (error) {
      console.error('❌ Error updating .env:', error.message);
    }
  }

  console.log('Step 4: Test Connection');
  console.log('═══════════════════════');

  const testNow = await question('Test Sentry connection now? (y/n): ');

  if (testNow.toLowerCase() === 'y') {
    console.log('\n🧪 Testing Sentry connection...\n');

    const Sentry = await import('@sentry/node');

    Sentry.init({
      dsn: dsn,
      environment: 'setup-test',
      tracesSampleRate: 1.0,
    });

    const eventId = Sentry.captureMessage(
      'Doppler + Sentry integration test successful!',
      'info'
    );

    await Sentry.flush(2000);

    console.log('✅ Test message sent to Sentry!');
    console.log(`   Event ID: ${eventId}`);
    console.log();
    console.log('📊 Check your Sentry dashboard to see the test message');
    console.log('   https://sentry.io/\n');
  }

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                  Setup Complete! 🎉                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('✅ Sentry DSN is now stored in Doppler');
  console.log('✅ Local .env file updated (if you chose to)');
  console.log();
  console.log('Running with Doppler:');
  console.log(`  doppler run --project ${project} --config ${config} -- npm start`);
  console.log();
  console.log('Or use local .env:');
  console.log('  npm start');
  console.log();

  rl.close();
}

setupDopplerSentry().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
