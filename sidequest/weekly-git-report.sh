#!/bin/bash
#
# Weekly Git Activity Report Generator
#
# This script automates the collection of git activity data and generates
# visualizations for a weekly development summary.
#
# Usage:
#   ./weekly-git-report.sh                    # Run for last 7 days
#   ./weekly-git-report.sh --monthly          # Run for last 30 days
#   ./weekly-git-report.sh --since 2025-07-07 # Custom start date
#
# Cron setup (every Sunday at 8 PM):
#   0 20 * * 0 ~/code/jobs/sidequest/weekly-git-report.sh >> ~/code/jobs/sidequest/logs/git-report.log 2>&1
#

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PERSONALSITE_DIR="$HOME/code/PersonalSite"
LOG_DIR="$SCRIPT_DIR/logs"
PYTHON_SCRIPT="$SCRIPT_DIR/collect_git_activity.py"
CONFIG_FILE="$SCRIPT_DIR/git-report-config.json"

# Create log directory
mkdir -p "$LOG_DIR"

# Logging
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/git-report-$TIMESTAMP.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

# Parse arguments
MODE="weekly"
CUSTOM_START_DATE=""
CUSTOM_END_DATE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --weekly)
            MODE="weekly"
            shift
            ;;
        --monthly)
            MODE="monthly"
            shift
            ;;
        --since)
            CUSTOM_START_DATE="$2"
            shift 2
            ;;
        --until)
            CUSTOM_END_DATE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--weekly|--monthly|--since DATE|--until DATE]"
            echo ""
            echo "Options:"
            echo "  --weekly        Generate report for last 7 days (default)"
            echo "  --monthly       Generate report for last 30 days"
            echo "  --since DATE    Custom start date (YYYY-MM-DD)"
            echo "  --until DATE    Custom end date (YYYY-MM-DD)"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Calculate date range
if [[ -n "$CUSTOM_START_DATE" ]]; then
    START_DATE="$CUSTOM_START_DATE"
    END_DATE="${CUSTOM_END_DATE:-$(date +%Y-%m-%d)}"
    log "Using custom date range: $START_DATE to $END_DATE"
elif [[ "$MODE" == "monthly" ]]; then
    START_DATE=$(date -d '30 days ago' +%Y-%m-%d 2>/dev/null || date -v-30d +%Y-%m-%d)
    END_DATE=$(date +%Y-%m-%d)
    log "Monthly report: $START_DATE to $END_DATE"
else
    START_DATE=$(date -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d)
    END_DATE=$(date +%Y-%m-%d)
    log "Weekly report: $START_DATE to $END_DATE"
fi

# Check if Python script exists
if [[ ! -f "$PYTHON_SCRIPT" ]]; then
    log_error "Python script not found: $PYTHON_SCRIPT"
    exit 1
fi

# Check if PersonalSite directory exists
if [[ ! -d "$PERSONALSITE_DIR" ]]; then
    log_error "PersonalSite directory not found: $PERSONALSITE_DIR"
    exit 1
fi

# Run data collection
log "Starting git activity data collection..."
log "Running: python3 $PYTHON_SCRIPT --start-date $START_DATE --end-date $END_DATE"

YEAR=$(date +%Y)
OUTPUT_DIR="$PERSONALSITE_DIR/assets/images/git-activity-$YEAR"
JSON_OUTPUT="/tmp/git_activity_weekly_$TIMESTAMP.json"

if python3 "$PYTHON_SCRIPT" \
    --start-date "$START_DATE" \
    --end-date "$END_DATE" \
    --output-dir "$OUTPUT_DIR" \
    --json-output "$JSON_OUTPUT" \
    2>&1 | tee -a "$LOG_FILE"; then
    log "✅ Data collection completed successfully"
    log "JSON data saved to: $JSON_OUTPUT"
    log "Visualizations saved to: $OUTPUT_DIR"
else
    log_error "Data collection failed"
    exit 1
fi

# Optional: Auto-commit visualizations (commented out by default)
# Uncomment if you want automatic commits
#
# log "Committing visualizations..."
# cd "$PERSONALSITE_DIR"
# git add assets/images/git-activity-$YEAR/*.svg
# git commit -m "Update weekly git activity visualizations: $START_DATE to $END_DATE
#
# 🤖 Generated with [Claude Code](https://claude.com/claude-code)
#
# Co-Authored-By: Claude <noreply@anthropic.com>"
# git push origin master

# Generate summary
log ""
log "=========================================="
log "Git Activity Report Summary"
log "=========================================="
log "Date range: $START_DATE to $END_DATE"
log "JSON data: $JSON_OUTPUT"
log "Visualizations: $OUTPUT_DIR"
log "Log file: $LOG_FILE"
log "=========================================="
log ""

# Check if we should notify (for cron jobs)
if [[ -n "${SEND_NOTIFICATION:-}" ]]; then
    log "Sending notification..."
    # Add your notification command here (e.g., email, Slack, Discord)
    # Example: echo "Git report ready: $JSON_OUTPUT" | mail -s "Weekly Git Report" you@example.com
fi

log "✅ Weekly git report generation complete!"

# Keep only last 10 log files
cd "$LOG_DIR"
ls -t git-report-*.log | tail -n +11 | xargs -r rm --

exit 0
