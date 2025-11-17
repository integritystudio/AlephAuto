# Sentry Error Monitoring Setup Guide

Complete guide for setting up Sentry error monitoring and alerting for your automated job system.

## Quick Setup (5 minutes)

### Option 1: Interactive Setup (Recommended)

Run the automated setup script:

```bash
npm run setup:sentry
```

This will guide you through:
1. Creating/using a Sentry account
2. Getting your DSN
3. Updating the `.env` file
4. Testing the connection

### Option 2: Manual Setup

1. **Create Sentry Account** (if you don't have one)
   - Visit: https://sentry.io/signup/
   - Sign up (free tier available)

2. **Create a New Project**
   - Click "Create Project"
   - Platform: **Node.js**
   - Alert frequency: **On every new issue** (recommended)
   - Project name: "job-automation" or your preferred name

3. **Get Your DSN**
   - Go to Settings → Projects → [Your Project]
   - Click "Client Keys (DSN)"
   - Copy the DSN (looks like: `https://abc123@o123.ingest.sentry.io/456`)

4. **Update `.env` File**
   ```bash
   # Edit .env and replace:
   SENTRY_DSN=your_actual_dsn_here
   ```

5. **Test the Connection**
   ```bash
   node test/test-sentry-connection.js
   ```

## What Gets Monitored

### Automatic Error Tracking

All errors from these sources are automatically captured:

1. **Repomix Jobs**
   - Command failures
   - Permission errors
   - File system issues
   - Process timeouts

2. **Documentation Enhancement Jobs**
   - README parsing errors
   - Schema validation failures
   - File write errors
   - MCP tool errors

3. **Directory Scanning**
   - Permission denied errors
   - Invalid path errors
   - File system errors

### Performance Monitoring

Sentry tracks performance for:
- Job execution time
- Queue processing time
- File operations
- Schema generation

### Error Context

Each error includes:
- Job ID and type
- File paths involved
- User context
- Environment info
- Breadcrumbs (recent actions)
- Stack traces

## Sentry Dashboard Features

### Issues Tab
View all errors grouped by:
- Error type
- Frequency
- First seen / Last seen
- Affected users (if applicable)

### Performance Tab
Monitor:
- Transaction duration
- Throughput
- Error rate
- Apdex score

### Releases Tab
Track errors by version:
- Error trends per release
- Regression detection
- Deploy tracking

## Setting Up Alerts

### Recommended Alerts

1. **Critical Job Failures**
   ```
   Alert: When any issue is first seen
   Notify: Email + Slack (if configured)
   ```

2. **High Error Rate**
   ```
   Alert: When error count > 10 in 5 minutes
   Notify: Email
   ```

3. **Performance Degradation**
   ```
   Alert: When p95 transaction duration > 30s
   Notify: Email
   ```

### Configure Alerts in Sentry

1. Go to **Alerts** → **Create Alert**
2. Choose trigger:
   - Issue Alert (for errors)
   - Metric Alert (for performance)
3. Set conditions:
   - "When an issue is first seen"
   - "When the issue is seen more than 10 times in 1 hour"
   - etc.
4. Choose notification method:
   - Email
   - Slack
   - PagerDuty
   - Webhooks

## Integration with Slack (Optional)

1. Go to **Settings** → **Integrations**
2. Find **Slack** and click "Add to Slack"
3. Authorize the integration
4. Choose which Slack channel receives alerts
5. Configure alert rules

## Best Practices

### 1. Set Appropriate Alert Thresholds

```javascript
// Good thresholds:
- First occurrence: Always alert
- Recurring errors: Alert after 5 occurrences
- Performance: Alert if p95 > 2x normal
```

### 2. Use Environments

```javascript
// In your code (already configured):
NODE_ENV=production  // Production alerts
NODE_ENV=development // Development (less noisy)
```

### 3. Add Custom Context

The system automatically adds context, but you can enhance it:

```javascript
// Example of what's already included:
{
  tags: {
    jobId: 'repomix-project-123',
    jobType: 'repomix',
  },
  contexts: {
    job: {
      sourceDir: '/path/to/source',
      outputDir: '/path/to/output',
    }
  }
}
```

### 4. Filter Noise

Create filters in Sentry to ignore:
- Permission errors for excluded directories
- Expected timeouts
- Development environment errors

**Settings** → **Inbound Filters**:
```
Ignore errors from:
- node_modules paths
- .git directories
- Test runs
```

### 5. Set Up Release Tracking

Tag errors by version:

```bash
# When deploying:
export SENTRY_RELEASE="jobs@1.0.0"

# Sentry will track errors by release
```

## Testing Your Setup

### Test Error Capture

```bash
# Create a test error:
node test/test-sentry-connection.js
```

This sends a test error to Sentry. Check your dashboard to verify it appears.

### Test Performance Monitoring

Run a job and check the Performance tab:

```bash
npm run test:single
```

You should see transaction data in Sentry.

## Viewing Errors

### In Real-Time

1. Open Sentry dashboard: https://sentry.io/
2. Select your project
3. Errors appear in the **Issues** stream
4. Click any error to see:
   - Stack trace
   - Breadcrumbs (what led to the error)
   - Context data
   - Affected users/sessions

### Via Email

- Configured alerts send emails with:
  - Error summary
  - Link to full details
  - Suggested fixes (AI-powered)

## Troubleshooting

### No Errors Appearing

1. **Check DSN**
   ```bash
   # Verify DSN is set:
   cat .env | grep SENTRY_DSN
   ```

2. **Test Connection**
   ```bash
   npm run setup:sentry
   # Choose "Test connection"
   ```

3. **Check Network**
   - Ensure firewall allows outbound HTTPS
   - Verify `sentry.io` is accessible

### Too Many Alerts

1. **Adjust Thresholds**
   - Go to Alert Rules
   - Increase occurrence thresholds
   - Add filters for known issues

2. **Use Environments**
   ```bash
   # Only alert on production:
   NODE_ENV=production npm start
   ```

3. **Snooze Repetitive Issues**
   - In Sentry, click issue
   - Click "Ignore" or "Snooze"

## Cost Considerations

### Free Tier Limits

Sentry free tier includes:
- 5,000 errors/month
- 10,000 performance units/month
- 1 user
- 30 day retention

For this job system:
- **Typical usage**: ~100-500 errors/month (with normal operation)
- **Performance**: ~1,000 transactions/month
- **Well within free tier** ✅

### If You Exceed Free Tier

Options:
1. **Filter noisy errors** (recommended)
2. **Upgrade to paid plan** ($26/month)
3. **Use sampling** (capture 10% of errors)

### Configure Sampling

Edit `sidequest/server.js`:

```javascript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,  // Capture 10% of transactions
});
```

## Advanced Features

### Custom Breadcrumbs

Already configured in the codebase:

```javascript
Sentry.addBreadcrumb({
  category: 'job',
  message: 'Job started',
  level: 'info',
});
```

### User Feedback

Capture user feedback on errors:
- Available in Sentry SDK
- Can be added to failed job reports

### Session Tracking

Tracks:
- Job run sessions
- Crash-free rate
- Session duration

## Support Resources

- **Sentry Docs**: https://docs.sentry.io/platforms/node/
- **Status Page**: https://status.sentry.io/
- **Community Forum**: https://forum.sentry.io/
- **Discord**: https://discord.gg/sentry

## Quick Reference

```bash
# Setup Sentry
npm run setup:sentry

# Test connection
node test/test-sentry-connection.js

# View logs with Sentry context
tail -f logs/*.error.json

# Check Sentry dashboard
open https://sentry.io/

# Update DSN
vim .env  # Edit SENTRY_DSN
```

## Next Steps After Setup

1. ✅ Set up initial alerts
2. ✅ Connect Slack (optional)
3. ✅ Run a test job to verify
4. ✅ Monitor dashboard for first few days
5. ✅ Adjust alert thresholds based on noise
6. ✅ Set up weekly reports (Sentry feature)

---

**Note**: All job errors are automatically captured. No code changes needed after initial setup!
