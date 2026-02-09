#!/bin/bash
# Launch BugfixAudit - schedules execution for tonight at 1 AM
# Thin wrapper around the integrated pipeline runner
set -e

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

echo "BugfixAudit - Automated Bug Detection & Fixing"
echo "================================================"
echo ""
echo "Launching via integrated pipeline runner..."
echo ""

npm run bugfix:tonight
