#!/bin/bash

# Enhanced Log Cleanup Script with Logging, Archiving, and Summary Generation
# Purpose: Clean up old log files with comprehensive tracking and archiving
# Usage: ./setup-files/log-cleanup.sh [--dry-run] [--weekly-summary]

set -euo pipefail

# Configuration
LOGS_DIR="/Users/alyshialedlie/code/jobs/logs"
ARCHIVE_DIR="${LOGS_DIR}/archive"
CLEANUP_LOG_DIR="${LOGS_DIR}/cleanup-logs"
RETENTION_DAYS=30
ARCHIVE_IMPORTANT_LOGS=true

# Timestamp for this run
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="${CLEANUP_LOG_DIR}/cleanup-${TIMESTAMP}.log"

# Ensure directories exist
mkdir -p "${ARCHIVE_DIR}"
mkdir -p "${CLEANUP_LOG_DIR}"

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# Parse arguments
DRY_RUN=false
WEEKLY_SUMMARY=false
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            ;;
        --weekly-summary)
            WEEKLY_SUMMARY=true
            ;;
    esac
done

# Start logging
log_info "=========================================="
log_info "Log Cleanup Started"
log_info "Timestamp: $TIMESTAMP"
log_info "Dry Run: $DRY_RUN"
log_info "Weekly Summary: $WEEKLY_SUMMARY"
log_info "Retention Days: $RETENTION_DAYS"
log_info "=========================================="

# Function to check if a log file is "important"
is_important_log() {
    local file="$1"
    local filename=$(basename "$file")

    # Mark files as important if they contain errors OR are from specific important jobs
    if [[ "$filename" == *.error.json ]]; then
        return 0  # Important (error log)
    fi

    # Check for specific patterns that indicate important logs
    if grep -q "\"status\":\"failed\"" "$file" 2>/dev/null; then
        return 0  # Important (failed job)
    fi

    if grep -q "\"error\":" "$file" 2>/dev/null; then
        return 0  # Important (contains error)
    fi

    return 1  # Not important
}

# Archive important logs
archive_important_logs() {
    log_info "Scanning for important logs to archive..."

    local archived_count=0
    local archive_date_dir="${ARCHIVE_DIR}/${TIMESTAMP}"

    if [ "$ARCHIVE_IMPORTANT_LOGS" = true ]; then
        mkdir -p "$archive_date_dir"

        # Find logs older than retention period
        while IFS= read -r -d '' file; do
            if is_important_log "$file"; then
                if [ "$DRY_RUN" = false ]; then
                    # Create subdirectory structure in archive
                    local relative_path="${file#$LOGS_DIR/}"
                    local archive_path="${archive_date_dir}/${relative_path}"
                    local archive_subdir=$(dirname "$archive_path")

                    mkdir -p "$archive_subdir"
                    cp "$file" "$archive_path"
                    ((archived_count++))
                    log_info "Archived: $relative_path"
                else
                    ((archived_count++))
                    log_info "[DRY RUN] Would archive: ${file#$LOGS_DIR/}"
                fi
            fi
        done < <(find "$LOGS_DIR" -name "*.json" -type f -mtime "+$RETENTION_DAYS" -print0 2>/dev/null)

        log_success "Archived $archived_count important log files"
    else
        log_info "Archiving disabled, skipping..."
    fi
}

