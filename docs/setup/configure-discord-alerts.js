#!/usr/bin/env node

/**
 * Configure Discord Integration for Sentry Alerts
 *
 * This script adds Discord webhook integration to Sentry and updates
 * all existing alert rules to include Discord notifications.
 *
 * Usage:
 *   doppler run -- node setup-files/configure-discord-alerts.js
 */

const https = require('https');
require('dotenv').config();

const SENTRY_TOKEN = process.env.SENTRY_TOKEN;
const DISCORD_WEBHOOK = process.env.DISCORD_SENTRY_WEBHOOK;
const ORG_SLUG = 'integrity-studio';
const PROJECT_SLUG = 'node';

/**
 * Make Sentry API request
 */
function sentryRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sentry.io',
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${SENTRY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch {
            resolve(data);
          }
        } else {
          reject(new Error(`Sentry API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Get all alert rules for the project
 */
async function getAlertRules() {
  console.log('📋 Fetching existing alert rules...');
  const rules = await sentryRequest('GET', `/api/0/projects/${ORG_SLUG}/${PROJECT_SLUG}/rules/`);
  console.log(`   Found ${rules.length} alert rules\n`);
  return rules;
}

/**
 * Add webhook integration to Sentry project
 */
async function addWebhookIntegration() {
  console.log('🔗 Configuring Discord webhook integration...');

  try {
    const result = await sentryRequest(
      'POST',
      `/api/0/projects/${ORG_SLUG}/${PROJECT_SLUG}/plugins/webhooks/`,
      {
        urls: [DISCORD_WEBHOOK]
      }
    );

    console.log('   ✅ Webhook integration configured\n');
    return result;
  } catch (error) {
    // May already exist, that's OK
    if (error.message.includes('400')) {
      console.log('   ℹ️  Webhook integration already exists\n');
    } else {
      throw error;
    }
  }
}

/**
 * Update alert rule to include Discord webhook action
 */
async function updateAlertRule(rule) {
  console.log(`   Updating: ${rule.name} (ID: ${rule.id})`);

  // Check if webhook action already exists
  const hasWebhook = rule.actions.some(action =>
    action.id === 'sentry.rules.actions.notify_event_service.NotifyEventServiceAction'
  );

  if (hasWebhook) {
    console.log('     ℹ️  Already has webhook action, skipping');
    return rule;
  }

  // Add webhook action
  const updatedActions = [
    ...rule.actions,
    {
      id: 'sentry.rules.actions.notify_event_service.NotifyEventServiceAction',
      service: 'webhooks'
    }
  ];

  // Update the rule
  const updatedRule = await sentryRequest(
    'PUT',
    `/api/0/projects/${ORG_SLUG}/${PROJECT_SLUG}/rules/${rule.id}/`,
    {
      ...rule,
      actions: updatedActions
    }
  );

  console.log('     ✅ Added Discord notification');
  return updatedRule;
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Configure Discord Integration for Sentry              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Verify environment variables
  if (!SENTRY_TOKEN) {
    console.error('❌ SENTRY_TOKEN not found in environment');
    console.error('   Get it from: doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain');
    process.exit(1);
  }

  if (!DISCORD_WEBHOOK) {
    console.error('❌ DISCORD_SENTRY_WEBHOOK not found in environment');
    console.error('   Set it with: doppler secrets set DISCORD_SENTRY_WEBHOOK="your-webhook-url"');
    process.exit(1);
  }

  console.log('✅ Environment variables found');
  console.log(`   Organization: ${ORG_SLUG}`);
  console.log(`   Project: ${PROJECT_SLUG}`);
  console.log(`   Discord webhook: ${DISCORD_WEBHOOK.substring(0, 50)}...\n`);

  try {
    // Step 1: Add webhook integration
    await addWebhookIntegration();

    // Step 2: Get all alert rules
    const rules = await getAlertRules();

    // Step 3: Update each rule to include Discord
    console.log('🔄 Updating alert rules to include Discord notifications...\n');

    let updated = 0;
    let skipped = 0;

    for (const rule of rules) {
      try {
        const result = await updateAlertRule(rule);

        // Check if it was actually updated
        const hasWebhook = rule.actions.some(action =>
          action.id === 'sentry.rules.actions.notify_event_service.NotifyEventServiceAction'
        );

        if (hasWebhook) {
          skipped++;
        } else {
          updated++;
        }
      } catch (error) {
        console.log(`     ❌ Error: ${error.message}`);
      }
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              Discord Integration Complete! ✅                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`📊 Summary:`);
    console.log(`   • Total alert rules: ${rules.length}`);
    console.log(`   • Updated with Discord: ${updated}`);
    console.log(`   • Already had Discord: ${skipped}\n`);
    console.log('🎯 Next steps:');
    console.log('   1. Test the integration: node test/test-discord-webhook.js');
    console.log('   2. Trigger a test error: node test/test-sentry-connection.js');
    console.log('   3. Check your Discord channel for alerts');
    console.log('   4. View alerts in Sentry: https://sentry.io/organizations/integrity-studio/alerts/rules/\n');

  } catch (error) {
    console.error('\n❌ Configuration failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
