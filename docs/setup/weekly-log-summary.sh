#!/bin/bash

# Weekly Log Summary Script
# Purpose: Generate weekly summary reports of log cleanup operations
# Usage: ./setup-files/weekly-log-summary.sh

set -euo pipefail

# Run the main cleanup script in weekly summary mode
/Users/alyshialedlie/code/jobs/setup-files/log-cleanup.sh --weekly-summary

echo ""
echo "Weekly summary generated successfully!"
echo "Check logs/cleanup-logs/ for the summary report"
