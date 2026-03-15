# Discord Integration - Quick Start

## Option 1: Direct Webhook (Recommended)

1. Discord: right-click channel > Edit Channel > Integrations > Webhooks > New Webhook > copy URL
2. Store in Doppler:
   ```bash
   doppler secrets set DISCORD_SENTRY_WEBHOOK="paste-your-webhook-url-here"
   ```
3. Test:
   ```bash
   doppler run -- node test/test-discord-webhook.js
   ```
4. Configure Sentry alerts:
   ```bash
   doppler run -- node ../setup/configure-discord-alerts.js
   ```
5. Verify end-to-end:
   ```bash
   node test/test-sentry-connection.js
   ```

## Option 2: With Middleware (Custom Formatting)

Follow steps 1-3 above, then start the middleware service:

```bash
pm2 start ../setup/sentry-to-discord.js --name sentry-discord-bridge

# Or run directly for testing
doppler run -- node ../setup/sentry-to-discord.js
```

Configure Sentry webhooks to point at `http://your-server:3000/sentry-webhook` instead of Discord directly.

## Verification

```bash
# List Sentry alert rules
export SENTRY_TOKEN=$(doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain)
curl -s "https://sentry.io/api/0/projects/integrity-studio/node/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | jq '.[].name'

# Test Discord webhook manually
curl -X POST "$(doppler secrets get DISCORD_SENTRY_WEBHOOK --plain)" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message from command line"}'
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Webhook URL not found | `doppler secrets set DISCORD_SENTRY_WEBHOOK="your-url"` |
| Discord API 404 | Webhook deleted; create a new one in Discord |
| Messages not appearing | Verify webhook is active in Channel Settings > Integrations; test with curl above |
| Sentry not sending | Check alert rules have webhook action; trigger test: `node test/test-sentry-connection.js` |

## Quick Reference

```bash
doppler run -- node test/test-discord-webhook.js          # Test webhook
doppler run -- node ../setup/configure-discord-alerts.js   # Configure alerts
node test/test-sentry-connection.js                        # Test end-to-end
pm2 start ../setup/sentry-to-discord.js --name sentry-discord-bridge  # Start middleware
pm2 logs sentry-discord-bridge                             # View middleware logs
```

For detailed documentation, see: `DISCORD_SENTRY_INTEGRATION.md`