# Count logs by type
count_logs() {
    log_info "Counting logs..."

    local total_logs=$(find "$LOGS_DIR" -name "*.json" -type f ! -path "*/archive/*" ! -path "*/cleanup-logs/*" 2>/dev/null | wc -l | tr -d ' ')
    local error_logs=$(find "$LOGS_DIR" -name "*.error.json" -type f ! -path "*/archive/*" ! -path "*/cleanup-logs/*" 2>/dev/null | wc -l | tr -d ' ')
    local old_logs=$(find "$LOGS_DIR" -name "*.json" -type f -mtime "+$RETENTION_DAYS" ! -path "*/archive/*" ! -path "*/cleanup-logs/*" 2>/dev/null | wc -l | tr -d ' ')
    local old_error_logs=$(find "$LOGS_DIR" -name "*.error.json" -type f -mtime "+$RETENTION_DAYS" ! -path "*/archive/*" ! -path "*/cleanup-logs/*" 2>/dev/null | wc -l | tr -d ' ')

    log_info "Total logs: $total_logs"
    log_info "Error logs: $error_logs"
    log_info "Logs older than $RETENTION_DAYS days: $old_logs"
    log_info "Old error logs: $old_error_logs"

    # Return values via global variables for summary
    TOTAL_LOGS=$total_logs
    ERROR_LOGS=$error_logs
    OLD_LOGS=$old_logs
    OLD_ERROR_LOGS=$old_error_logs
}

# Delete old logs
delete_old_logs() {
    log_info "Deleting logs older than $RETENTION_DAYS days..."

    local deleted_count=0

    if [ "$DRY_RUN" = false ]; then
        # Delete old logs (excluding archive and cleanup-logs directories)
        while IFS= read -r -d '' file; do
            rm "$file"
            ((deleted_count++))
        done < <(find "$LOGS_DIR" -name "*.json" -type f -mtime "+$RETENTION_DAYS" ! -path "*/archive/*" ! -path "*/cleanup-logs/*" -print0 2>/dev/null)

        log_success "Deleted $deleted_count log files"
    else
        deleted_count=$(find "$LOGS_DIR" -name "*.json" -type f -mtime "+$RETENTION_DAYS" ! -path "*/archive/*" ! -path "*/cleanup-logs/*" 2>/dev/null | wc -l | tr -d ' ')
        log_info "[DRY RUN] Would delete $deleted_count log files"
    fi

    DELETED_COUNT=$deleted_count
}

# Calculate disk space
calculate_disk_space() {
    log_info "Calculating disk space usage..."

    local logs_size=$(du -sh "$LOGS_DIR" 2>/dev/null | awk '{print $1}')
    local archive_size=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | awk '{print $1}')

    log_info "Total logs directory size: $logs_size"
    log_info "Archive directory size: $archive_size"

    LOGS_SIZE=$logs_size
    ARCHIVE_SIZE=$archive_size
}

# Generate summary
generate_summary() {
    log_info "=========================================="
    log_info "Cleanup Summary"
    log_info "=========================================="
    log_info "Total logs before cleanup: $TOTAL_LOGS"
    log_info "Error logs: $ERROR_LOGS"
    log_info "Logs marked for deletion: $OLD_LOGS"
    log_info "Important logs archived: ${archived_count:-0}"
    log_info "Logs deleted: $DELETED_COUNT"
    log_info "Logs directory size: $LOGS_SIZE"
    log_info "Archive directory size: $ARCHIVE_SIZE"
    log_info "=========================================="

    # Create JSON summary
    cat > "${CLEANUP_LOG_DIR}/summary-${TIMESTAMP}.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "dryRun": $DRY_RUN,
  "retentionDays": $RETENTION_DAYS,
  "totalLogs": $TOTAL_LOGS,
  "errorLogs": $ERROR_LOGS,
  "oldLogs": $OLD_LOGS,
  "oldErrorLogs": $OLD_ERROR_LOGS,
  "archivedLogs": ${archived_count:-0},
  "deletedLogs": $DELETED_COUNT,
  "logsDirSize": "$LOGS_SIZE",
  "archiveDirSize": "$ARCHIVE_SIZE"
}
EOF

    log_success "Summary saved to: ${CLEANUP_LOG_DIR}/summary-${TIMESTAMP}.json"
}

