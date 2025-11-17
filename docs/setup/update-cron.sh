#!/bin/bash

# Update Cron Job to Use Enhanced Log Cleanup Script
# This script updates the existing cron job to use the new enhanced cleanup script

set -euo pipefail

echo "Updating cron job to use enhanced log cleanup..."

# Remove old cron job
crontab -l 2>/dev/null | grep -v "jobs/logs.*delete" > /tmp/crontab_temp || true

# Add new cron jobs
cat >> /tmp/crontab_temp <<EOF
# Log cleanup - runs daily at 2:00 AM
0 2 * * * /bin/bash /Users/alyshialedlie/code/jobs/setup-files/log-cleanup.sh >> /Users/alyshialedlie/code/jobs/logs/cleanup-logs/cron-output.log 2>&1
# Weekly summary - runs every Monday at 3:00 AM
0 3 * * 1 /bin/bash /Users/alyshialedlie/code/jobs/setup-files/weekly-log-summary.sh >> /Users/alyshialedlie/code/jobs/logs/cleanup-logs/cron-output.log 2>&1
EOF

# Install new crontab
crontab /tmp/crontab_temp

# Clean up temp file
rm /tmp/crontab_temp

echo "✅ Cron jobs updated successfully!"
echo ""
echo "New cron schedule:"
crontab -l | grep -E "jobs|summary"
echo ""
echo "The following jobs will run automatically:"
echo "  - Daily cleanup: 2:00 AM (deletes logs >30 days, archives important logs)"
echo "  - Weekly summary: 3:00 AM every Monday"
echo ""
echo "Logs will be saved to: logs/cleanup-logs/"
