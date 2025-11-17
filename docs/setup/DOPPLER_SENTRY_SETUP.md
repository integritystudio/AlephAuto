# Setting Up Sentry with Doppler

Since you don't have a SENTRY_DSN in Doppler yet, here are your options:

## Option 1: Add Sentry DSN to Doppler (Recommended)

This keeps all your secrets centralized in Doppler.

### Step 1: Get Your Sentry DSN

1. Go to https://sentry.io/ (or create an account)
2. Create a new project:
   - Platform: **Node.js**
   - Project name: "job-automation" or similar
3. Copy your DSN (looks like: `https://abc123@o456.ingest.sentry.io/789`)

### Step 2: Add DSN to Doppler

```bash
# Add the Sentry DSN to Doppler
doppler secrets set SENTRY_DSN="your_actual_sentry_dsn_here" \
  --project integrity-studio \
  --config dev
```

### Step 3: Pull Secrets from Doppler

```bash
# Pull the DSN from Doppler and update local .env
doppler secrets get SENTRY_DSN \
  --project integrity-studio \
  --config dev \
  --plain > /tmp/sentry_dsn.txt

# Update .env file
SENTRY_DSN=$(cat /tmp/sentry_dsn.txt)
sed -i.bak "s|SENTRY_DSN=.*|SENTRY_DSN=$SENTRY_DSN|" .env
rm /tmp/sentry_dsn.txt

echo "✅ .env updated with Sentry DSN from Doppler"
```

### Step 4: Run with Doppler (Optional)

Instead of using .env, run directly with Doppler:

```bash
# Run repomix cron with Doppler
doppler run --project integrity-studio --config dev -- npm start

# Run docs enhancement with Doppler
doppler run --project integrity-studio --config dev -- npm run docs:enhance
```

## Option 2: Quick Local Setup (No Doppler)

If you want to get started quickly without Doppler:

### Step 1: Get Your Sentry DSN

1. Visit https://sentry.io/signup/
2. Create account (free tier available)
3. Create project (Node.js)
4. Copy your DSN

### Step 2: Update .env Directly

```bash
# Manually edit .env
nano .env

# Or use sed to replace:
sed -i '' 's|SENTRY_DSN=your_sentry_dsn_here|SENTRY_DSN=https://your-actual-dsn@sentry.io/project-id|' .env
```

### Step 3: Test Connection

```bash
npm run setup:sentry
# Choose "Test connection"
```

## Option 3: Use Existing Sentry Project

If you already have a Sentry project in the integrity-studio workspace:

1. Go to https://sentry.io/
2. Select your organization
3. Find existing project or create new one
4. Settings → Client Keys (DSN)
5. Copy the DSN
6. Follow Option 1 or Option 2 above

## Automated Script

I can create a script to help you set this up. Run:

```bash
node setup-doppler-sentry.js
```

This will:
1. Prompt you for your Sentry DSN
2. Add it to Doppler
3. Update your local .env
4. Test the connection

## Which Option Do You Prefer?

Let me know which approach you'd like to take:
- **A**: Add to Doppler (most organized)
- **B**: Quick local setup
- **C**: Use existing Sentry project

Then I can help you complete the setup!
