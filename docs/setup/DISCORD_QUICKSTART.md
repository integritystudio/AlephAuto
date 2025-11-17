# Discord Integration - Quick Start Guide

**Goal**: Get Sentry alerts in Discord in under 5 minutes ⚡

## Option 1: Quick Setup (Recommended)

### Step 1: Create Discord Webhook (2 minutes)

1. Open Discord → Go to your server
2. Right-click on channel (e.g., `#sentry-alerts`) → Edit Channel
3. Integrations → Webhooks → New Webhook
4. Name it "Sentry Alerts"
5. **Copy Webhook URL** (looks like `https://discord.com/api/webhooks/...`)

### Step 2: Add Webhook to Doppler (30 seconds)

```bash
doppler secrets set DISCORD_SENTRY_WEBHOOK="paste-your-webhook-url-here"
```

### Step 3: Test Discord Connection (30 seconds)

```bash
doppler run -- node test/test-discord-webhook.js
```

You should see 3 test messages in Discord! ✅

### Step 4: Configure Sentry Alerts (1 minute)

```bash
doppler run -- node ../setup/configure-discord-alerts.js
```

This automatically adds Discord to all your Sentry alert rules.

### Step 5: Test End-to-End (30 seconds)

```bash
node test/test-sentry-connection.js
```

Check Discord - you should see Sentry error alerts! 🎉

---

## Option 2: With Middleware (Beautiful Formatting)

If you want prettier Discord messages with custom formatting:

### Step 1-3: Same as Option 1

Follow steps 1-3 above.

### Step 4: Start Middleware Service

```bash
# Start with PM2
pm2 start ../setup/sentry-to-discord.js --name sentry-discord-bridge

# Or run directly for testing
doppler run -- node ../setup/sentry-to-discord.js
```

This creates a webhook endpoint at `http://localhost:3000/sentry-webhook`

### Step 5: Configure Sentry to Use Middleware

Instead of pointing directly to Discord, configure Sentry webhooks to:
- **URL**: `http://your-server:3000/sentry-webhook`
- This gives you full control over Discord message formatting

---

## Verification

### Check Configuration

```bash
# List Sentry alert rules
export SENTRY_TOKEN=$(doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain)
curl -s "https://sentry.io/api/0/projects/integrity-studio/node/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | jq '.[].name'
```

### Test Discord Webhook Manually

```bash
curl -X POST "$(doppler secrets get DISCORD_SENTRY_WEBHOOK --plain)" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message from command line"}'
```

---

## Troubleshooting

### "Webhook URL not found"

```bash
# Check if it's set
doppler secrets get DISCORD_SENTRY_WEBHOOK --plain

# If not, create Discord webhook and set it
doppler secrets set DISCORD_SENTRY_WEBHOOK="your-url"
```

### "Discord API error: 404"

Webhook URL is invalid or deleted. Create a new one in Discord.

### "Messages not appearing in Discord"

1. Check webhook is active in Discord: Channel Settings → Integrations
2. Verify URL is correct: `doppler secrets get DISCORD_SENTRY_WEBHOOK --plain`
3. Test manually with curl command above

### "Sentry not sending to Discord"

1. Verify webhook integration exists in Sentry
2. Check alert rules have webhook action
3. Trigger test error: `node test/test-sentry-connection.js`

---

## What You Get

Once configured, Sentry alerts will appear in Discord with:

- ✅ **Real-time notifications** for all configured alerts
- ✅ **Color-coded messages** (red for errors, orange for warnings, etc.)
- ✅ **Rich embeds** with error details, environment, component
- ✅ **Direct links** to Sentry dashboard
- ✅ **Team visibility** - everyone sees alerts instantly

---

## Alert Examples in Discord

### Error Alert
```
🚨 TypeError: Cannot read property 'map' of undefined

📊 Level: ERROR
🌍 Environment: production
🏷️ Component: repomix-worker
📍 Location: worker.js:245
🔗 View in Sentry: [Open Issue]
```

### High Error Rate Alert
```
⚠️ High Error Rate Detected

Error rate exceeded 100 errors/hour threshold

📊 Threshold: 100 errors/hour
📈 Current Rate: 157 errors/hour
🌍 Environment: production
```

---

## Quick Reference

```bash
# Test Discord webhook
doppler run -- node test/test-discord-webhook.js

# Configure Sentry alerts
doppler run -- node ../setup/configure-discord-alerts.js

# Test end-to-end
node test/test-sentry-connection.js

# Start middleware (optional)
pm2 start ../setup/sentry-to-discord.js --name sentry-discord-bridge

# View middleware logs
pm2 logs sentry-discord-bridge

# Stop middleware
pm2 stop sentry-discord-bridge
```

---

## Next Steps

After setup:

1. ✅ Monitor Discord channel for first real alerts
2. ✅ Adjust alert thresholds if needed (in Sentry UI)
3. ✅ Add team members to Discord channel
4. ⏳ Optional: Set up role mentions for critical alerts
5. ⏳ Optional: Create separate channels for different severities

---

**That's it!** You now have Sentry alerts flowing into Discord. 🎉

For detailed documentation, see: `../setup/DISCORD_SENTRY_INTEGRATION.md`