# Weekly summary function
generate_weekly_summary() {
    log_info "Generating weekly summary..."

    # Find all summaries from the last 7 days
    local weekly_summary_file="${CLEANUP_LOG_DIR}/weekly-summary-${TIMESTAMP}.md"

    cat > "$weekly_summary_file" <<EOF
# Weekly Log Cleanup Summary

**Generated**: $(date +'%Y-%m-%d %H:%M:%S')
**Period**: Last 7 days

## Summary Statistics

EOF

    # Aggregate data from recent cleanup runs
    local total_deleted=0
    local total_archived=0
    local cleanup_runs=0

    while IFS= read -r summary_file; do
        if [ -f "$summary_file" ]; then
            local deleted=$(grep -o '"deletedLogs": [0-9]*' "$summary_file" | grep -o '[0-9]*')
            local archived=$(grep -o '"archivedLogs": [0-9]*' "$summary_file" | grep -o '[0-9]*')

            total_deleted=$((total_deleted + deleted))
            total_archived=$((total_archived + archived))
            ((cleanup_runs++))
        fi
    done < <(find "$CLEANUP_LOG_DIR" -name "summary-*.json" -type f -mtime -7 2>/dev/null)

    cat >> "$weekly_summary_file" <<EOF
- **Cleanup runs**: $cleanup_runs
- **Total logs deleted**: $total_deleted
- **Total logs archived**: $total_archived
- **Current logs directory size**: $LOGS_SIZE
- **Archive directory size**: $ARCHIVE_SIZE

## Recent Cleanup Runs

EOF

    # List recent runs
    find "$CLEANUP_LOG_DIR" -name "cleanup-*.log" -type f -mtime -7 2>/dev/null | sort -r | head -10 | while read -r log_file; do
        local log_date=$(basename "$log_file" | sed 's/cleanup-//;s/.log//')
        echo "- $log_date" >> "$weekly_summary_file"
    done

    cat >> "$weekly_summary_file" <<EOF

## Log Health Metrics

- **Error rate**: $(awk "BEGIN {printf \"%.1f\", ($ERROR_LOGS / $TOTAL_LOGS) * 100}")%
- **Old logs**: $OLD_LOGS ($(awk "BEGIN {printf \"%.1f\", ($OLD_LOGS / $TOTAL_LOGS) * 100}")%)

## Recommendations

EOF

    # Add recommendations based on metrics
    local error_rate=$(awk "BEGIN {printf \"%.0f\", ($ERROR_LOGS / $TOTAL_LOGS) * 100}")

    if [ "$error_rate" -gt 20 ]; then
        echo "- ⚠️  Error rate is high ($error_rate%). Consider investigating error patterns." >> "$weekly_summary_file"
    else
        echo "- ✅ Error rate is acceptable ($error_rate%)." >> "$weekly_summary_file"
    fi

    if [ "$OLD_LOGS" -gt 1000 ]; then
        echo "- ⚠️  Large number of old logs ($OLD_LOGS). Consider running cleanup more frequently." >> "$weekly_summary_file"
    else
        echo "- ✅ Old log count is manageable ($OLD_LOGS)." >> "$weekly_summary_file"
    fi

    log_success "Weekly summary saved to: $weekly_summary_file"
}

# Main execution
main() {
    count_logs
    calculate_disk_space

    if [ "$WEEKLY_SUMMARY" = true ]; then
        generate_weekly_summary
    else
        archive_important_logs
        delete_old_logs
        generate_summary
    fi

    log_info "=========================================="
    log_info "Log Cleanup Completed"
    log_info "Log file: $LOG_FILE"
    log_info "=========================================="
}

# Run main function
main

# Clean up old cleanup logs (keep last 90 days)
find "$CLEANUP_LOG_DIR" -name "cleanup-*.log" -type f -mtime +90 -delete 2>/dev/null || true
find "$CLEANUP_LOG_DIR" -name "summary-*.json" -type f -mtime +90 -delete 2>/dev/null || true
find "$CLEANUP_LOG_DIR" -name "weekly-summary-*.md" -type f -mtime +90 -delete 2>/dev/null || true
