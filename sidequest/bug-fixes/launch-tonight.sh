#!/bin/bash

# Launch script for BugfixAudit - Automated Bug Detection & Fixing
# Schedules execution for tonight at 1 AM

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🤖 BugfixAudit - Automated Bug Detection & Fixing"
echo "=================================================="
echo ""

# Check if npm packages are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
    echo ""
fi

# Check for required tools
echo "🔍 Checking required tools..."

if ! command -v git &> /dev/null; then
    echo "❌ git is not installed"
    exit 1
fi
echo "  ✅ git"

if ! command -v gh &> /dev/null; then
    echo "❌ gh CLI is not installed"
    echo "   Install with: brew install gh"
    exit 1
fi
echo "  ✅ gh"

if ! command -v doppler &> /dev/null; then
    echo "❌ doppler is not installed"
    echo "   Install with: brew install dopplerhq/cli/doppler"
    exit 1
fi
echo "  ✅ doppler"

if ! command -v node &> /dev/null; then
    echo "❌ node is not installed"
    exit 1
fi
echo "  ✅ node $(node --version)"

echo ""

# Calculate time until 1 AM
current_hour=$(date +%H)
current_minute=$(date +%M)

if [ "$current_hour" -lt 1 ]; then
    hours_until=$((1 - current_hour))
    minutes_until=$((60 - current_minute))
else
    hours_until=$((25 - current_hour))
    minutes_until=$((60 - current_minute))
fi

echo "⏰ Scheduling execution for tonight at 1:00 AM"
echo "   Current time: $(date '+%H:%M')"
echo "   Time until execution: ${hours_until}h ${minutes_until}m"
echo ""
echo "📋 Workflow:"
echo "   1. Scan ~/dev/active for markdown files"
echo "   2. Create git branches for each project"
echo "   3. Run analysis: bugfix-planner, bug-detective, audit, quality-controller"
echo "   4. Implement fixes with refractor"
echo "   5. Commit after each stage"
echo "   6. Create pull requests"
echo ""
echo "📂 Output will be saved to:"
echo "   ~/code/jobs/sidequest/bug-fixes/output/"
echo ""
echo "🚀 Starting background process..."
echo ""

# Run in background and detach
nohup npm run start:once > logs/bugfix-audit-$(date +%Y%m%d-%H%M%S).log 2>&1 &

PID=$!

echo "✅ Process started with PID: $PID"
echo ""
echo "📊 Monitor progress:"
echo "   tail -f logs/bugfix-audit-*.log"
echo ""
echo "🛑 Stop execution:"
echo "   kill $PID"
echo ""
echo "💤 The process will run at 1 AM and then exit."
echo "   You can close this terminal."
echo ""
