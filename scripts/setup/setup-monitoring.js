#!/usr/bin/env node
/**
 * Monitoring Setup — Sentry + Discord
 *
 * Loads secrets from Doppler, walks through Sentry DSN configuration,
 * then configures the Sentry-to-Discord webhook bridge.
 *
 * Usage:
 *   node scripts/setup/setup-monitoring.js
 */

import { execSync } from 'child_process';
import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';

const SENTRY_DSN_PATTERN = /sentry\.io/;
const DISCORD_WEBHOOK_PATTERN = /discord\.com\/api\/webhooks\//;

// ---------------------------------------------------------------------------
// Doppler env loader
// ---------------------------------------------------------------------------

function loadDopplerEnv() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const loadScript = path.join(scriptDir, 'load-doppler-env.sh');
  const env = execSync(`source "${loadScript}" && env -0`, {
    encoding: 'utf-8',
    shell: '/bin/bash',
  });
  for (const entry of env.split('\0')) {
    const idx = entry.indexOf('=');
    if (idx > 0) process.env[entry.slice(0, idx)] = entry.slice(idx + 1);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prompt(rl, text) {
  return new Promise((resolve) => rl.question(text, resolve));
}

function getProjectRoot() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  return path.resolve(scriptDir, '../..');
}

async function readEnvFile() {
  const envPath = path.join(getProjectRoot(), '.env');
  return fs.readFile(envPath, 'utf-8');
}

async function writeEnvFile(content) {
  const envPath = path.join(getProjectRoot(), '.env');
  await fs.writeFile(envPath, content);
}

function upsertEnvVar(envContent, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(envContent)) {
    return envContent.replace(re, `${key}=${value}`);
  }
  return `${envContent.trimEnd()}\n${key}=${value}\n`;
}

// ---------------------------------------------------------------------------
// Step 1 — Sentry account check
// ---------------------------------------------------------------------------

