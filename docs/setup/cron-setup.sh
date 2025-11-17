#!/bin/bash

# Cron Job Setup for Log Cleanup
# This script helps set up automated log cleanup

echo "Setting up automated log cleanup..."

# The cron job command
CRON_COMMAND="0 2 * * * find /Users/alyshialedlie/code/jobs/logs -name '*.json' -mtime +30 -delete"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "jobs/logs"; then
    echo "❌ Cron job already exists for logs cleanup"
    echo "Current cron jobs:"
    crontab -l | grep "jobs/logs"
else
    echo "Adding cron job to cleanup logs older than 30 days..."
    echo "Command: $CRON_COMMAND"

    # Add to crontab
    (crontab -l 2>/dev/null; echo "$CRON_COMMAND") | crontab -

    if [ $? -eq 0 ]; then
        echo "✅ Cron job added successfully!"
        echo "Logs older than 30 days will be deleted daily at 2:00 AM"
    else
        echo "❌ Failed to add cron job"
        exit 1
    fi
fi

echo ""
echo "Current crontab:"
crontab -l

echo ""
echo "To remove this cron job later, run:"
echo "crontab -e"
echo "Then delete the line containing: jobs/logs"