async function checkSentryAccount(rl) {
  console.log('Step 1: Sentry Account');
  console.log('----------------------');
  const has = await prompt(rl, 'Do you have a Sentry account? (y/n): ');
  if (has.toLowerCase() === 'y') return true;

  console.log('\nTo create a free Sentry account:');
  console.log('  1. Visit https://sentry.io/signup/');
  console.log('  2. Sign up with email or GitHub');
  console.log('  3. Create a Node.js project');
  console.log('  4. Copy your DSN from project settings\n');

  const created = await prompt(rl, 'Have you created an account? (y/n): ');
  if (created.toLowerCase() !== 'y') {
    console.log('\nSetup paused. Run again when you have a Sentry account.');
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Step 2 — Sentry DSN
// ---------------------------------------------------------------------------

async function promptSentryDsn(rl) {
  console.log('\nStep 2: Sentry DSN');
  console.log('------------------');

  const existing = process.env.SENTRY_DSN;
  if (existing && SENTRY_DSN_PATTERN.test(existing)) {
    console.log(`Found existing DSN: ${existing}`);
    const keep = await prompt(rl, 'Use this DSN? (y/n): ');
    if (keep.toLowerCase() === 'y') return existing;
  }

  console.log('Your DSN looks like: https://abc123@o123456.ingest.sentry.io/7890123');
  console.log('Find it at: Settings > Projects > [Project] > Client Keys (DSN)\n');

  const dsn = await prompt(rl, 'Enter your Sentry DSN: ');
  if (!dsn || !SENTRY_DSN_PATTERN.test(dsn.trim())) {
    console.log('\nInvalid DSN format. Run the script again with a valid DSN.');
    return null;
  }
  return dsn.trim();
}

// ---------------------------------------------------------------------------
// Step 3 — Discord webhook
// ---------------------------------------------------------------------------

async function promptDiscordWebhook(rl) {
  console.log('\nStep 3: Discord Webhook');
  console.log('-----------------------');

  const existing = process.env.DISCORD_CHANNEL_WEBHOOK;
  if (existing && DISCORD_WEBHOOK_PATTERN.test(existing)) {
    console.log(`Found existing webhook: ${existing.slice(0, 60)}...`);
    const keep = await prompt(rl, 'Use this webhook? (y/n): ');
    if (keep.toLowerCase() === 'y') return existing;
  }

  console.log('To create a Discord webhook:');
  console.log('  1. Open Discord server settings > Integrations > Webhooks');
  console.log('  2. Click "New Webhook"');
  console.log('  3. Name it (e.g. "Sentry Alerts"), pick a channel');
  console.log('  4. Copy the webhook URL\n');

  const url = await prompt(rl, 'Enter your Discord webhook URL (or press Enter to skip): ');
  if (!url || !url.trim()) {
    console.log('Skipping Discord setup. You can re-run later to configure it.');
    return null;
  }
  if (!DISCORD_WEBHOOK_PATTERN.test(url.trim())) {
    console.log('\nInvalid webhook URL. Expected https://discord.com/api/webhooks/...');
    return null;
  }
  return url.trim();
}

// ---------------------------------------------------------------------------
// Step 4 — Persist to .env
// ---------------------------------------------------------------------------

async function persistConfig(dsn, webhookUrl) {
  console.log('\nStep 4: Updating .env');
  console.log('---------------------');

  let envContent = await readEnvFile();
  envContent = upsertEnvVar(envContent, 'SENTRY_DSN', dsn);
  if (webhookUrl) {
    envContent = upsertEnvVar(envContent, 'DISCORD_CHANNEL_WEBHOOK', webhookUrl);
  }
  await writeEnvFile(envContent);
  console.log('.env updated.');
}

// ---------------------------------------------------------------------------
// Step 5 — Test connections
// ---------------------------------------------------------------------------

async function testSentryConnection(rl, dsn) {
  const test = await prompt(rl, '\nTest Sentry connection? (sends a test event) (y/n): ');
  if (test.toLowerCase() !== 'y') return;

  console.log('Sending test event to Sentry...');
  const Sentry = await import('@sentry/node');
  Sentry.init({ dsn, environment: 'setup-test', tracesSampleRate: 1.0 });
  const eventId = Sentry.captureMessage('Monitoring setup test - Configuration successful!', 'info');
  await Sentry.flush(2000);
  console.log(`Test event sent (ID: ${eventId}). Check your Sentry dashboard.`);
}

async function testDiscordWebhook(rl, webhookUrl) {
  if (!webhookUrl) return;

  const test = await prompt(rl, 'Test Discord webhook? (sends a test message) (y/n): ');
  if (test.toLowerCase() !== 'y') return;

  console.log('Sending test message to Discord...');
  const { sendToDiscord } = await import('./sentry-to-discord.js');
  process.env.DISCORD_SENTRY_WEBHOOK = webhookUrl;
  await sendToDiscord({
    username: 'Sentry Alerts',
    embeds: [{
      title: 'Setup Test',
      description: 'Sentry-to-Discord bridge configured successfully.',
      color: 0x00AAFF,
      timestamp: new Date().toISOString(),
      footer: { text: 'Sentry Alert - setup-test' },
    }],
  });
  console.log('Test message sent. Check your Discord channel.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Monitoring Setup - Sentry + Discord');
  console.log('====================================\n');

  loadDopplerEnv();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const accountOk = await checkSentryAccount(rl);
    if (!accountOk) return;

    const dsn = await promptSentryDsn(rl);
    if (!dsn) return;

    const webhookUrl = await promptDiscordWebhook(rl);

    await persistConfig(dsn, webhookUrl);
    await testSentryConnection(rl, dsn);
    await testDiscordWebhook(rl, webhookUrl);

    console.log('\nSetup complete.');
    console.log('  - Sentry: configured');
    console.log(`  - Discord: ${webhookUrl ? 'configured' : 'skipped'}`);
    if (webhookUrl) {
      const bridgePath = path.join(getProjectRoot(), 'scripts/setup/sentry-to-discord.js');
      console.log('\nTo start the webhook bridge:');
      console.log(`  node ${bridgePath}`);
      console.log(`  pm2 start ${bridgePath} --name sentry-discord-bridge`);
    }
  } catch (error) {
    console.error('\nError:', error.message);
    console.error('Manually update SENTRY_DSN / DISCORD_SENTRY_WEBHOOK in .env');
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
